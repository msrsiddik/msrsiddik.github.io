---
title: "ApiCoreX: stateless, multi-tenant API gateway with language-agnostic plugin"
date: 2026-06-28T14:00:00+06:00
description: "Kivabe ami emon ekta API gateway design korlam jekhane core stateless thake ar shob business logic plugin e thake — je kono language e lekha."
tags: ["go", "architecture", "api-gateway", "multi-tenant", "apicorex"]
---

Beshirbhag multi-tenant platform ekta monolith e porinoto hoy: auth, routing,
rate limiting, ar protita business feature — shob ekta codebase e jome jay.
Notun feature add korte gele core e haat dite hoy; core scale korte gele shob
business logic o sathe tante hoy. **ApiCoreX** holo tar ulto cheshta — ekta
gateway *core* ja sudhu ekta kaj kore ar kokhono bore na, ar protita feature
alada plugin e thake.

Ek line e: ekta **stateless, multi-tenant API gateway** with
**language-agnostic HTTP plugin system**. Core ta auth, routing, streaming ar
resilience handle kore; tomar business logic thake plugin e — je kono language e
lekha.

## Mul idea: control plane ar data plane alada kora

ApiCoreX duita jinis ke alada kore, jegulo sadharonoto ekshathe joriye jay.

- **Control plane** — plugin nije ke core er kache jana dey: register kore,
  heartbeat pathay, manifest expose kore. Eivabe core jane ki ki ache.
- **Data plane** — protita asol request core er bhitor diye jay, authenticate
  hoy, tenant-scope hoy, tarpor thik plugin e proxy hoy.

Core er nijer kono **database nai**. Eta JWT verify kore, live plugin er ekta
in-memory registry rakhe, ar proxy kore. Eitukui kaj. Karon kono persistent
state nai, tumi load balancer er pichone joto khushi core instance chalate paro
— ogula interchangeable.

## Plugin kivabe join kore

Ekta plugin **sudhu ekta HTTP server**. Kono SDK nai — Go, Python, Java, Node,
ja kichu HTTP bole, kaj kore. Join korte plugin ekta choto contract follow kore:

- `GET /_apicorex/manifest` — plugin er bornona: naam, version, ar je route gulo
  er malik (protita `public` ba na).
- `GET /_apicorex/health` — `{"status":"ok"}` return kore; core eta poll kore.
- Boot er somoy plugin `POST {CORE_URL}/_core/register` call kore tar `base_url`
  ar ekta API key diye, tarpor proti ~15s e heartbeat pathay.

Register er por core manifest ta **pull** kore ar declared path gulo route korte
shuru kore. Ekta niyom bar bar bola dorkar: core sudhu manifest e declare kora
route forward kore — baki shob 404. Vule kichu expose hoy na.

Go te ekta minimal plugin sotti ei rokom choto:

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

Khyal koro — plugin kokhono JWT verify kore na, ba kon tenant ke serve korche ta
ber kore na. Sudhu ekta header pore. Kothin kaj ta core kore diyeche.

## Request er jibon-chokro

Protita request ja public route na, plugin e pouchhanor age ekoi pipeline diye
jay:

1. **Spoofed header strip kora.** Core client er pathano je kono `X-ApiCoreX-*`
   header muche dey. Egulo *trusted* header, tai client kokhono egulo nokol
   korte parbe na.
2. **JWT verify kora.** `Authorization: Bearer …` token shared `JWT_SECRET`
   (HS256) diye check hoy. Token nai, ba kharap → `401`.
3. **Denylist check.** Redis configure thakle, revoke kora token (logout kora
   session) shathe shathe reject hoy.
4. **Tenant context inject kora** trusted header hisebe — niche dekho.
5. **Firewall** → **rate limit** → **bulkhead** → **circuit breaker**.
6. **Reverse-proxy** kore request plugin e pathay ar response stream kore fere.

Public route (manifest e declare kora) JWT verify skip kore — ar ogula kono
tenant header pay na, karon kono authenticated user nai.

## Client ke trust na kore multi-tenancy

Puro multi-tenant model ekta jinisher upor dariye: JWT tenant context bohon kore,
ar core sheta theke trusted header banay je plugin nirbhor korte pare:

| Header | Mane |
|---|---|
| `X-ApiCoreX-Tenant-ID` | tenant identifier (jemon `t_acme`) |
| `X-ApiCoreX-Tenant-Slug` | porhar moto tenant naam |
| `X-ApiCoreX-Schema` | ei tenant er data er Postgres schema |
| `X-ApiCoreX-User-ID` | authenticated user |
| `X-ApiCoreX-Roles` | comma-separated role |
| `X-ApiCoreX-Request-ID` | debugging er jonno trace id |

