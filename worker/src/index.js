// Cloudflare Worker: free-tier AI chat proxy for the portfolio hero panel.
// Holds provider API keys as secrets and never exposes them to the browser.
// Tries providers in order (Workers AI -> Gemini -> HuggingFace) and falls
// through to the next on any failure or quota exhaustion.

const MAX_QUESTION_LEN = 500;
const MAX_HISTORY_TURNS = 8; // last N messages (user+assistant combined) kept as context
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

// Returns 0 if the request is allowed, or the number of seconds the caller
// should wait before retrying (the window's oldest request aging out).
function rateLimitRetryAfter(ip) {
  const now = Date.now();
  const bucket = (rateLimitBuckets.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_MAX) {
    return Math.ceil((bucket[0] + RATE_LIMIT_WINDOW_MS - now) / 1000);
  }
  bucket.push(now);
  rateLimitBuckets.set(ip, bucket);
  return 0;
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
    ? "Tumi Siddiqur Rahman-er hoye kotha bolcho — ekjon knowledgeable colleague-er moto je tar kaj, experience ar projects bhalo kore jane. Visitor take 'MSR', 'Siddik', 'Siddiqur', 'Rahman', 'Siddiqur Rahman', ba emon kono nikname/abbreviation diye refer korte pare — sob-i same manush, tumi bujhe nebe ei shob variant same person-er kotha bolche, alada porichoy hisebe treat korbe na. Third person e bolo (jemon 'Siddiqur Go te backend banai'). Nijeke kokhono bot, AI, ba website assistant bole porichoy dio na. Company ar product-er naam (jemon Orocube, Siiopa, Medlogics, FloreantPOS, ApiCoreX) shobshomoy original English spelling-e likho — kokhono Bangla script-e transliterate/translate korbe na. Niche deya information hocche tomar main source, kintu word-for-word match khujar দরকার nাi — related, adjacent, ba reasonable-vabe inferred question-eo shwacchondo-vabe answer dao (jemon kono specific technology niye na thakleo, tar overall experience ar skill theke reasonable guess dite paro, seta clearly bolar sathe je eta general idea, exact detail na). Visitor jodi kono technical term, jargon, ba shobder mane jigges kore (jemon 'gRPC ki?', 'offline-first mane ki?', 'circuit breaker ki?') — tumi general knowledge diye shei term-ta shohoj bhashay bujhiye dite paro, ei website-er information-e shimabaddho theke na. Shudhu tokhoni 'jani na' bolbe jokhon question shotti-i asongoto, out-of-scope, ba fabricate korte hobe emon kichu — normal chat-conversation-er moto natural thakবে, restrictive/robotic laglবে na. Visitor spelling/typo bhul korte pare (jemon 'Siddiqure', 'Rahmn', 'expereince') — eগুলো shohojei bujhে nিবে, spelling niye kono comment na kore intended meaning dhore answer dao. Answer-er length question-er sathe match korবে: choto/casual question ('who are you', 'what does he do') e 2-3 lাinei confident answer dao; deep/specific question ('explain his architecture approach', 'how does the sync conflict resolution work') e beshi detail soho lomba answer dite paro. Warm, confident tone rakho — marketing-er moto shona jeno na. Markdown use korte paro (bold, list, link). Personal/private info (jemon marital status, spouse-er naam) shudhu tokhoni bolbe jokhon visitor eta specifically ar directly jigges kore (jemon 'she married?', 'is he single?', 'marital status ki?', 'wife-er naam ki?') — general intro, 'who are you', 'tell me about him' — emon broad question-er answer-e ei tottho nijer theke ullekh korbe na."
    : "You speak on behalf of Siddiqur Rahman, like a knowledgeable colleague who knows his work, experience, and projects well. Visitors may refer to him as \"MSR\", \"Siddik\", \"Siddiqur\", \"Rahman\", \"Siddiqur Rahman\", or similar nicknames/abbreviations — treat all of these as the same person, not separate identities. Speak about him in the third person (e.g. \"Siddiqur builds backends in Go\"). Never introduce yourself as a bot, an AI, or a website assistant. The information below is your main source, but don't require an exact keyword match — feel free to answer related, adjacent, or reasonably inferred questions too (e.g. if asked about a specific technology that isn't listed, you can reason from his overall experience and skill set, while being clear it's a general read rather than a confirmed fact). If a visitor asks what a technical term or piece of jargon means (e.g. \"what is gRPC?\", \"what does offline-first mean?\", \"what's a circuit breaker?\"), feel free to explain it in plain language using your general knowledge — you're not limited to only what's in the site's data for that. Only say you don't know when a question is genuinely out of scope or would require making something up — stay natural and conversational rather than rigid or robotic about it. Visitors may make typos or misspell things (e.g. \"Siddiqure\", \"Rahmn\", \"expereince\") — silently understand the intended meaning and answer normally, don't comment on the spelling. Match your answer length to the question: short/casual questions (\"who are you\", \"what does he do\") get a confident 2-3 line answer; deep or specific questions (\"explain his architecture approach\", \"how does the sync conflict resolution work\") deserve a longer, more detailed answer. Keep a warm, confident tone — avoid sounding like marketing copy. You may use light Markdown (bold, lists, links). If you truly can't help, suggest emailing Siddiqur directly. Personal/private details like marital status or his spouse's name should only come up when a visitor specifically and directly asks about it (e.g. \"is he married?\", \"what's his marital status?\", \"what's his wife's name?\") — never volunteer it in answer to broad questions like \"who are you\" or \"tell me about him\".";

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
  const personalLines = [];
  if (context.maritalStatus) personalLines.push(`Marital status: ${context.maritalStatus}`);
  if (context.spouseName) personalLines.push(`Spouse's name: ${context.spouseName}`);
  if (personalLines.length) {
    parts.push(`\n\n--- Personal (only share if specifically asked) ---\n${personalLines.join("\n")}`);
  }
  const contactLines = [`Email: ${context.email}`];
  if (context.whatsapp) contactLines.push(`WhatsApp: ${context.whatsapp}`);
  const social = context.social || {};
  if (social.github) contactLines.push(`GitHub: ${social.github}`);
  if (social.linkedin) contactLines.push(`LinkedIn: ${social.linkedin}`);
  if (social.twitter) contactLines.push(`Twitter/X: ${social.twitter}`);
  if (social.facebook) contactLines.push(`Facebook: ${social.facebook}`);
  parts.push(`\n\n--- Contact ---\n${contactLines.join("\n")}`);
  return parts.join("");
}

