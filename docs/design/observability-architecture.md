# Observability Architecture

Issues: #255 #256 #257 #258 #259 #260 #263 #272 #273

## Goal

Give operators a local-first view into what WivWav is doing without coupling
app code to any telemetry vendor. Errors, logs, traces, and metrics all follow
the same pattern: **the app emits once; the collector routes everywhere.**

---

## Core principle: app emits once

Application packages (`apps/api`, `apps/scraper`, `apps/web`) write structured
JSON to stdout via `packages/logger` (pino). They never import Loki, Grafana,
Sentry, New Relic, or any other provider SDK. Vendor routing is a collector
concern, not an app concern.

This keeps app code testable and portable. Switching or adding a destination
requires a collector config change, not a code change.

---

## Signal types

| Signal | What it answers | Primary destination |
|--------|----------------|---------------------|
| **Logs** | What happened and when | Loki → Grafana / `/ops/logs` |
| **Traces** | How long did each step take, where did it fail | Loki (structured fields) for now; OTel exporter later |
| **Metrics** | Is the system healthy right now | Prometheus → Grafana |
| **Errors** | Did users hit exceptions | Sentry (direct SDK, see below) |

---

## Pipeline overview

```
┌─────────────────────────────────────────────────────┐
│  App containers (api, scraper, web)                 │
│  stdout → structured JSON (pino, LOG_FORMAT=json)   │
└──────────────────────┬──────────────────────────────┘
                       │ Docker log stream
                       ▼
           ┌───────────────────────┐
           │  Grafana Alloy        │  ← single collector agent
           │  (collector/router)   │    handles logs + metrics
           └──────┬────────────────┘
                  │
       ┌──────────┼──────────────┐
       ▼          ▼              ▼
    Loki       Prometheus    (optional SaaS)
  (log store)  (metrics)    New Relic / Better Stack
       │          │           enabled by collector config,
       └────┬─────┘           never by app code
            ▼
         Grafana
       (dashboards)
            │
            ▼
       /ops/logs  (internal Next.js UI, queries Loki)
       /ops       (metrics panels)
```

**Sentry** is a separate path. Its SDK calls `sentry.io` directly from the app
on unhandled exceptions. This is intentional — error capture on crash needs a
direct flush path that doesn't depend on the collector being up.

---

## App-level controls vs collector-level routing

### App controls (env vars, no DB config)

| Env var | Effect |
|---------|--------|
| `LOG_LEVEL` | Minimum log level (`debug`, `info`, `warn`, `error`) |
| `LOG_FORMAT=json` | Force JSON output even in dev (required when collector runs) — implemented in `packages/logger/src/logger.ts` |

App config is deliberately narrow. The app has no knowledge of destinations.

### Collector controls (Alloy config)

| Concern | Owner |
|---------|-------|
| Which providers are enabled | Alloy config |
| SaaS API keys | Injected as Docker secrets at Alloy startup |
| Disk buffer size and path | Alloy config |
| Retry and backoff for SaaS exporters | Alloy config |
| Sampling rates | Alloy config |
| Log label extraction | Alloy pipeline config |

SaaS exporters are **disabled by default**. Local Loki/Prometheus/Grafana work
with no external credentials.

---

## Local dev flow

> **Forward-looking** — the `obs` profile and its services (Alloy, Loki, Prometheus,
> Grafana) are defined in #255. Until that issue is merged, running the stack below
> is not yet possible. This section documents the intended flow.

1. `docker compose --profile obs up` starts Alloy, Loki, Prometheus, Grafana.
2. App containers write JSON to stdout (`LOG_FORMAT=json` set in the obs profile).
3. Alloy tails Docker log streams and ships to Loki; scrapes Prometheus metrics.
4. Grafana at `http://localhost:3003` queries Loki and Prometheus.
5. `/ops/logs` in the web app queries Loki via the API.

Without `--profile obs`, apps run normally with pretty-printed dev logs — no
collector, no Loki, no Grafana. The observability stack is opt-in locally.

---

## Production flow

1. Alloy runs as a sidecar or separate service.
2. Same Alloy config with SaaS exporter blocks uncommented and secrets injected.
3. Loki and Prometheus may be self-hosted or replaced by managed equivalents
   (Grafana Cloud, etc.) — app code is unaffected.
4. Sentry captures frontend and API unhandled exceptions independently.

---

## Durability and failure expectations

