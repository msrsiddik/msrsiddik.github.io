// Cloudflare Worker: free-tier AI chat proxy for the portfolio hero panel.
// Holds provider API keys as secrets and never exposes them to the browser.
// Tries providers in order (Workers AI -> Gemini -> HuggingFace) and falls
// through to the next on any failure or quota exhaustion.

const MAX_QUESTION_LEN = 500;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 8; // requests per IP per window
const CONTEXT_CACHE_TTL = 300; // seconds

const rateLimitBuckets = new Map(); // ip -> [timestamps]

function corsHeaders(origin, allowedOrigins) {
  const allowed = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = (rateLimitBuckets.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  bucket.push(now);
  rateLimitBuckets.set(ip, bucket);
  return bucket.length > RATE_LIMIT_MAX;
}

async function fetchContext(baseUrl, lang) {
  const path = lang === "bn" ? "/bn/ai-context.json" : "/ai-context.json";
  const res = await fetch(baseUrl + path, { cf: { cacheTtl: CONTEXT_CACHE_TTL, cacheEverything: true } });
  if (!res.ok) throw new Error("context fetch failed: " + res.status);
  return res.json();
}

function buildSystemPrompt(context, lang) {
  const bn = lang === "bn";
  const intro = bn
    ? "Tumi Siddiqur Rahman-er hoye kotha bolcho — ekjon knowledgeable colleague-er moto je tar kaj, experience ar projects bhalo kore jane. Third person e bolo (jemon 'Siddiqur Go te backend banai'). Nijeke kokhono bot, AI, ba website assistant bole porichoy dio na. Company ar product-er naam (jemon Orocube, Siiopa, Medlogics, FloreantPOS, ApiCoreX) shobshomoy original English spelling-e likho — kokhono Bangla script-e transliterate/translate korbe na. Niche deya information use kore short, warm, confident answer dao — beshi boro na, marketing-er moto shona jeno na. Markdown use korte paro (bold, list, link). Jodi kono kichu information-e na thake, honestly bolo je tumi jano na, ar Siddiqur-ke direct email korte bolo."
    : "You speak on behalf of Siddiqur Rahman, like a knowledgeable colleague who knows his work, experience, and projects well. Speak about him in the third person (e.g. \"Siddiqur builds backends in Go\"). Never introduce yourself as a bot, an AI, or a website assistant. Use the information below to give short, warm, confident answers — keep them concise and avoid sounding like marketing copy. You may use light Markdown (bold, lists, links). If something isn't covered, say so honestly and suggest emailing Siddiqur directly.";

  const parts = [
    intro,
    `\n\n--- About ---\n${context.about}`,
    `\n\n--- Skills ---\n${(context.skills || []).join("\n")}`,
    `\n\n--- Experience ---\n${(context.experience || []).join("\n")}`,
    `\n\n--- Projects ---\n${(context.projects || []).join("\n")}`,
  ];
  if ((context.github_repos || []).length) {
    parts.push(`\n\n--- GitHub Repositories ---\n${context.github_repos.join("\n")}`);
  }
  if ((context.education || []).length) {
    parts.push(`\n\n--- Education ---\n${context.education.join("\n")}`);
  }
  if ((context.certifications || []).length) {
    parts.push(`\n\n--- Certifications ---\n${context.certifications.join("\n")}`);
  }
  if (context.availability) {
    parts.push(`\n\n--- Availability ---\n${context.availability}`);
  }
  const contactLines = [`Email: ${context.email}`];
  if (context.whatsapp) contactLines.push(`WhatsApp: ${context.whatsapp}`);
  parts.push(`\n\n--- Contact ---\n${contactLines.join("\n")}`);
  return parts.join("");
}

// Each provider exposes `stream(env, systemPrompt, question)` returning an
// async iterable of text chunks. A provider that can't start (no key, HTTP
// error, empty stream) throws before yielding, so the caller can fall through
// to the next one; once the first chunk is yielded we're committed to it.

async function* streamWorkersAI(env, systemPrompt, question) {
  const stream = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ],
    max_tokens: 400,
    stream: true,
  });
  yield* readSSE(stream, (obj) => obj.response || "");
}

