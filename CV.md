# Siddiqur Rahman

Full-Stack & Multi-Platform Software Engineer — Go, Java/Kotlin, React

Uttara, Dhaka 1230, Bangladesh (open to remote) | +880 1774-470711 | msrsiddik2@gmail.com | [github.com/msrsiddik](https://github.com/msrsiddik) | [linkedin.com/in/msrsiddik](https://www.linkedin.com/in/msrsiddik) | [msrdev.top](https://msrdev.top)

---

## Summary

Full-stack developer with 4+ years of experience building point-of-sale and healthcare products across every layer they touch. On the backend I work in Go and Java/Spring Boot; on the web I build with React and Vaadin; on desktop I build with Java Swing; and on mobile I build native Android apps in Kotlin/Java. I'm comfortable taking a feature from API design through to whichever client it needs to reach — web dashboard, desktop terminal, or mobile app. In my own time I build systems like multi-tenant API gateways, offline-first sync, and authentication services, which reflect the same depth I bring to product work. Based in Dhaka and open to remote work.

---

## Projects

**ApiCoreX** — [github.com/msrsiddik/apicorex](https://github.com/msrsiddik/apicorex)
A stateless, multi-tenant API gateway with a language-agnostic HTTP plugin system. The core handles JWT auth, routing, streaming (file upload, SSE, WebSocket), and resilience (circuit breaker, rate limiting, bulkhead), while business logic lives in plugins written in any language. Ships with Prometheus metrics and OpenTelemetry tracing.
*Go, JWT, Redis, Prometheus, OpenTelemetry*

**ApiCoreX Identity** — [github.com/msrsiddik/apicorex-identity](https://github.com/msrsiddik/apicorex-identity)
Authentication and tenant-management plugin for ApiCoreX. Owns its own PostgreSQL database, issues HS256 access + rotating refresh tokens, and runs a compensating saga to provision each tenant's dedicated schema. Supports multi-tenant accounts with Redis-backed logout.
*Go, Gin, PostgreSQL, JWT, Redis*

**ApiCoreX Sync** — [github.com/msrsiddik/apicorex-sync](https://github.com/msrsiddik/apicorex-sync)
Offline-first data sync plugin for ApiCoreX. Any offline-capable app can push local changes and pull server changes with no custom sync logic. Uses idempotent change batches, monotonic server cursors, last-write-wins conflict resolution, and soft-delete tombstones with periodic GC.
*Go, PostgreSQL, Offline-first*

**CineHub** — [github.com/msrsiddik/cinehub](https://github.com/msrsiddik/cinehub)
A Go service over the dvdrental sample database, exposing the same domain model through both REST (Fiber + GORM) and GraphQL (gqlgen). Clean service, repository, and database layering with graceful shutdown and health checks.
*Go, Fiber, GORM, GraphQL, PostgreSQL*

---

## Experience

### Software Engineer — Orocube Technologies
*Jan 2025 — Present*

- Build features for **Siiopa**, a cloud-based restaurant POS with order management, kitchen display, and multi-location support, a product I've worked on since its early days.
- Develop **Medlogics**, a cloud, offline-first healthcare platform for clinics, hospitals, pharmacies, and diagnostics, delivered as a client project.
- Ship features across Orocube's POS ecosystem — **ORO POS** and **CLUBPOS** (Java Swing desktop terminals), **OroKiosk** (self-service kiosk), and online ordering.
- Build Java plugins that extend ORO POS's core (inventory, floor plan/table management, customer & loyalty) and integrate payment gateways (First Data, CardConnect, TSYS, Dejavoo).
- Build backend services and APIs that connect offline POS terminals with cloud and online-ordering platforms.
- Build internal admin/dashboard tooling with **Vaadin** for Medlogics.
- Work with the team to take features from API design to whichever client they need to reach — web, desktop, or mobile.

### Assistant Software Engineer — Orocube Technologies
*Jan 2024 — Dec 2024*

- Took broader ownership of POS and healthcare features across backend, web, desktop, and mobile clients.
- Continued building Siiopa, the cloud POS product.
- Joined the Medlogics team, a cloud, offline-first healthcare platform delivered as a client project.
- Built backend services in Java/Spring Boot, web/admin tooling in Vaadin, and mobile features in Android.
- Handled API design, integration, and bug fixing across the product suite.

### Junior Software Engineer — Orocube Technologies
*Jan 2022 — Dec 2023*

- Started working on Siiopa, Orocube's cloud POS, early on.
- Built and fixed features in Java Swing desktop POS applications — ORO POS, CLUBPOS, and FloreantPOS — the terminal software restaurant staff use directly at the counter.
- Learned the point-of-sale domain: orders, kitchen flow, and cash control.

### Open Source Contributor — FloreantPOS
*2022 — Present*

- Contribute features and fixes to FloreantPOS, a free, open-source restaurant POS system built in Java and deployed across thousands of restaurants worldwide.

---

## Skills

- **Languages:** Go, Java, JavaScript, TypeScript, Kotlin, SQL
- **Backend:** Spring Boot, Go (net/http, gRPC), REST APIs, PostgreSQL, Redis
- **Frontend:** React, Vaadin, TypeScript, HTML/CSS, Tailwind
- **Desktop:** Java Swing
- **Mobile:** Android (Kotlin/Java)
- **Tooling & Infra:** Docker, Git, CI/CD, Linux

---

## Education

**BSc in Computer Science and Engineering** — Dhaka International University, 2020
Graduated in 2020; entered the industry in early 2022 as the COVID-19 pandemic disrupted the job market.

Certificate in Mobile Application Development (Android) — BITM, 2019 (SEIP, Government of Bangladesh)

---

## Languages

- **Bangla** — Native
- **English** — Professional working proficiency

---

## Availability

Open to full-time roles in Dhaka or remote. Available to join after a standard notice period.
