# WivWav Scraper

Playwright-based scraper engine that collects WAV listings from multiple sources, stores raw HTML, and extracts structured data into the database.

---

## Environment setup

Copy the example env file before running anything:

```bash
cp apps/scraper/.env.example apps/scraper/.env
```

The defaults work for local dev. To enable AI-assisted CSS selector remapping, configure a provider via `/ops/ai` (Ollama for local, Anthropic for production — API key stored encrypted in the config DB). Scraping works without it — layout-changed sources are flagged for manual review.

---

## Running a scrape

Make sure `make up` is running so Postgres is available.

### Scheduled (automatic)

`make dev` starts the scraper service, which runs sources on their configured cron schedules:

| Source       | Schedule       |
| ------------ | -------------- |
| BLVD.com     | Every 6 hours  |
| MobilityWorks | Every 8 hours |

### One-off (manual trigger)

With the scraper service running, enqueue a source immediately via the admin API:

```bash
# List sources to get their IDs
curl http://localhost:3001/v1/admin/sources

# Trigger a scrape for a specific source
curl -X POST http://localhost:3001/v1/admin/sources/<id>/run
```

The job will appear in Bull Board and trigger the full downstream pipeline.

---

## Post-scrape pipeline

When a scrape is triggered via the queue, the downstream jobs run automatically on their own schedules (crawl hourly, extract every 5 minutes, geocode/deduplicate nightly). To trigger one manually:

```bash
# Detail crawl (requires sourceId)
curl -X POST http://localhost:3001/v1/admin/queues/detail-crawl/jobs \
  -H "Content-Type: application/json" \
  -d '{"data": {"sourceId": "<id>"}}'

# Detail extract (requires sourceId)
curl -X POST http://localhost:3001/v1/admin/queues/detail-extract/jobs \
  -H "Content-Type: application/json" \
  -d '{"data": {"sourceId": "<id>"}}'

# Geocode or deduplicate (no payload needed)
curl -X POST http://localhost:3001/v1/admin/queues/geocode/jobs -d '{}'
curl -X POST http://localhost:3001/v1/admin/queues/deduplicate/jobs -d '{}'
```

### 3. Sync to Meilisearch

Pushes all DB listings into the search index so they appear on the site. Requires the API to be running.

```bash
curl -X POST http://localhost:3001/v1/listings/sync
```

---

## Sources

| Source        | Adapter                          |
| ------------- | -------------------------------- |
| BLVD.com      | `src/sources/blvd.ts`            |
| MobilityWorks | `src/sources/mobilityworks.ts`   |