async function* streamGemini(env, systemPrompt, question) {
  if (!env.GEMINI_API_KEY) throw new Error("Gemini: no key configured");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: question }] }],
      generationConfig: { maxOutputTokens: 400 },
    }),
  });
  if (!res.ok || !res.body) throw new Error("Gemini: HTTP " + res.status);
  yield* readSSE(res.body, (obj) => obj?.candidates?.[0]?.content?.parts?.[0]?.text || "");
}

async function* streamHuggingFace(env, systemPrompt, question) {
  if (!env.HF_API_KEY) throw new Error("HuggingFace: no key configured");
  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.HF_API_KEY}`,
    },
    body: JSON.stringify({
      model: "meta-llama/Llama-3.1-8B-Instruct",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      max_tokens: 400,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) throw new Error("HuggingFace: HTTP " + res.status);
  yield* readSSE(res.body, (obj) => obj?.choices?.[0]?.delta?.content || "");
}

// Parses a `data: {json}\n\n` SSE byte stream, applying `pick` to each JSON
// event to pull out the text delta. Ignores the `[DONE]` sentinel and any
// non-JSON keep-alive lines.
async function* readSSE(body, pick) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let obj;
        try { obj = JSON.parse(payload); } catch { continue; }
        const text = pick(obj);
        if (text) yield text;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const PROVIDERS = [
  { name: "workers-ai", stream: streamWorkersAI },
  { name: "gemini", stream: streamGemini },
  { name: "huggingface", stream: streamHuggingFace },
];

export default {
  async fetch(request, env) {
    const allowedOrigins = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, allowedOrigins);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      // Cheap liveness check for the hero badge — confirms the Worker is
      // deployed and has its AI binding, without spending inference quota
      // on every page load. Real chat traffic exercises the actual providers.
      const ok = !!env.AI;
      return json({ ok }, ok ? 200 : 503, cors);
    }

    if (request.method !== "POST") {
      return json({ error: "method not allowed" }, 405, cors);
    }

    if (!allowedOrigins.includes(origin)) {
      return json({ error: "origin not allowed" }, 403, cors);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (isRateLimited(ip)) {
      return json({ error: "rate limited, try again in a minute" }, 429, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400, cors);
    }

    const question = typeof body.question === "string" ? body.question.trim() : "";
    const lang = body.lang === "bn" ? "bn" : "en";

    if (!question) return json({ error: "question is required" }, 400, cors);
    if (question.length > MAX_QUESTION_LEN) {
      return json({ error: `question too long (max ${MAX_QUESTION_LEN} chars)` }, 400, cors);
    }

    let context;
    try {
      context = await fetchContext(env.CONTEXT_BASE_URL, lang);
    } catch (err) {
      return json({ error: "could not load portfolio context" }, 502, cors);
    }

    const systemPrompt = buildSystemPrompt(context, lang);

    // Find the first provider that yields at least one chunk, then stream the
    // rest of its output to the client as Server-Sent Events. Providers that
    // throw before their first chunk (no key, HTTP error) are skipped.
    let iterator, chosen, firstChunk;
    for (const provider of PROVIDERS) {
      try {
        const it = provider.stream(env, systemPrompt, question)[Symbol.asyncIterator]();
        const first = await it.next();
        if (first.done || !first.value) throw new Error("empty stream");
        iterator = it;
        chosen = provider.name;
        firstChunk = first.value;
        break;
      } catch (err) {
        console.error(`[${provider.name}] failed:`, err.message);
      }
    }

    if (!iterator) {
      return json({ error: "all providers unavailable, try again later" }, 503, cors);
    }

    const encoder = new TextEncoder();
    const sse = (event, data) =>
      encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(sse("meta", { provider: chosen }));
          controller.enqueue(sse("delta", { text: firstChunk }));
          for await (const chunk of iterator) {
            if (chunk) controller.enqueue(sse("delta", { text: chunk }));
          }
          controller.enqueue(sse("done", {}));
        } catch (err) {
          console.error(`[${chosen}] stream broke:`, err.message);
          controller.enqueue(sse("error", { message: "stream interrupted" }));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  },
};
