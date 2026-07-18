---
title: "ApiCoreX: stateless, multi-tenant API gateway with language-agnostic plugin"
date: 2026-06-28T14:00:00+06:00
description: "কীভাবে এমন একটা API gateway design করেছি যেখানে core stateless থাকে, আর সব business logic থাকে plugin-এ — যেকোনো ভাষায় লেখা।"
tags: ["go", "architecture", "api-gateway", "multi-tenant", "apicorex"]
---

বেশিরভাগ multi-tenant platform শেষমেশ একটা monolith-এ পরিণত হয়ে যায় —
auth, routing, rate limiting, আর প্রতিটা business feature সব একই codebase-এ
জমতে থাকে। নতুন feature আনতে গেলেও core-এ হাত দিতে হয়, core scale করতে
গেলেও সাথে সব business logic টানতে হয়। **ApiCoreX** এর ঠিক উল্টো পথে হাঁটার
চেষ্টা — একটা gateway *core* যেটা একটাই কাজ করে আর কখনো বড় হয় না, আর
প্রতিটা feature থাকে আলাদা plugin-এ।

এক লাইনে বললে: **stateless, multi-tenant API gateway**, সাথে
**language-agnostic HTTP plugin system**। Core সামলায় auth, routing,
streaming, resilience — বাকি business logic থাকে plugin-এ, যে ভাষাতেই
লিখুন না কেন।

## মূল ধারণা: control plane আর data plane আলাদা করা

ApiCoreX যে দুটো জিনিস আলাদা করে, সেগুলো সাধারণত অন্য সিস্টেমে একসাথে জড়িয়ে থাকে।

- **Control plane** — plugin নিজেই core-কে জানান দেয়: register করে,
  heartbeat পাঠায়, manifest expose করে। এভাবেই core জানে কী কী চলছে।
- **Data plane** — আসল request core-এর ভেতর দিয়ে যায়, authenticate হয়,
  tenant-scope হয়, তারপর সঠিক plugin-এ proxy হয়ে যায়।

Core-এর কোনো **database নেই** নিজের। শুধু JWT verify করে, live plugin-এর
একটা in-memory registry রাখে, আর proxy করে দেয় — এইটুকুই। Persistent
state না থাকায় load balancer-এর পেছনে যত ইচ্ছা core instance চালানো
যায়, সব একে অপরের বদলি হিসেবে কাজ করে।

## Plugin কীভাবে join করে

একটা plugin আসলে **শুধুই একটা HTTP server**। কোনো SDK লাগে না — Go, Python,
Java, Node, HTTP বোঝে এমন যেকোনো কিছু দিয়েই কাজ চলে। Join করার জন্য plugin-কে
ছোট্ট একটা contract মেনে চলতে হয়:

- `GET /_apicorex/manifest` — plugin-এর পরিচয়: নাম, version, কোন route-এর
  মালিক (আর কোনটা `public`, সেটাও বলে দেয়)।
- `GET /_apicorex/health` — `{"status":"ok"}` রিটার্ন করে; core এটা poll করতে থাকে।
- Boot হওয়ার সময় plugin `POST {CORE_URL}/_core/register` কল করে তার
  `base_url` আর একটা API key দিয়ে, এরপর প্রতি ~15 সেকেন্ডে heartbeat।

Register হয়ে গেলে core manifest **pull** করে নেয়, declared path-গুলো route
করা শুরু হয়ে যায়। একটা নিয়ম বারবার মনে করিয়ে দেওয়া দরকার — core শুধু
manifest-এ declare করা route-ই forward করে, বাকি সব 404। ভুলবশত কিছু
এক্সপোজ হওয়ার সুযোগ নেই।

Go-তে একটি minimal plugin সত্যিই এত ছোট:

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

লক্ষ্য করুন, plugin কখনো JWT verify করে না, বা কোন tenant-কে serve করছে তা
নিজে বের করার চেষ্টা করে না — শুধু একটা header পড়ে নেয়। কঠিন কাজটা core-ই
সামলে দেয়।