Karon core incoming header gulo strip kore ar sudhu token verify korar *por*
egulo set kore, ekta plugin `X-ApiCoreX-Schema` ke puropuri trust kore tar
database query scope korte pare. Tenant isolation plugin e ekta one-liner hoye
jay.

## Streaming first

Onek gateway choto JSON response chhara onno kichu te chuptisare bhenge pore.
ApiCoreX ulto vabe banano — reverse proxy immediate flush (`FlushInterval: -1`)
diye chole, tai:

- **File upload/download** puro body buffer na kore stream hoy.
- **Server-Sent Events** ekdom out of the box kaj kore.
- **WebSocket** client ar plugin — duita connection hijack kore bidirectional
  `io.Copy` diye handle hoy.

Eta ekta HTTP reverse proxy, gRPC na — ar sei karonei je-kono-language er plugin
shoja thake.

## Per-plugin resilience

Ekta slow ba failing plugin jeno puro platform ke na fele dey. Protita plugin
nijer protection pay, shob configurable:

| Layer | Ki kore |
|---|---|
| **Rate limit** | per plugin requests/sec (`RATE_PER_SEC`); public route er jonno er ekta onsho |
| **Bulkhead** | per plugin concurrent connection cap (`BULKHEAD_MAX`) → full hole `503` |
| **Circuit breaker** | bar bar fail hole trip kore (`CB_THRESHOLD`), nije recover hoy |
| **Firewall** | route er blocklist, `403` diye reject |

Per-plugin override ekta YAML config e thake, tai bhari plugin halka plugin theke
alada limit pete pare.

## Built-in observability

Jehetu shob kichu core diye jay, eta puro system observe korar perfect jayga:

- **Prometheus** — `GET /metrics` per plugin request count, latency, error rate,
  ar bulkhead / rate-limit / circuit-breaker state expose kore.
- **OpenTelemetry** — `OTEL_EXPORTER_OTLP_ENDPOINT` set korle trace auth, tenant
  injection ar proxy hop jure span kore.
- **Structured JSON log** tenant id, user id ar request context bohon kore.
- **Merged OpenAPI** — `GET /docs` ekta Scalar UI dey ja core ar protita plugin
  er route ek spec e mishiye dey.

## Security

- **Plugin allowlist** — `PLUGIN_ALLOWLIST` kon plugin register korte parbe ta
  thik kore (empty mane "shob allow", dev er jonno).
- **Signed plugin token** — registration ekta `plugin_token` fere dey ja plugin
  heartbeat/deregister e dite hoy; invalid token e `401`.
- **Code e kono secret nai** — shob environment driven (`JWT_SECRET`,
  `PLUGIN_API_KEY`, `REDIS_URL`, …).
- **Issuing delegate kora** — core sudhu token *verify* kore. User ar tenant
  issue kora thake Identity plugin e, ja core ke stateless rakhe.

## Sathe je plugin gulo ashe

Core ichhe kore khali, tai asol functionality ashe plugin theke. Duita official
plugin model ta dekhay:

- **[ApiCoreX Identity](https://github.com/msrsiddik/apicorex-identity)** — nijer
  Postgres database rakhe, core je JWT verify kore segulo issue kore, ar protita
  tenant er alada schema banate ekta compensating saga chalay. Ekta credential
  onek tenant e thakte pare.
- **[ApiCoreX Sync](https://github.com/msrsiddik/apicorex-sync)** — je kono client
  er jonno offline-first push/pull sync: idempotent change batch, monotonic
  cursor, last-write-wins conflict resolution, ar soft-delete tombstone.

Auth ke Auth0 ba Google diye replace korte chao? Identity plugin ta poriborton
koro — core change hoy na.

## Keno ei shape ta amar bhalo lage

Core ke stateless ar bokar rakhar labh holo — *interesting* shob kichu ekta
plugin hoye jay ja tumi alada vabe banate, scale korte ar deploy korte paro —
je language kaj er jonno thik. Gateway ar puro team er jhogra-r bottleneck thake
na, hoye jay ekta patla, boring, horizontally-scalable layer ja sudhu auth,
routing ar resilience kore.

Source: [github.com/msrsiddik/apicorex](https://github.com/msrsiddik/apicorex)
