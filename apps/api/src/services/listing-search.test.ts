import { describe, it, expect, vi } from 'vitest'
import { configureListingsIndex, q } from './listing-search.js'

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
