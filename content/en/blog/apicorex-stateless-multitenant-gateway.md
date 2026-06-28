---
title: "ApiCoreX: a stateless, multi-tenant API gateway with language-agnostic plugins"
date: 2026-06-28T14:00:00+06:00
description: "How I designed an API gateway where the core stays stateless and all business logic lives in plugins written in any language."
tags: ["go", "architecture", "api-gateway", "multi-tenant", "apicorex"]
---

Most multi-tenant platforms grow into a monolith: auth, routing, rate limiting,
and every business feature pile into one codebase. Adding a feature means
touching the core; scaling the core means dragging all the business logic along
with it. **ApiCoreX** is my attempt at the opposite — a gateway *core* that does
exactly one job and never grows, with every feature pushed out into independent
plugins.

The one-line summary: a **stateless, multi-tenant API gateway** with a
**language-agnostic HTTP plugin system**. The core handles auth, routing,
streaming and resilience; your business logic lives in plugins written in any
language.

## The core idea: split the control plane from the data plane

ApiCoreX separates two concerns that usually get tangled together.

- **Control plane** — plugins announce themselves to the core: register, send
  heartbeats, expose a manifest. This is how the core learns what exists.
- **Data plane** — every real request flows through the core, gets
  authenticated and tenant-scoped, then is proxied to the right plugin.

The core itself holds **no database**. It verifies JWTs, keeps an in-memory
registry of live plugins, and proxies. That's the whole job. Because there's no
persistent state, you can run as many core instances behind a load balancer as
you want — they're interchangeable.

## How a plugin joins

A plugin is **just an HTTP server**. There is no SDK — Go, Python, Java, Node,
anything that speaks HTTP works. To join, a plugin implements a tiny contract:

- `GET /_apicorex/manifest` — describes the plugin: its name, version, and the
  routes it owns (each marked `public` or not).
- `GET /_apicorex/health` — returns `{"status":"ok"}`; the core polls it.
- On boot, the plugin calls `POST {CORE_URL}/_core/register` with its `base_url`
  and an API key, then sends a heartbeat every ~15s.

After registration the core **pulls** the manifest and starts routing the
declared paths. One rule worth repeating: the core only forwards routes the
manifest declares — anything else is a 404. There's no accidental exposure.

A minimal plugin in Go is genuinely this small:

```go
package main

import "github.com/gin-gonic/gin"

func main() {
	r := gin.New()

	r.GET("/_apicorex/manifest", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"name": "go-billing", "version": "1.0.0",
			"routes": []gin.H{{"method": "GET", "path": "/invoices"}},
		})
	})
	r.GET("/_apicorex/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	r.GET("/invoices", func(c *gin.Context) {
		tenant := c.GetHeader("X-ApiCoreX-Tenant-ID")
		c.JSON(200, gin.H{"tenant": tenant, "invoices": []any{}})
	})

	r.Run(":8081")
}
```

Notice the plugin never verifies a JWT or figures out which tenant it's serving.
It just reads a header. The core did the hard part.

## The request lifecycle

Every request that isn't a public route runs through the same pipeline before it
ever reaches a plugin:

1. **Strip spoofed headers.** The core removes any `X-ApiCoreX-*` headers the
   client sent. These are *trusted* headers, so the client must never be able to
   forge them.
2. **Verify the JWT.** The `Authorization: Bearer …` token is checked against the
   shared `JWT_SECRET` (HS256). No token, or a bad one → `401`.
3. **Check the denylist.** If Redis is configured, revoked tokens (logged-out
   sessions) are rejected immediately.
4. **Inject tenant context** as trusted headers — see below.
5. **Firewall** → **rate limit** → **bulkhead** → **circuit breaker**.
6. **Reverse-proxy** the request to the plugin and stream the response back.

Public routes (declared in the manifest) skip JWT verification — and they don't
receive any tenant headers, since there's no authenticated user.

## Multi-tenancy without trusting the client

The whole multi-tenant model rests on one move: the JWT carries the tenant
context, and the core turns that into trusted headers the plugin can rely on:

