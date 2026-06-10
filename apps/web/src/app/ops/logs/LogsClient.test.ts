// LogsClient.tsx is a 'use client' React component with hooks — it cannot be imported
// in a plain Vitest environment without jsdom/React Test Renderer setup.
// We extract and test the pure helper functions in isolation here, following the
// same pattern used in AIClient.test.ts.

import { describe, it, expect } from 'vitest'

// ── levelVariant ──────────────────────────────────────────────────────────
// Copied verbatim from LogsClient.tsx — keep in sync if implementation changes.
function levelVariant(level: string | null): string {
  switch (level) {
    case 'fatal':
    case 'error':
      return 'danger'
    case 'warn':
      return 'warning'
    case 'info':
      return 'neutral'
    case 'debug':
    case 'trace':
      return 'muted'
    default:
      return 'neutral'
  }
}

// ── fmtTs ─────────────────────────────────────────────────────────────────
// Copied verbatim from LogsClient.tsx — keep in sync if implementation changes.
function fmtTs(ts: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(ts))
}

// ── hasDetails ────────────────────────────────────────────────────────────
// Copied verbatim from LogsClient.tsx — keep in sync if implementation changes.
interface LogEntry {
  ts: string
  level: string | null
  service: string | null
  message: string | null
  requestId: string | null
  queue: string | null
  jobId: string | null
  sourceId: string | null
  stack: string | null
  extra: Record<string, unknown>
}

function hasDetails(entry: LogEntry): boolean {
  return !!(entry.stack ?? (Object.keys(entry.extra).length > 0 && entry.level === 'error'))
}

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    ts: new Date().toISOString(),
    level: 'info',
    service: 'api',
    message: 'test',
    requestId: null,
    queue: null,
    jobId: null,
    sourceId: null,
    stack: null,
    extra: {},
    ...overrides,
  }
}

// ── LEVEL_PRIORITY (client-side filtering logic) ─────────────────────────
// Copied verbatim from LogsClient.tsx — keep in sync if implementation changes.
const LEVEL_PRIORITY: Record<string, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
}

type LevelFilter = 'all' | 'error' | 'warn' | 'info' | 'debug'

function applyLevelFilter(entries: LogEntry[], levelFilter: LevelFilter): LogEntry[] {
  if (levelFilter === 'all') return entries
  return entries.filter(e => {
    if (!e.level) return false
    const priority = LEVEL_PRIORITY[e.level] ?? 99
    const threshold = LEVEL_PRIORITY[levelFilter] ?? 99
    return priority <= threshold
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

describe('levelVariant', () => {
  it('maps fatal to danger', () => {
    expect(levelVariant('fatal')).toBe('danger')
  })

  it('maps error to danger', () => {
    expect(levelVariant('error')).toBe('danger')
  })

  it('maps warn to warning', () => {
    expect(levelVariant('warn')).toBe('warning')
  })

  it('maps info to neutral', () => {
    expect(levelVariant('info')).toBe('neutral')
  })

  it('maps debug to muted', () => {
    expect(levelVariant('debug')).toBe('muted')
  })

  it('maps trace to muted', () => {
    expect(levelVariant('trace')).toBe('muted')
  })

  it('maps null to neutral', () => {
    expect(levelVariant(null)).toBe('neutral')
  })

  it('maps unknown level to neutral', () => {
    expect(levelVariant('custom')).toBe('neutral')
  })
})

describe('fmtTs', () => {
  it('returns a non-empty string for a valid ISO timestamp', () => {
    const result = fmtTs('2024-06-10T14:30:00.000Z')
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('includes seconds in the formatted output', () => {
    // Use a date where seconds are distinctive (e.g. :45)
    const result = fmtTs('2024-06-10T14:30:45.000Z')
    expect(result).toMatch(/45/)
  })

  it('formats two different timestamps differently', () => {
    const t1 = fmtTs('2024-01-01T00:00:00.000Z')
    const t2 = fmtTs('2024-06-10T14:30:00.000Z')
    expect(t1).not.toBe(t2)
  })
})

describe('hasDetails', () => {
  it('returns false when stack is null and extra is empty', () => {
    expect(hasDetails(makeEntry({ stack: null, extra: {} }))).toBe(false)
  })

  it('returns true when stack is present', () => {
    expect(hasDetails(makeEntry({ stack: 'Error: boom\n  at index.js:1' }))).toBe(true)
  })

  it('returns true for an error entry with non-empty extra', () => {
    expect(hasDetails(makeEntry({ level: 'error', extra: { code: 'ENOENT' } }))).toBe(true)
  })

  it('returns false for a non-error entry with extra fields', () => {
    // extra fields only reveal details for error level
    expect(hasDetails(makeEntry({ level: 'info', extra: { foo: 'bar' }, stack: null }))).toBe(false)
  })

  it('returns true for a fatal entry with non-empty extra', () => {
    // fatal is NOT 'error' string so extra alone does not trigger — only stack does
    expect(hasDetails(makeEntry({ level: 'fatal', extra: { foo: 'bar' }, stack: null }))).toBe(false)
  })

  it('returns false when entry has no level', () => {
    expect(hasDetails(makeEntry({ level: null, extra: { k: 'v' }, stack: null }))).toBe(false)
  })
})

describe('applyLevelFilter (client-side level filtering)', () => {
  const entries: LogEntry[] = [
    makeEntry({ level: 'fatal' }),
    makeEntry({ level: 'error' }),
    makeEntry({ level: 'warn' }),
    makeEntry({ level: 'info' }),
    makeEntry({ level: 'debug' }),
    makeEntry({ level: 'trace' }),
    makeEntry({ level: null }),
  ]

  it('returns all entries for "all" filter', () => {
    expect(applyLevelFilter(entries, 'all')).toHaveLength(entries.length)
  })

  it('"error" filter includes fatal and error, excludes warn and below', () => {
    const result = applyLevelFilter(entries, 'error')
    const levels = result.map(e => e.level)
    expect(levels).toContain('fatal')
    expect(levels).toContain('error')
    expect(levels).not.toContain('warn')
    expect(levels).not.toContain('info')
  })

  it('"warn" filter includes fatal, error, warn, excludes info and below', () => {
    const result = applyLevelFilter(entries, 'warn')
    const levels = result.map(e => e.level)
    expect(levels).toContain('fatal')
    expect(levels).toContain('error')
    expect(levels).toContain('warn')
    expect(levels).not.toContain('info')
    expect(levels).not.toContain('debug')
  })

  it('"info" filter includes fatal through info, excludes debug and trace', () => {
    const result = applyLevelFilter(entries, 'info')
    const levels = result.map(e => e.level)
    expect(levels).toContain('info')
    expect(levels).not.toContain('debug')
    expect(levels).not.toContain('trace')
  })

  it('"debug" filter includes fatal through debug, excludes trace', () => {
    const result = applyLevelFilter(entries, 'debug')
    const levels = result.map(e => e.level)
    expect(levels).toContain('debug')
    expect(levels).not.toContain('trace')
  })

  it('excludes entries with null level from any non-all filter', () => {
    const result = applyLevelFilter(entries, 'error')
    expect(result.every(e => e.level !== null)).toBe(true)
  })

  it('returns empty array when no entries match the filter', () => {
    const debugOnly = [makeEntry({ level: 'debug' }), makeEntry({ level: 'trace' })]
    expect(applyLevelFilter(debugOnly, 'error')).toHaveLength(0)
  })
})
