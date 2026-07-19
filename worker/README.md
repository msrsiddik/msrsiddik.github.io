# AI chat proxy (Cloudflare Worker)

Backend proxy for the portfolio's AI chat. Holds provider API keys as Worker
secrets so they're never exposed in the browser. Tries providers in order —
Cloudflare Workers AI → Gemini → HuggingFace — and falls through to the next
on failure or quota exhaustion.

## Setup

1. Install Wrangler (if you don't have it): `npm install -g wrangler`
2. Log in: `wrangler login`
3. From `worker/`, set the provider secrets:
   ```
   wrangler secret put GEMINI_API_KEY
   wrangler secret put HF_API_KEY
   ```
   - Gemini key: https://aistudio.google.com/apikey (free tier)
   - HuggingFace token: https://huggingface.co/settings/tokens (free "read" scope token works with the router API)
   - Workers AI needs no separate key — it's bound to your Cloudflare account via `[ai]` in `wrangler.toml`.
4. Deploy: `wrangler deploy`
5. Note the deployed Worker URL (e.g. `https://msrportfolio-ai-chat.<your-subdomain>.workers.dev`) and set it as `AI_CHAT_ENDPOINT` in `static/js/main.js`.

## Local development

```
wrangler dev
```

Then test with:

```
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:1313" \
  -d '{"question": "What projects has he built?", "lang": "en"}'
```

## Config

- `ALLOWED_ORIGINS` (in `wrangler.toml` `[vars]`) — comma-separated list of origins allowed to call this Worker. Update if the domain changes.
- `CONTEXT_BASE_URL` — where the Worker fetches `/ai-context.json` / `/bn/ai-context.json` from (the live Hugo site). Content updates there don't require redeploying the Worker.

## Notes

- Rate limiting is a simple in-memory per-IP counter (8 req/min). It resets whenever the Worker's isolate recycles and isn't shared across Cloudflare's edge locations — it's a basic abuse deterrent, not a hard guarantee. If abuse becomes a real problem, upgrade to Durable Objects or Cloudflare's rate-limiting rules.
- Provider fallback order and models are defined in `src/index.js` (`PROVIDERS` array).
