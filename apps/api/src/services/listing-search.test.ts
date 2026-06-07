import { describe, it, expect, vi } from 'vitest'
import { configureListingsIndex, q, priceBucket, mileageBucket, ListingSearchService } from './listing-search.js'
import type { SearchParams } from './listing-search.js'

// ---------------------------------------------------------------------------
// q() — filter value quoting
// ---------------------------------------------------------------------------

describe('q', () => {
  it('wraps a plain value in double quotes', () => {
    expect(q('Toyota')).toBe('"Toyota"')
  })

  it('escapes embedded double quotes', () => {
    expect(q('say "hello"')).toBe('"say \\"hello\\""')
  })

  it('escapes backslashes before double quotes', () => {
    expect(q('C:\\path')).toBe('"C:\\\\path"')
  })

  it('handles an empty string', () => {
    expect(q('')).toBe('""')
  })
})

// ---------------------------------------------------------------------------
// priceBucket — re-exported from @wivwav/search
// ---------------------------------------------------------------------------

describe('priceBucket', () => {
  it('returns null for null price', () => {
    expect(priceBucket(null)).toBeNull()
  })

  it('puts 0 cents in the 0-5000 bucket', () => {
    expect(priceBucket(0)).toBe('0-5000')
  })

  it('puts $4 999.99 in the 0-5000 bucket', () => {
    expect(priceBucket(499999)).toBe('0-5000')
  })

  it('puts exactly $5 000 in the 5000-10000 bucket', () => {
    expect(priceBucket(500000)).toBe('5000-10000')
  })

  it('puts $27 500 in the 25000-30000 bucket', () => {
    expect(priceBucket(2750000)).toBe('25000-30000')
  })

  it('respects a custom bucket size', () => {
    expect(priceBucket(1000000, 10000)).toBe('10000-20000')
  })
})

// ---------------------------------------------------------------------------
// mileageBucket — re-exported from @wivwav/search
// ---------------------------------------------------------------------------

describe('mileageBucket', () => {
  it('returns null for null mileage', () => {
    expect(mileageBucket(null)).toBeNull()
  })

  it('puts 0 miles in the 0-25000 bucket', () => {
    expect(mileageBucket(0)).toBe('0-25000')
  })

  it('puts 24 999 miles in the 0-25000 bucket', () => {
    expect(mileageBucket(24999)).toBe('0-25000')
  })

  it('puts exactly 25 000 miles in the 25000-50000 bucket', () => {
    expect(mileageBucket(25000)).toBe('25000-50000')
  })

  it('puts 87 000 miles in the 75000-100000 bucket', () => {
    expect(mileageBucket(87000)).toBe('75000-100000')
  })
})

// ---------------------------------------------------------------------------
// configureListingsIndex — v0.58 API surface
// ---------------------------------------------------------------------------
//
// The key change in this PR: waitForTask moved from the client root to
// client.tasks, and the option key changed from `timeOutMs` to `timeout`.
// These tests pin both call sites so a regression is immediately visible.

