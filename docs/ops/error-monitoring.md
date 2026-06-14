# Error Monitoring — Sentry Runbook

WivWav uses [Sentry](https://sentry.io) for error monitoring across all three services:
`apps/web` (Next.js), `apps/api` (Fastify), and `apps/scraper` (BullMQ workers).

## Dashboard

Once your Sentry project is configured, your dashboards are at:

```
https://sentry.io/organizations/<your-org>/issues/
```

Filter by project to narrow to a specific service:

| Service | Sentry project filter |
|---------|----------------------|
| Web (frontend + API routes) | `wivwav-web` (or your project name) |
| API | `wivwav-api` |
| Scraper | `wivwav-scraper` |

## Setting up Sentry (first time)

1. Create an account at <https://sentry.io> (free tier is sufficient for pre-beta).
2. Create **three projects** — one per service — all under the same organisation.
3. Copy the DSN for each project from **Settings → Projects → \<project\> → Client Keys**.
4. Add the DSNs to each service's environment:

   **`apps/web/.env.local`** (local) or your hosting provider's env config:
   ```
   NEXT_PUBLIC_SENTRY_DSN=https://...@o<id>.ingest.sentry.io/<project-id>
   SENTRY_DSN=https://...@o<id>.ingest.sentry.io/<project-id>
   SENTRY_ORG=your-org-slug
   SENTRY_PROJECT=wivwav-web
   SENTRY_AUTH_TOKEN=<token from sentry.io/settings/auth-tokens/>
   ```

   **`apps/api/.env`**:
   ```
   SENTRY_DSN=https://...@o<id>.ingest.sentry.io/<project-id>
   ```

   **`apps/scraper/.env`**:
   ```
   SENTRY_DSN=https://...@o<id>.ingest.sentry.io/<project-id>
   ```

5. For CI/CD source map upload, set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and
   `SENTRY_PROJECT` as secrets in your CI environment. The Next.js build will
   upload source maps automatically when the auth token is present.

## Triggering a test error

### Web (browser)

Navigate to the page you want to test and open the browser console:

```js
throw new Error('Sentry test error from browser')
```

Or add a temporary button to any page that calls `Sentry.captureException(new Error('test'))`.

### API

Temporarily add a staging-only route that throws an unhandled exception, send a
request to it, confirm the event in Sentry, then remove the route before merging.
Do not leave a permanent public test-error endpoint in the API.

```bash
curl -X POST https://api.staging.example.com/<temporary-test-error-route>
```

If you prefer not to add a route, trigger a deliberately bad staging job payload
from Bull Board and confirm the resulting API or scraper exception in Sentry.

### Scraper

Temporarily throw inside a BullMQ job processor and enqueue the job via the
Bull Board UI at `/admin/board`. The `withSentryCapture` wrapper will forward
the error to Sentry before BullMQ marks the job as failed.

## Alerting

Configure alerts in Sentry at **Alerts → Create Alert Rule**:

| Rule | Condition | Action |
|------|-----------|--------|
| P0 — High volume | > 10 events in 1 minute | Slack `#ops-alerts` + email |
| P1 — New issue | First occurrence of issue | Email |
| P1 — Regression | Issue resolved then reappears | Slack `#ops-alerts` |

Recommended notification integrations: Slack (via Sentry → Settings → Integrations → Slack)
or email to your team alias.

## PII scrubbing

All three services apply `beforeSend` scrubbing before events leave the process:

- **VINs** — replaced with `[VIN]` (pattern: 17 alphanumeric chars, no I/O/Q)
- **User IPs** — `event.user.ip_address` and IP-carrying request headers
  (`x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`, `forwarded`) deleted
- **Dealer contact fields** — `email`, `phone`, `dealer_email`, `dealer_phone`,
  `contact` keys removed from `event.extra`

All services also apply `beforeBreadcrumb` scrubbing so VINs in navigation or
HTTP breadcrumb URLs are replaced before the next error event is transmitted.

Additional server-side scrubbing can be configured at **Settings → Projects →
\<project\> → Data Scrubbing** in the Sentry UI.

## Source maps

Source maps are uploaded during `next build` when `SENTRY_AUTH_TOKEN` is set.
After upload they are deleted from the build output (`sourcemaps.deleteSourcemapsAfterUpload: true`
in `next.config.ts`) so they are never served to browsers.
Stack traces in the Sentry dashboard will show original TypeScript line numbers.

If stack traces show minified code, verify:

1. `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` were set at build time.
2. The Sentry project name matches exactly (case-sensitive).
3. Check build logs for `Sentry source maps upload` output.

Browser events use the local `/api/monitoring` tunnel path, which forwards
Sentry envelopes to Sentry ingest from the Next.js App Router.

## Quota management

The free tier allows 5 000 errors/month. To stay within quota:

- `tracesSampleRate` is set to `0.1` (10 %) in production — only 10 % of
  transactions are traced.
- Browser replay sample rate is 1 % for normal web sessions, 100 % on web errors.
- Use Sentry's **Inbound Filters** to ignore known low-signal errors
  (e.g. browser extension noise, `ResizeObserver` loop errors).

## Architecture note

Sentry is the **only** vendor SDK imported directly into app code. All other
observability (logs, metrics, traces) flows through stdout → Grafana Alloy →
Loki/Prometheus. This is intentional: error capture on crash requires a direct
SDK flush path that does not depend on the collector being available.

See `docs/design/observability-architecture.md` for the full observability design.
