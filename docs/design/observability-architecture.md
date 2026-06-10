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
  (log store)  (metrics,     New Relic / Better Stack
               planned #260)
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

1. `docker compose --profile obs up` (or `make up-obs`) starts Alloy, Loki, and Grafana.
2. App containers emit structured JSON (`LOG_FORMAT=json` is set in docker-compose.yml for all containerised services).
3. Alloy tails Docker log streams via the Docker socket, labels logs by `service` and `project`, and ships to Loki.
4. Grafana at `http://localhost:3003` queries Loki — no login required (anonymous admin, bound to `127.0.0.1` only).

   > **Security note**: Grafana runs with anonymous admin access. The localhost-only port bind is the sole mitigation. Never run `--profile obs` on a shared or cloud-hosted machine without changing `GF_AUTH_ANONYMOUS_ORG_ROLE` to `Viewer` and enabling login.

5. Use the Explore tab in Grafana with LogQL to query by field, e.g.:
   - `{service="api"} | json` — all API logs
   - `{service="api", env="development"} | json` — filter by indexed `env` label
   - `{project="wivwav"} | json | level="error"` — errors across all app containers
6. `/ops/logs` in the web app (#256, planned) will provide an in-app log query UI.

> Prometheus metrics (#260) are a separate phase and are not part of this initial stack.

When running in Docker (`docker compose up`) **without** `--profile obs`, app containers still emit JSON (because `LOG_FORMAT=json` is set unconditionally in docker-compose.yml) but nothing collects those logs beyond `docker compose logs`. The observability stack is opt-in.

When running locally with `pnpm dev` (no Docker), `LOG_FORMAT` is not set so pino defaults to pretty-printed output.

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

Alloy is configured with a disk-backed write-ahead log (WAL) stored in the
`alloy_data` named volume (`/var/lib/alloy/data`). Settings per `loki.write` block:

| Setting | Value | Notes |
|---------|-------|-------|
| `max_wal_size` (local) | 1 GB | Covers hours of normal throughput before back-pressure |
| `max_wal_size` (SaaS) | 512 MB | Proportionate to SaaS push volume |
| `max_segment_age` | 30 min | WAL segments are rotated and evicted after 30 minutes |
| `queue_config.capacity` | 10 000 batches | In-memory queue feeding the WAL |
| `queue_config.drain_timeout` | 30 s | Flush time on graceful shutdown |
| `retry_on_http_429` | true | Re-queues batches on rate-limit responses |

Retry back-off is exponential (default: ~500 ms min, ~5 min max), handled by Alloy.

---

## Testing fan-out to more than one provider

No code changes are needed to add a second log destination. The app always emits
once to stdout; Alloy routes the stream. To test fan-out:

1. **Choose a provider** from the commented blocks at the bottom of
   `docker/alloy/config.alloy` (Better Stack or Grafana Cloud Loki are provided
   as examples).

2. **Uncomment the `loki.write` block** for that provider in `config.alloy`.

3. **Add the receiver** to the `forward_to` list in `loki.process.extract_labels`:
   ```
   forward_to = [loki.write.local.receiver, loki.write.better_stack.receiver]
   ```

4. **Set the API key** as an environment variable on the `alloy` service in
   `docker-compose.yml`. The alloy service has a single commented `environment:`
   block; uncomment it and uncomment the variable(s) for your provider. YAML
   requires exactly one `environment:` key per service — add new provider
   variables inside the same block rather than adding a second `environment:` key.
   Set the value in a local `.env` file or export it in your shell:
   ```
   export BETTER_STACK_SOURCE_TOKEN=your_token_here
   ```

5. **Restart Alloy** — no other containers need to restart:
   ```bash
   docker compose --profile obs up -d alloy
   ```

6. **Verify** — tail Alloy logs for any push errors, and check the SaaS portal
   for incoming log entries:
   ```bash
   docker compose --profile obs logs -f alloy
   ```

To remove the provider, revert steps 2–4 and restart Alloy. The app is unaffected
throughout. The `level` label is indexed at step 4, so provider queries such as
`{service="api", level="error"}` work identically in Grafana, Better Stack, and
Grafana Cloud.

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