describe('configureListingsIndex', () => {
  function makeClient(overrides: Partial<{ waitForTask: unknown }> = {}) {
    const waitForTask = overrides.waitForTask ?? vi.fn(async () => ({ status: 'succeeded', uid: 42 }))
    const updateSettings = vi.fn(async () => ({ taskUid: 42 }))
    const client = {
      index: vi.fn(() => ({ updateSettings })),
      tasks: { waitForTask },
    }
    return { client, updateSettings, waitForTask: waitForTask as ReturnType<typeof vi.fn> }
  }

  it('calls client.tasks.waitForTask with the task uid returned by updateSettings', async () => {
    const { client, waitForTask } = makeClient()

    await configureListingsIndex(client as never)

    expect(waitForTask).toHaveBeenCalledOnce()
    expect(waitForTask).toHaveBeenCalledWith(42, expect.objectContaining({ timeout: 15_000 }))
  })

  it('does NOT call client.waitForTask (old v0.47 API location)', async () => {
    const rootWaitForTask = vi.fn()
    const { client, waitForTask } = makeClient()
    // Attach a root-level waitForTask to detect if old call path is taken
    const clientWithOldApi = { ...client, waitForTask: rootWaitForTask }

    await configureListingsIndex(clientWithOldApi as never)

    expect(rootWaitForTask).not.toHaveBeenCalled()
    expect(waitForTask).toHaveBeenCalledOnce()
  })

  it('uses timeout option key, not timeOutMs', async () => {
    const { client, waitForTask } = makeClient()

    await configureListingsIndex(client as never)

    const [, options] = waitForTask.mock.calls[0]!
    expect(options).toHaveProperty('timeout', 15_000)
    expect(options).not.toHaveProperty('timeOutMs')
  })

  it('passes the correct timeout value of 15 000 ms', async () => {
    const { client, waitForTask } = makeClient()

    await configureListingsIndex(client as never)

    expect(waitForTask).toHaveBeenCalledWith(expect.any(Number), { timeout: 15_000 })
  })

  it('propagates errors thrown by updateSettings', async () => {
    const err = new Error('Meilisearch unreachable')
    const client = {
      index: vi.fn(() => ({ updateSettings: vi.fn(async () => { throw err }) })),
      tasks: { waitForTask: vi.fn() },
    }

    await expect(configureListingsIndex(client as never)).rejects.toThrow('Meilisearch unreachable')
    expect(client.tasks.waitForTask).not.toHaveBeenCalled()
  })

  it('propagates errors thrown by tasks.waitForTask', async () => {
    const err = new Error('task timed out')
    const { client } = makeClient({ waitForTask: vi.fn(async () => { throw err }) })

    await expect(configureListingsIndex(client as never)).rejects.toThrow('task timed out')
  })

  it('throws when waitForTask resolves with a failed status', async () => {
    const { client } = makeClient({
      waitForTask: vi.fn(async () => ({ status: 'failed', uid: 42 })),
    })

    await expect(configureListingsIndex(client as never)).rejects.toThrow(
      'Meilisearch settings update failed: task 42 ended with status failed',
    )
  })

  it('throws when waitForTask resolves with a canceled status', async () => {
    const { client } = makeClient({
      waitForTask: vi.fn(async () => ({ status: 'canceled', uid: 42 })),
    })

    await expect(configureListingsIndex(client as never)).rejects.toThrow(
      'Meilisearch settings update failed: task 42 ended with status canceled',
    )
  })
})

// ---------------------------------------------------------------------------
// ListingSearchService.search() — filter string construction
// ---------------------------------------------------------------------------
//
// These tests verify that search() builds the Meilisearch filter string
// correctly for each SearchParams field. We mock only the index boundary.

