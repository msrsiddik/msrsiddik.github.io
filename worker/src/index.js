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
    ? "Tumi Siddiqur Rahman-er portfolio website-er AI assistant. Nichtar information use kore visitor-der question-er answer dao. Shudhu ei information-er upor base kore short, friendly answer dao. Jodi kono question-er answer information-e na thake, tahole bolo je tumi ei bepare jano na, kintu Siddiqur-ke direct email korte bolo."
    : "You are the AI assistant on Siddiqur Rahman's portfolio website. Answer visitor questions using only the information below. Keep answers short and friendly. If something isn't covered by this information, say you don't know and suggest emailing Siddiqur directly.";

  const parts = [
    intro,
    `\n\n--- About ---\n${context.about}`,
    `\n\n--- Skills ---\n${(context.skills || []).join("\n")}`,
    `\n\n--- Experience ---\n${(context.experience || []).join("\n")}`,
    `\n\n--- Projects ---\n${(context.projects || []).join("\n")}`,
    `\n\n--- Contact ---\nEmail: ${context.email}`,
  ];
  return parts.join("");
}

async function tryWorkersAI(env, systemPrompt, question) {
  const result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ],
    max_tokens: 400,
  });
  const answer = result && (result.response || result.result);
  if (!answer) throw new Error("Workers AI: empty response");
  return answer;
}

async function tryGemini(env, systemPrompt, question) {
  if (!env.GEMINI_API_KEY) throw new Error("Gemini: no key configured");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: question }] }],
      generationConfig: { maxOutputTokens: 400 },
    }),
  });
  if (!res.ok) throw new Error("Gemini: HTTP " + res.status);
  const data = await res.json();
  const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!answer) throw new Error("Gemini: empty response");
  return answer;
}

async function tryHuggingFace(env, systemPrompt, question) {
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
    }),
  });
  if (!res.ok) throw new Error("HuggingFace: HTTP " + res.status);
  const data = await res.json();
  const answer = data?.choices?.[0]?.message?.content;
  if (!answer) throw new Error("HuggingFace: empty response");
  return answer;
}

const PROVIDERS = [
  { name: "workers-ai", run: tryWorkersAI },
  { name: "gemini", run: tryGemini },
  { name: "huggingface", run: tryHuggingFace },
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

    let lastError;
    for (const provider of PROVIDERS) {
      try {
        const answer = await provider.run(env, systemPrompt, question);
        return json({ answer, provider: provider.name }, 200, cors);
      } catch (err) {
        lastError = err;
        console.error(`[${provider.name}] failed:`, err.message);
      }
    }

    return json({ error: "all providers unavailable, try again later" }, 503, cors);
  },
};