| Header | Meaning |
|---|---|
| `X-ApiCoreX-Tenant-ID` | tenant identifier (e.g. `t_acme`) |
| `X-ApiCoreX-Tenant-Slug` | readable tenant name |
| `X-ApiCoreX-Schema` | the Postgres schema for this tenant's data |
| `X-ApiCoreX-User-ID` | authenticated user |
| `X-ApiCoreX-Roles` | comma-separated roles |
| `X-ApiCoreX-Request-ID` | trace id for debugging |

Because the core strips incoming versions of these headers and only sets them
*after* verifying the token, a plugin can fully trust `X-ApiCoreX-Schema` to
scope its database queries. Tenant isolation becomes a one-liner in the plugin.

## Streaming first

A lot of gateways quietly break on anything that isn't a small JSON response.
ApiCoreX is built the other way around — the reverse proxy runs with immediate
flushing (`FlushInterval: -1`), so:

- **File upload/download** streams through without buffering the whole body.
- **Server-Sent Events** work out of the box.
- **WebSockets** are handled by hijacking both the client and plugin connections
  and doing a bidirectional `io.Copy`.

It's an HTTP reverse proxy, not gRPC — which is exactly why any-language plugins
stay simple.

## Resilience, per plugin

One slow or failing plugin shouldn't take the platform down. Each plugin gets
its own protection, all configurable:

| Layer | What it does |
|---|---|
| **Rate limit** | requests/sec per plugin (`RATE_PER_SEC`); public routes get a fraction of it |
| **Bulkhead** | caps concurrent connections per plugin (`BULKHEAD_MAX`) → `503` when full |
| **Circuit breaker** | trips after repeated failures (`CB_THRESHOLD`) and auto-recovers |
| **Firewall** | blocklist of routes, rejected with `403` |

Per-plugin overrides live in a YAML config file, so a heavy plugin can get
different limits than a light one.

## Observability built in

Since everything funnels through the core, it's the perfect place to observe the
whole system:

- **Prometheus** — `GET /metrics` exposes request counts, latencies, error
  rates, plus bulkhead / rate-limit / circuit-breaker state, per plugin.
- **OpenTelemetry** — set `OTEL_EXPORTER_OTLP_ENDPOINT` and traces span auth,
  tenant injection, and the proxy hop.
- **Structured JSON logs** carrying tenant id, user id, and request context.
- **Merged OpenAPI** — `GET /docs` serves a Scalar UI combining the core and
  every plugin's routes into one spec.

## Security posture

- **Plugin allowlist** — `PLUGIN_ALLOWLIST` restricts which plugins may register
  (empty means "allow any", for dev).
- **Signed plugin tokens** — registration returns a `plugin_token` the plugin
  must present on heartbeat/deregister; an invalid token gets a `401`.
- **No secrets in code** — everything is environment-driven (`JWT_SECRET`,
  `PLUGIN_API_KEY`, `REDIS_URL`, …).
- **Issuing is delegated** — the core only *verifies* tokens. Issuing users and
  tenants lives in the Identity plugin, which keeps the core stateless.

## The plugins that ship with it

The core is deliberately empty, so real functionality comes from plugins. Two
official ones show the model:

- **[ApiCoreX Identity](https://github.com/msrsiddik/apicorex-identity)** — owns
  its own Postgres database, issues the JWTs the core verifies, and runs a
  compensating saga to provision each tenant's dedicated schema. One credential
  can belong to many tenants.
- **[ApiCoreX Sync](https://github.com/msrsiddik/apicorex-sync)** — offline-first
  push/pull sync for any client: idempotent change batches, monotonic cursors,
  last-write-wins conflict resolution, and soft-delete tombstones.

Want to swap auth for Auth0 or Google? Replace the Identity plugin — the core
doesn't change.

## Why I like this shape

The payoff of keeping the core stateless and dumb is that everything *interesting*
becomes a plugin you can build, scale, and deploy on its own — in whatever
language fits the job. The gateway stops being the bottleneck the whole team
fights over, and becomes a thin, boring, horizontally-scalable layer that just
does auth, routing, and resilience.

Source: [github.com/msrsiddik/apicorex](https://github.com/msrsiddik/apicorex)