// Each provider exposes `stream(env, systemPrompt, question)` returning an
// async iterable of text chunks. A provider that can't start (no key, HTTP
// error, empty stream) throws before yielding, so the caller can fall through
// to the next one; once the first chunk is yielded we're committed to it.

// `turns` is the prior conversation as an array of {role: "user"|"assistant",
// content} pairs, oldest first, not including the new question — each
// provider appends the current question as the final user turn itself.

async function* streamWorkersAI(env, systemPrompt, turns, question) {
  const stream = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages: [
      { role: "system", content: systemPrompt },
      ...turns,
      { role: "user", content: question },
    ],
    max_tokens: 700,
    stream: true,
  });
  yield* readSSE(stream, (obj) => obj.response || "");
}

async function* streamGemini(env, systemPrompt, turns, question) {
  if (!env.GEMINI_API_KEY) throw new Error("Gemini: no key configured");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${env.GEMINI_API_KEY}`;
  const contents = [
    ...turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
    { role: "user", parts: [{ text: question }] },
  ];
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: 700 },
    }),
  });
  if (!res.ok || !res.body) throw new Error("Gemini: HTTP " + res.status);
  yield* readSSE(res.body, (obj) => obj?.candidates?.[0]?.content?.parts?.[0]?.text || "");
}

async function* streamHuggingFace(env, systemPrompt, turns, question) {
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
        ...turns,
        { role: "user", content: question },
      ],
      max_tokens: 700,
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
    const retryAfter = rateLimitRetryAfter(ip);
    if (retryAfter > 0) {
      return json({ error: "rate limited", retryAfter }, 429, { ...cors, "Retry-After": String(retryAfter) });
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

    // Prior conversation turns, sent by the client so multi-turn follow-ups
    // ("what about X?") resolve against what was already said. Trusted only
    // as chat context, never as instructions — capped in count and length,
    // and always placed after the system prompt so it can't override it.
    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const turns = rawHistory
      .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
      .slice(-MAX_HISTORY_TURNS)
      .map((t) => ({ role: t.role, content: t.content.trim().slice(0, MAX_QUESTION_LEN) }))
      .filter((t) => t.content);

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
        const it = provider.stream(env, systemPrompt, turns, question)[Symbol.asyncIterator]();
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