### Log loss scenarios

| Scenario | Risk | Mitigation |
|----------|------|-----------|
| Alloy crashes briefly | Low — Docker buffers ~10 MB per container stdout | Disk buffer on Alloy covers gaps beyond Docker buffer |
| Loki crashes | Medium — in-flight lines lost without buffer | Alloy disk buffer (named volume) holds hours of throughput |
| App container OOMs and is killed | Low — pino writes synchronously to stdout | Nothing further needed |
| Docker restarts wipe Loki data | High if volume is ephemeral | `loki_data` named Docker volume prevents this |

This is a **best-effort** log pipeline, not a durable message bus. Operational
logs are for debugging, not compliance. A few dropped lines during infra restarts
is acceptable; silent outages are not.

Sentry has its own SDK-level retry and is the authoritative source for
production error capture.

### Disk buffer configuration

Alloy should be configured with a disk-backed buffer (WAL) with a named volume
(`alloy_data`). Buffer size: 1 GB. This covers hours of normal throughput before
back-pressure causes drops.

---

## Structured log fields

All services use `packages/logger` which binds these fields automatically:

| Field | Source | Use |
|-------|--------|-----|
| `service` | Logger init | Filter by container (api, scraper, web) |
| `env` | Logger init | Filter by environment |
| `level` | Pino | Severity filter |
| `requestId` | Fastify (auto) | Correlate all lines for one HTTP request |
| `runId` | Manual — scraper engine | Correlate all lines for one scraper run |
| `jobId` | BullMQ worker factory (auto) | Correlate all lines for one job |
| `queue` | BullMQ worker factory (auto) | Filter by queue name |
| `sourceId` | BullMQ worker factory (auto) | Filter by scrape source |
| `listingId` | Manual — listing-level operations | Filter by listing |
| `provider` | Manual — AI operations | Filter by AI provider (ollama, anthropic) |
| `model` | Manual — AI operations | Filter by model name |
| `traceId` | Job data convention (opt-in, planned #273) | Correlate API request → queued job → worker |
| `durationMs` | Manual — helper from #257 | Timing for domain operations |

### Cross-service correlation (planned)

`requestId` is set by Fastify per HTTP request but is not yet propagated:

- **Web → API** (#272): Next.js should forward `x-request-id` on internal API
  calls; Fastify should adopt it when present.
- **API → scraper** (#273): Jobs enqueued by an API request should carry
  `traceId: requestId` in the job data payload; the worker factory extracts it
  and binds it to the child logger.

Until these are implemented, correlation stops at service boundaries.

---

## Why BullMQ job logs are not the central pipeline

BullMQ stores job logs in Redis via `job.log(message)`. These are useful for
the Bull Board UI and for inspecting a specific job's progress in real time.
They are **not** a log pipeline:

- Plain text strings, not structured JSON.
- Redis is ephemeral — logs are evicted with the job record.
- No field indexing, no retention, no cross-job search.

BullMQ job logs and stdout structured logs coexist. Job logs are for operational
quick-look; Loki is for querying across jobs and services.

---

## Implementation phases

| Phase | Issues | Dependency |
|-------|--------|------------|
| 1 — Arch doc | #259 (this) | — |
| 2 — Log pipeline | #255 (Alloy + Loki + Grafana compose stack) | — |
| 3 — Instrumentation | #257 (Fastify + BullMQ lifecycle hooks, timing helper) | — |
| 4 — Fan-out + buffer | #258 (Alloy multi-exporter, disk WAL) | #255 |
| 5 — Logs UI | #256 (`/ops/logs` page) | #255 |
| 6 — Correlation | #272 (web→API requestId), #273 (traceId through jobs) | #255, #257 |
| 7 — Metrics | #260 (Prometheus metrics, Grafana dashboards) | #258 |
| 8 — Error monitoring | #263 (Sentry SDK, source maps) | #257 |

Phases 2 and 3 have no dependency on each other and can be parallelised.

---

## What not to do

- **Do not** import `loki-logger`, `winston-loki`, or any Loki transport in app
  packages. The collector handles delivery.
- **Do not** add pino transports in production config. Transports run in a
  worker thread and add async overhead; the collector reads stdout directly.
- **Do not** put SaaS credentials in app environment variables. Secrets belong
  in the collector config.
- **Do not** use `console.log` in production app code. All logging goes through
  `packages/logger` so fields are structured and redaction is applied.
