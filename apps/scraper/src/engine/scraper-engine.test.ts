import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScraperEngine } from './scraper-engine.js'
import type { ScraperRunRepository, SourceRepository, ListingRepository } from './repositories.js'
import type { SourceAdapter, ScrapeResult, StructureCheckResult } from './source-adapter.js'
import type { StructureDetector } from '../ai/structure-detector.js'

function makeRuns(): ScraperRunRepository {
  return {
    start: vi.fn().mockResolvedValue({ id: 'run-1' }),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  }
}

function makeSources(): SourceRepository {
  return {
    markNeedsRemapping: vi.fn().mockResolvedValue(undefined),
    markActive: vi.fn().mockResolvedValue(undefined),
    markError: vi.fn().mockResolvedValue(undefined),
  }
}

function makeListings(): ListingRepository {
  return { upsert: vi.fn().mockResolvedValue(undefined) }
}

function makeDetector(): StructureDetector {
  return { remapFields: vi.fn() } as unknown as StructureDetector
}

function makeAdapter(sourceId: string, overrides: Partial<SourceAdapter> = {}): SourceAdapter {
  const unchanged: StructureCheckResult = { changed: false, currentHash: 'abc', previousHash: null }
  const emptyResult: ScrapeResult = { listings: [], fingerprintHash: 'abc' }
  return {
    sourceId,
    name: sourceId,
    checkStructure: vi.fn().mockResolvedValue(unchanged),
    scrape: vi.fn().mockResolvedValue(emptyResult),
    ...overrides,
  }
}

describe('ScraperEngine', () => {
  let runs: ScraperRunRepository
  let sources: SourceRepository
  let listings: ListingRepository

  beforeEach(() => {
    runs = makeRuns()
    sources = makeSources()
    listings = makeListings()
  })

  function build() {
    return new ScraperEngine({ runs, sources, listings, structureDetector: makeDetector() })
  }

  it('throws when no adapter is registered for the source', async () => {
    const engine = build()
    await expect(engine.runSource('unknown')).rejects.toThrow('No adapter registered for source: unknown')
  })

  it('completes a successful scrape with no listings', async () => {
    const engine = build()
    const adapter = makeAdapter('src-1')
    engine.register(adapter)

    await engine.runSource('src-1')

    expect(runs.start).toHaveBeenCalledWith('src-1')
    expect(runs.complete).toHaveBeenCalledWith('run-1', 0)
    expect(sources.markActive).toHaveBeenCalledWith('src-1', { listingCount: 0, fingerprintHash: 'abc' })
    expect(listings.upsert).not.toHaveBeenCalled()
  })

  it('marks source needs_remapping when structure changes', async () => {
    const engine = build()
    const changed: StructureCheckResult = { changed: true, currentHash: 'new', previousHash: 'old' }
    const adapter = makeAdapter('src-1', { checkStructure: vi.fn().mockResolvedValue(changed) })
    engine.register(adapter)

    await engine.runSource('src-1')

    expect(sources.markNeedsRemapping).toHaveBeenCalledWith('src-1')
    expect(runs.fail).toHaveBeenCalledWith('run-1', 'Structure change detected')
    expect(adapter.scrape).not.toHaveBeenCalled()
  })

  it('marks error and rethrows when scrape throws', async () => {
    const engine = build()
    const adapter = makeAdapter('src-1', {
      scrape: vi.fn().mockRejectedValue(new Error('network timeout')),
    })
    engine.register(adapter)

    await expect(engine.runSource('src-1')).rejects.toThrow('network timeout')
    expect(runs.fail).toHaveBeenCalledWith('run-1', 'network timeout')
    expect(sources.markError).toHaveBeenCalledWith('src-1', 'network timeout')
  })
})
