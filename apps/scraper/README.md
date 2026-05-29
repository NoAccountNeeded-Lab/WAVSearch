# WAVSearch Scraper

Playwright-based scraper engine that collects WAV listings from multiple sources, stores raw HTML, and extracts structured data into the database.

---

## Environment setup

Copy the example env file before running anything:

```bash
cp apps/scraper/.env.example apps/scraper/.env
```

The defaults work for local dev. Optionally set `ANTHROPIC_API_KEY` (or configure Ollama) to enable AI-assisted CSS selector remapping — scraping works without it.

---

## Running a scrape

Make sure `make up` is running so Postgres is available.

### Scheduled (automatic)

`make dev` starts the scraper service, which runs sources on their configured cron schedules:

| Source       | Schedule       |
| ------------ | -------------- |
| BLVD.com     | Every 6 hours  |
| MobilityWorks | Every 8 hours |

### One-off (manual seed)

```bash
# Scrape BLVD.com (up to 10 pages by default)
pnpm --filter @wav-search/scraper exec tsx src/seed.ts

# Scrape MobilityWorks
pnpm --filter @wav-search/scraper exec tsx src/seed-mobilityworks.ts

# Limit pages for a quick test
MAX_PAGES=1 pnpm --filter @wav-search/scraper exec tsx src/seed.ts
```

---

## Post-scrape pipeline

Run these after seeding to fully populate listing data. They must run in order.

### 1. Detail crawl

Fetches the raw HTML for each listing page that hasn't been detail-scraped yet.

```bash
pnpm --filter @wav-search/scraper job:detail-crawl
```

### 2. Detail extract

Processes stored raw HTML into structured listing fields. No network requests — works entirely from what the crawl saved.

```bash
pnpm --filter @wav-search/scraper job:detail-extract
```

When running via `make dev`, these jobs also run automatically (crawl hourly, extract every 5 minutes).

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
