import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScraperEngine } from './scraper-engine.js'
import type { ScraperRunRepository, SourceRepository, ListingRepository } from './repositories.js'
import type { SourceAdapter, ScrapeResult, StructureCheckResult, Page1CheckResult } from './source-adapter.js'
import type { StructureDetector } from '../ai/structure-detector.js'
import type { JobContext } from '@wav-search/queue'

vi.mock('../jobs/geocode.js', () => ({
  runGeocodeJob: vi.fn().mockResolvedValue(undefined),
}))

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
    markChecked: vi.fn().mockResolvedValue(undefined),
    markError: vi.fn().mockResolvedValue(undefined),
    getMappings: vi.fn().mockResolvedValue([]),
    setMappings: vi.fn().mockResolvedValue(undefined),
  }
}

function makeListings(): ListingRepository {
  return {
    upsert: vi.fn().mockResolvedValue(undefined),
    markGone: vi.fn().mockResolvedValue(0),
  }
}

function makeDetector(confidence = 0.9): StructureDetector {
  return {
    remapFields: vi.fn().mockResolvedValue({
      mappings: [{ targetField: 'make', selector: 'h1', attribute: null, transform: null }],
      confidence,
      notes: 'Selectors updated',
    }),
  } as unknown as StructureDetector
}