## Request-এর জীবনচক্র

Public route ছাড়া প্রতিটা request plugin-এ পৌঁছানোর আগে একই pipeline
পার হয়:

1. **Spoofed header strip।** Client-এর পাঠানো যেকোনো `X-ApiCoreX-*` header
   core মুছে দেয় শুরুতেই। এগুলো *trusted* header, client কখনোই এগুলো নকল
   করতে পারবে না।
2. **JWT verify।** `Authorization: Bearer …` token shared `JWT_SECRET`
   (HS256) দিয়ে check হয়। Token না থাকলে বা অবৈধ হলে সোজা `401`।
3. **Denylist check।** Redis configure থাকলে revoke করা token (মানে logout
   করা session) সাথে সাথেই reject হয়ে যায়।
4. **Tenant context inject** trusted header হিসেবে — নিচে বিস্তারিত।
5. **Firewall → rate limit → bulkhead → circuit breaker।**
6. **Reverse-proxy** করে request plugin-এ পাঠানো হয়, response স্ট্রিম হয়ে ফেরত আসে।

Public route (manifest-এ declare করা) JWT verify বাদ দেয়, আর কোনো tenant
header-ও পায় না — কারণ সেখানে authenticated user বলে কিছু নেই।

## Client-কে trust না করে multi-tenancy

পুরো multi-tenant model দাঁড়িয়ে আছে একটা জিনিসের উপর — JWT tenant context
বহন করে, আর core সেখান থেকেই বানিয়ে দেয় trusted header, যার উপর plugin
নির্ভর করতে পারে চোখ বন্ধ করে:

| Header | অর্থ |
|---|---|
| `X-ApiCoreX-Tenant-ID` | tenant identifier (যেমন `t_acme`) |
| `X-ApiCoreX-Tenant-Slug` | পঠনযোগ্য tenant নাম |
| `X-ApiCoreX-Schema` | এই tenant-এর data-এর Postgres schema |
| `X-ApiCoreX-User-ID` | authenticated user |
| `X-ApiCoreX-Roles` | comma-separated role |
| `X-ApiCoreX-Request-ID` | debugging-এর জন্য trace id |

Core incoming header strip করে দেয়, আর token verify হওয়ার *পরেই* এগুলো
সেট করে — তাই plugin `X-ApiCoreX-Schema`-কে পুরোপুরি বিশ্বাস করে সরাসরি
database query scope করতে পারে। Tenant isolation তখন plugin-এর দিক থেকে
একটা one-liner মাত্র।

## Streaming-first ডিজাইন

অনেক gateway ছোট JSON response ছাড়া অন্য কিছুতেই গিয়ে চুপচাপ ভেঙে পড়ে।
ApiCoreX উল্টো ভাবে বানানো — reverse proxy চলে immediate flush
(`FlushInterval: -1`) নিয়ে, ফলে:

- **File upload/download** পুরো body buffer না করেই stream হয়।
- **Server-Sent Events** সরাসরি, কোনো এক্সট্রা কাজ ছাড়াই কাজ করে।
- **WebSocket** — client আর plugin, দুই connection hijack করে bidirectional
  `io.Copy` দিয়ে হ্যান্ডেল হয়।

এটা একটা HTTP reverse proxy, gRPC না — আর ঠিক এই কারণেই যেকোনো ভাষার
plugin লেখাটা সহজ থেকে যায়।

## Per-plugin resilience

একটা slow বা failing plugin যাতে পুরো platform টেনে না নামায়, সেজন্য
প্রতিটা plugin নিজস্ব protection পায়, সবটাই configurable:

| Layer | কী করে |
|---|---|
| **Rate limit** | per plugin requests/sec (`RATE_PER_SEC`); public route-এর জন্য এর একটি অংশ |
| **Bulkhead** | per plugin concurrent connection cap (`BULKHEAD_MAX`) → full হলে `503` |
| **Circuit breaker** | বারবার fail হলে trip করে (`CB_THRESHOLD`), নিজে recover হয় |
| **Firewall** | route-এর blocklist, `403` দিয়ে reject করে |

Per-plugin override থাকে একটা YAML config-এ, তাই ভারী plugin হালকা
plugin থেকে আলাদা limit পেতেই পারে।

## Built-in observability

সবকিছু যেহেতু core দিয়েই যায়, এটাই আসলে পুরো system observe করার
সবচেয়ে ভালো জায়গা:

- **Prometheus** — `GET /metrics`-এ per plugin request count, latency,
  error rate, আর bulkhead/rate-limit/circuit-breaker-এর state expose হয়।
- **OpenTelemetry** — `OTEL_EXPORTER_OTLP_ENDPOINT` সেট করলে auth, tenant
  injection, proxy hop — সবটা জুড়ে trace span তৈরি হয়।
- **Structured JSON log** tenant id, user id, request context বয়ে বেড়ায়।
- **Merged OpenAPI** — `GET /docs`-এ একটা Scalar UI, core আর প্রতিটা
  plugin-এর route এক spec-এ মিশে যায় সেখানে।

## Security

- **Plugin allowlist** — `PLUGIN_ALLOWLIST` ঠিক করে দেয় কোন plugin
  register করতে পারবে (empty মানে "সব allow", dev-এর জন্য সুবিধাজনক)।
- **Signed plugin token** — registration-এ একটা `plugin_token` ফেরত আসে,
  যেটা plugin-কে heartbeat/deregister-এ দিতে হয়; invalid token মানেই `401`।
- **Code-এ কোনো secret নেই** — সবই environment driven (`JWT_SECRET`,
  `PLUGIN_API_KEY`, `REDIS_URL`, ইত্যাদি)।
- **Issuing delegate করা আছে** — core শুধু token *verify* করে, ইস্যু করা
  না। User আর tenant issue হয় Identity plugin থেকে, তাতেই core stateless থেকে যায়।

## সাথে যে plugin-গুলো আসে

Core ইচ্ছা করেই খালি রাখা, আসল functionality আসে plugin থেকে। দুটো
official plugin এই model-টা ভালোভাবে দেখায়:

- **[ApiCoreX Identity](https://github.com/msrsiddik/apicorex-identity)** —
  নিজস্ব Postgres database রাখে, core যেসব JWT verify করে সেগুলো নিজেই
  issue করে, আর প্রতিটা tenant-এর আলাদা schema বানাতে একটা compensating
  saga চালায়। একটা credential একাধিক tenant-এও থাকতে পারে।
- **[ApiCoreX Sync](https://github.com/msrsiddik/apicorex-sync)** — যেকোনো
  client-এর জন্য offline-first push/pull sync — idempotent change batch,
  monotonic cursor, last-write-wins conflict resolution, soft-delete tombstone।

Auth-কে Auth0 বা Google দিয়ে বদলাতে চান? শুধু Identity plugin পাল্টান —
core একদম অপরিবর্তিত থাকে।

## কেন এই ডিজাইন পছন্দ

Core-কে stateless আর সরল রাখার আসল লাভ হলো — যা কিছু *ইন্টারেস্টিং*, সবই
এক-একটা plugin হয়ে যায়, যেগুলো আলাদা ভাবে বানানো, scale, deploy করা যায়
— যে ভাষায় সুবিধা সেই ভাষাতেই। Gateway আর পুরো টিমের ঝগড়ার bottleneck
থাকে না, বরং হয়ে ওঠে একটা হালকা, boring, horizontally-scalable layer যেটা
শুধু auth, routing আর resilience সামলায় — এবং এই boring থাকাটাই আসলে পয়েন্ট।

Source: [github.com/msrsiddik/apicorex](https://github.com/msrsiddik/apicorex)
