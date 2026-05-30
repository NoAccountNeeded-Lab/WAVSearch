import { describe, it, expect, beforeEach } from 'vitest'
import { MockQueueFactory, MockQueueAdapter } from './factory.js'
import { QUEUES } from '../queues.js'

describe('MockQueueFactory', () => {
  let factory: MockQueueFactory

  beforeEach(() => {
    factory = new MockQueueFactory()
  })

  it('returns the same adapter instance for the same queue name', () => {
    const a = factory.createQueue(QUEUES.GEOCODE)
    const b = factory.createQueue(QUEUES.GEOCODE)
    expect(a).toBe(b)
  })

  it('returns different adapters for different queue names', () => {
    const a = factory.createQueue(QUEUES.GEOCODE)
    const b = factory.createQueue(QUEUES.DEDUPLICATE)
    expect(a).not.toBe(b)
  })

  it('getQueue returns the adapter after createQueue', () => {
    factory.createQueue(QUEUES.SOURCE_SCRAPE)
    expect(factory.getQueue(QUEUES.SOURCE_SCRAPE)).toBeInstanceOf(MockQueueAdapter)
  })

  it('getQueue returns undefined for an unknown queue', () => {
    expect(factory.getQueue('nonexistent')).toBeUndefined()
  })
})

describe('MockQueueAdapter', () => {
  let adapter: MockQueueAdapter

  beforeEach(() => {
    adapter = new MockQueueAdapter(QUEUES.GEOCODE)
  })

  it('add returns a string job id', async () => {
    const id = await adapter.add({ foo: 'bar' })
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('add stores job data and status as waiting', async () => {
    await adapter.add({ city: 'Portland' })
    const jobs = adapter.getEnqueued()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.data).toEqual({ city: 'Portland' })
    expect(jobs[0]!.status).toBe('waiting')
  })

  it('getStats returns waiting count matching enqueued jobs', async () => {
    await adapter.add({})
    await adapter.add({})
    const stats = await adapter.getStats()
    expect(stats.waiting).toBe(2)
    expect(stats.active).toBe(0)
    expect(stats.completed).toBe(0)
    expect(stats.failed).toBe(0)
  })

  it('getJobs filters by status', async () => {
    await adapter.add({ a: 1 })
    await adapter.add({ b: 2 })
    const waiting = await adapter.getJobs(['waiting'])
    expect(waiting).toHaveLength(2)
    const failed = await adapter.getJobs(['failed'])
    expect(failed).toHaveLength(0)
  })

  it('getJobs returns matching JobRecord shape', async () => {
    await adapter.add({ x: 42 })
    const [record] = await adapter.getJobs(['waiting'])
    expect(record).toMatchObject({
      name: QUEUES.GEOCODE,
      data: { x: 42 },
      status: 'waiting',
      attemptsMade: 0,
    })
    expect(record!.createdAt).toBeInstanceOf(Date)
  })

  it('pause and resume toggle isPaused', async () => {
    expect(await adapter.isPaused()).toBe(false)
    await adapter.pause()
    expect(await adapter.isPaused()).toBe(true)
    await adapter.resume()
    expect(await adapter.isPaused()).toBe(false)
  })

  it('clear resets all stored jobs', async () => {
    await adapter.add({})
    await adapter.add({})
    adapter.clear()
    expect(adapter.getEnqueued()).toHaveLength(0)
    const stats = await adapter.getStats()
    expect(stats.waiting).toBe(0)
  })

  it('increments job ids monotonically', async () => {
    const id1 = await adapter.add({})
    const id2 = await adapter.add({})
    expect(Number(id2)).toBeGreaterThan(Number(id1))
  })
})

describe('parseRedisUrl', async () => {
  const { parseRedisUrl } = await import('../bullmq/connection.js')

  it('parses host and port', () => {
    const { host, port } = parseRedisUrl('redis://localhost:6379')
    expect(host).toBe('localhost')
    expect(port).toBe(6379)
  })

  it('parses password', () => {
    const { password, host, port } = parseRedisUrl('redis://:secret@myhost:6380')
    expect(password).toBe('secret')
    expect(host).toBe('myhost')
    expect(port).toBe(6380)
  })

  it('defaults port to 6379 when not specified', () => {
    const { port } = parseRedisUrl('redis://localhost')
    expect(port).toBe(6379)
  })

  it('sets maxRetriesPerRequest to null for BullMQ worker compatibility', () => {
    const { maxRetriesPerRequest } = parseRedisUrl('redis://localhost:6379')
    expect(maxRetriesPerRequest).toBeNull()
  })
})