function makeContext(): JobContext {
  return {
    log: vi.fn().mockResolvedValue(undefined),
    updateProgress: vi.fn().mockResolvedValue(undefined),
  }
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

function makeAdapterWithPage1(sourceId: string, page1Changed: boolean, overrides: Partial<SourceAdapter> = {}): SourceAdapter {
  const page1Result: Page1CheckResult = { currentHash: 'page1-hash', changed: page1Changed }
  return makeAdapter(sourceId, {
    checkPage1: vi.fn().mockResolvedValue(page1Result),
    ...overrides,
  })
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

  function build(confidence = 0.9) {
    return new ScraperEngine({ runs, sources, listings, structureDetector: makeDetector(confidence) })
  }

  it('throws when no adapter is registered for the source', async () => {
    const engine = build()
    await expect(engine.runSource('unknown')).rejects.toThrow('No adapter registered for source: unknown')
  })

  it('completes a successful scrape with no listings', async () => {
    const engine = build()
    const adapter = makeAdapter('src-1')
    engine.register(adapter, adapter.sourceId)

    await engine.runSource('src-1')

    expect(runs.start).toHaveBeenCalledWith('src-1')
    expect(runs.complete).toHaveBeenCalledWith('run-1', 0)
    expect(sources.markActive).toHaveBeenCalledWith('src-1', { listingCount: 0, fingerprintHash: 'abc' })
    expect(listings.upsert).not.toHaveBeenCalled()
  })

  // ─── page 1 gatekeeper ───────────────────────────────────────────────────────

  it('skips full crawl, completes with 0, and calls markChecked when page 1 hash is unchanged', async () => {
    const engine = build()
    const context = makeContext()
    const adapter = makeAdapterWithPage1('src-1', false)
    engine.register(adapter, adapter.sourceId)

    await engine.runSource('src-1', context)

    expect(adapter.checkPage1).toHaveBeenCalled()
    expect(adapter.checkStructure).not.toHaveBeenCalled()
    expect(adapter.scrape).not.toHaveBeenCalled()
    expect(runs.complete).toHaveBeenCalledWith('run-1', 0)
    expect(sources.markChecked).toHaveBeenCalledWith('src-1')
    expect(sources.markActive).not.toHaveBeenCalled()
    expect(context.log).toHaveBeenCalledWith(expect.stringContaining('Page 1 unchanged'))
    expect(context.updateProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'no_changes' }))
  })

  it('proceeds with full crawl when page 1 hash changes', async () => {
    const engine = build()
    const adapter = makeAdapterWithPage1('src-1', true)
    engine.register(adapter, adapter.sourceId)

    await engine.runSource('src-1')

    expect(adapter.checkPage1).toHaveBeenCalled()
    expect(adapter.checkStructure).toHaveBeenCalled()
    expect(adapter.scrape).toHaveBeenCalled()
    expect(sources.markActive).toHaveBeenCalledWith('src-1', expect.objectContaining({ page1Hash: 'page1-hash' }))
  })

  it('proceeds with full crawl when adapter has no checkPage1 (backward compat)', async () => {
    const engine = build()
    const adapter = makeAdapter('src-1')
    engine.register(adapter, adapter.sourceId)

    await engine.runSource('src-1')

    expect(adapter.checkStructure).toHaveBeenCalled()
    expect(adapter.scrape).toHaveBeenCalled()
    expect(sources.markActive).toHaveBeenCalledWith('src-1', { listingCount: 0, fingerprintHash: 'abc' })
  })

  // ─── structure change: no sampleHtml ────────────────────────────────────────

  it('marks needs_remapping when structure changes and no sampleHtml is provided', async () => {
    const engine = build()
    const context = makeContext()
    const changed: StructureCheckResult = { changed: true, currentHash: 'new', previousHash: 'old' }
    const adapter = makeAdapter('src-1', { checkStructure: vi.fn().mockResolvedValue(changed) })
    engine.register(adapter, adapter.sourceId)

    await engine.runSource('src-1', context)

    expect(sources.markNeedsRemapping).toHaveBeenCalledWith('src-1')
    expect(runs.fail).toHaveBeenCalledWith('run-1', 'Structure change detected')
    expect(adapter.scrape).not.toHaveBeenCalled()
    expect(context.log).toHaveBeenCalledWith(expect.stringContaining('no sample HTML was captured'))
    expect(context.updateProgress).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'blocked',
      reason: 'structure_changed_no_sample_html',
    }))
  })

  it('marks needs_remapping when structure changes, sampleHtml is present, but detector is null (AI unavailable)', async () => {
    const engine = new ScraperEngine({ runs, sources, listings, structureDetector: null })
    const context = makeContext()
    const changed: StructureCheckResult = {
      changed: true, currentHash: 'new', previousHash: 'old', sampleHtml: '<html>updated</html>',
    }
    const adapter = makeAdapter('src-1', { checkStructure: vi.fn().mockResolvedValue(changed) })
    engine.register(adapter, adapter.sourceId)

    await engine.runSource('src-1', context)

    expect(sources.markNeedsRemapping).toHaveBeenCalledWith('src-1')
    expect(runs.fail).toHaveBeenCalledWith('run-1', 'Structure change detected')
    expect(adapter.scrape).not.toHaveBeenCalled()
    expect(context.log).toHaveBeenCalledWith(expect.stringContaining('AI remapping is unavailable'))
    expect(context.updateProgress).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'blocked',
      reason: 'structure_changed_ai_unavailable',
    }))
  })

  // ─── structure change: with sampleHtml, high confidence ─────────────────────

  it('calls remapFields with sampleHtml and stores new mappings', async () => {
    const detector = makeDetector(0.9)
    const engine = new ScraperEngine({ runs, sources, listings, structureDetector: detector })
    const changed: StructureCheckResult = {
      changed: true, currentHash: 'new', previousHash: 'old', sampleHtml: '<html>updated</html>',
    }
    const adapter = makeAdapter('src-1', { checkStructure: vi.fn().mockResolvedValue(changed) })
    engine.register(adapter, adapter.sourceId)

    await engine.runSource('src-1')

    expect(detector.remapFields).toHaveBeenCalledWith({
      sourceName: 'src-1',
      previousMappings: [],
      sampleHtml: '<html>updated</html>',
    })
    expect(sources.setMappings).toHaveBeenCalledWith('src-1', expect.any(Array))
  })

  it('proceeds with scrape on high-confidence remap', async () => {
    const engine = build(0.9)
    const changed: StructureCheckResult = {
      changed: true, currentHash: 'new', previousHash: 'old', sampleHtml: '<html>',
    }
    const adapter = makeAdapter('src-1', { checkStructure: vi.fn().mockResolvedValue(changed) })
    engine.register(adapter, adapter.sourceId)

    await engine.runSource('src-1')

    expect(adapter.scrape).toHaveBeenCalled()
    expect(sources.markNeedsRemapping).not.toHaveBeenCalled()
  })

  // ─── structure change: with sampleHtml, low confidence ──────────────────────

  it('marks needs_remapping and fails run on low-confidence remap', async () => {
    const engine = build(0.4)
    const context = makeContext()
    const changed: StructureCheckResult = {
      changed: true, currentHash: 'new', previousHash: 'old', sampleHtml: '<html>',
    }
    const adapter = makeAdapter('src-1', { checkStructure: vi.fn().mockResolvedValue(changed) })
    engine.register(adapter, adapter.sourceId)

    await engine.runSource('src-1', context)

    expect(sources.markNeedsRemapping).toHaveBeenCalledWith('src-1')
    expect(adapter.scrape).not.toHaveBeenCalled()
    expect(runs.fail).toHaveBeenCalledWith('run-1', expect.stringContaining('low-confidence'))
    expect(context.updateProgress).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'blocked',
      reason: 'structure_changed_low_confidence_remap',
    }))
  })

  // ─── gone detection ─────────────────────────────────────────────────────────

  it('calls markGone with scraped externalIds after a successful run', async () => {
    const engine = build()
    const listing = {
      sourceId: 'src-1', sourceUrl: 'http://x.com/1', externalId: 'ext-1',
      make: 'Toyota', model: 'Sienna', year: 2022, trim: null, vin: null,
      condition: 'used' as const, sellerType: 'dealer' as const,
      priceCents: null, mileage: null, color: null, fuelType: null, transmission: null,
      wav: { conversionType: 'unknown' as const, conversionManufacturer: null, floorLoweringInches: null, rampType: 'unknown' as const, hasLift: false, handControls: false, transferSeat: false, wheelchairCapacity: null },
      location: { zip: null, city: null, state: null, lat: null, lng: null },
      dealer: { name: null, phone: null, website: null },
      images: [], description: null, listedAt: new Date(),
    }
    const adapter = makeAdapter('src-1', {
      scrape: vi.fn().mockResolvedValue({ listings: [listing], fingerprintHash: 'abc' }),
    })
    engine.register(adapter, adapter.sourceId)

    await engine.runSource('src-1')

    expect(listings.markGone).toHaveBeenCalledWith('src-1', ['ext-1'])
  })

  it('uses the registered DB source id when upserting adapter listings', async () => {
    const engine = build()
    const listing = {
      sourceId: 'adapter-source-key', sourceUrl: 'http://x.com/1', externalId: 'ext-1',
      make: 'Toyota', model: 'Sienna', year: 2022, trim: null, vin: null,
      condition: 'used' as const, sellerType: 'dealer' as const,
      priceCents: null, mileage: null, color: null, fuelType: null, transmission: null,
      wav: { conversionType: 'unknown' as const, conversionManufacturer: null, floorLoweringInches: null, rampType: 'unknown' as const, hasLift: false, handControls: false, transferSeat: false, wheelchairCapacity: null },
      location: { zip: null, city: null, state: null, lat: null, lng: null },
      dealer: { name: null, phone: null, website: null },
      images: [], description: null, listedAt: new Date(),
    }
    const adapter = makeAdapter('adapter-source-key', {
      scrape: vi.fn().mockResolvedValue({ listings: [listing], fingerprintHash: 'abc' }),
    })
    engine.register(adapter, 'db-source-id')

    await engine.runSource('db-source-id')

    expect(listings.upsert).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'db-source-id' }))
  })

  it('excludes null externalIds from the markGone call', async () => {
    const engine = build()
    const listing = {
      sourceId: 'src-1', sourceUrl: 'http://x.com/1', externalId: null,
      make: 'Toyota', model: 'Sienna', year: 2022, trim: null, vin: null,
      condition: 'used' as const, sellerType: 'dealer' as const,
      priceCents: null, mileage: null, color: null, fuelType: null, transmission: null,
      wav: { conversionType: 'unknown' as const, conversionManufacturer: null, floorLoweringInches: null, rampType: 'unknown' as const, hasLift: false, handControls: false, transferSeat: false, wheelchairCapacity: null },
      location: { zip: null, city: null, state: null, lat: null, lng: null },
      dealer: { name: null, phone: null, website: null },
      images: [], description: null, listedAt: new Date(),
    }
    const adapter = makeAdapter('src-1', {
      scrape: vi.fn().mockResolvedValue({ listings: [listing], fingerprintHash: 'abc' }),
    })
    engine.register(adapter, adapter.sourceId)

    await engine.runSource('src-1')

    expect(listings.markGone).toHaveBeenCalledWith('src-1', [])
  })

  // ─── scrape error ────────────────────────────────────────────────────────────

  it('marks error and rethrows when scrape throws', async () => {
    const engine = build()
    const adapter = makeAdapter('src-1', {
      scrape: vi.fn().mockRejectedValue(new Error('network timeout')),
    })
    engine.register(adapter, adapter.sourceId)

    await expect(engine.runSource('src-1')).rejects.toThrow('network timeout')
    expect(runs.fail).toHaveBeenCalledWith('run-1', 'network timeout')
    expect(sources.markError).toHaveBeenCalledWith('src-1', 'network timeout')
  })
})