describe('ListingSearchService.search', () => {
  function makeService() {
    const searchMock = vi.fn(async (_query: string, _opts: Record<string, unknown>) => ({
      hits: [] as unknown[],
      estimatedTotalHits: 0 as number | undefined,
      facetDistribution: {} as Record<string, Record<string, number>> | undefined,
    }))
    const client = { index: vi.fn(() => ({ search: searchMock })) }
    const service = new ListingSearchService(client as never)
    return { service, searchMock }
  }

  it('always includes status = "active" filter', async () => {
    const { service, searchMock } = makeService()
    await service.search({})
    const [, opts] = searchMock.mock.calls[0]!
    expect(opts.filter).toMatch(/status = "active"/)
  })

  it('defaults to page 1 and perPage 20', async () => {
    const { service, searchMock } = makeService()
    await service.search({})
    const [, opts] = searchMock.mock.calls[0]!
    expect(opts.offset).toBe(0)
    expect(opts.limit).toBe(20)
  })

  it('computes offset from page and perPage', async () => {
    const { service, searchMock } = makeService()
    await service.search({ page: 3, perPage: 10 })
    const [, opts] = searchMock.mock.calls[0]!
    expect(opts.offset).toBe(20)
    expect(opts.limit).toBe(10)
  })

  it('adds make filter when make is provided', async () => {
    const { service, searchMock } = makeService()
    await service.search({ make: ['Toyota', 'Ford'] })
    const [, opts] = searchMock.mock.calls[0]!
    expect(opts.filter).toContain('make IN ["Toyota", "Ford"]')
  })

  it('adds yearMin and yearMax filters', async () => {
    const { service, searchMock } = makeService()
    await service.search({ yearMin: 2018, yearMax: 2022 })
    const [, opts] = searchMock.mock.calls[0]!
    expect(opts.filter).toContain('year >= 2018')
    expect(opts.filter).toContain('year <= 2022')
  })

  it('adds price range filters', async () => {
    const { service, searchMock } = makeService()
    await service.search({ priceMin: 1000000, priceMax: 5000000 })
    const [, opts] = searchMock.mock.calls[0]!
    expect(opts.filter).toContain('priceCents >= 1000000')
    expect(opts.filter).toContain('priceCents <= 5000000')
  })

  it('adds mileageMax filter', async () => {
    const { service, searchMock } = makeService()
    await service.search({ mileageMax: 50000 })
    const [, opts] = searchMock.mock.calls[0]!
    expect(opts.filter).toContain('mileage <= 50000')
  })

  it('adds hasLift filter for true', async () => {
    const { service, searchMock } = makeService()
    await service.search({ hasLift: true })
    const [, opts] = searchMock.mock.calls[0]!
    expect(opts.filter).toContain('hasLift = true')
  })

  it('adds hasLift filter for false', async () => {
    const { service, searchMock } = makeService()
    await service.search({ hasLift: false })
    const [, opts] = searchMock.mock.calls[0]!
    expect(opts.filter).toContain('hasLift = false')
  })

  it('adds handControls filter', async () => {
    const { service, searchMock } = makeService()
    await service.search({ handControls: true })
    const [, opts] = searchMock.mock.calls[0]!
    expect(opts.filter).toContain('handControls = true')
  })

  it('adds state filter', async () => {
    const { service, searchMock } = makeService()
    await service.search({ state: ['CA', 'TX'] })
    const [, opts] = searchMock.mock.calls[0]!
    expect(opts.filter).toContain('state IN ["CA", "TX"]')
  })

  it('passes sort when provided', async () => {
    const { service, searchMock } = makeService()
    await service.search({ sort: 'priceCents:asc' })
    const [, opts] = searchMock.mock.calls[0]!
    expect(opts.sort).toEqual(['priceCents:asc'])
  })

  it('omits sort key when sort is not provided', async () => {
    const { service, searchMock } = makeService()
    await service.search({})
    const [, opts] = searchMock.mock.calls[0]!
    expect(opts).not.toHaveProperty('sort')
  })

  it('returns hits, total, and facets from the index response', async () => {
    const { service, searchMock } = makeService()
    const mockHit = { id: 'abc' }
    searchMock.mockResolvedValueOnce({
      hits: [mockHit],
      estimatedTotalHits: 42,
      facetDistribution: { make: { Toyota: 5 } },
    })
    const result = await service.search({})
    expect(result.hits).toEqual([mockHit])
    expect(result.total).toBe(42)
    expect(result.facets).toEqual({ make: { Toyota: 5 } })
  })

  it('returns total 0 when estimatedTotalHits is undefined', async () => {
    const { service, searchMock } = makeService()
    searchMock.mockResolvedValueOnce({ hits: [], estimatedTotalHits: undefined, facetDistribution: {} })
    const result = await service.search({})
    expect(result.total).toBe(0)
  })

  it('returns empty facets object when facetDistribution is undefined', async () => {
    const { service, searchMock } = makeService()
    searchMock.mockResolvedValueOnce({ hits: [], estimatedTotalHits: 0, facetDistribution: undefined })
    const result = await service.search({})
    expect(result.facets).toEqual({})
  })

  it('passes the search query string through', async () => {
    const { service, searchMock } = makeService()
    await service.search({ q: 'wheelchair van' })
    const [query] = searchMock.mock.calls[0]!
    expect(query).toBe('wheelchair van')
  })

  it('passes empty string when q is not provided', async () => {
    const { service, searchMock } = makeService()
    await service.search({})
    const [query] = searchMock.mock.calls[0]!
    expect(query).toBe('')
  })

  it('combines multiple filters with AND', async () => {
    const params: SearchParams = { make: ['Toyota'], yearMin: 2020, hasLift: true }
    const { service, searchMock } = makeService()
    await service.search(params)
    const [, opts] = searchMock.mock.calls[0]!
    const parts = (opts.filter as string).split(' AND ')
    expect(parts.length).toBeGreaterThanOrEqual(3)
  })
})
