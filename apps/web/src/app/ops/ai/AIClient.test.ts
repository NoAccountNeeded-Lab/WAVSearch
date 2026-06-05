// AIClient.tsx is a 'use client' React component with hooks — it cannot be imported
// in a plain Vitest environment without jsdom/React Test Renderer setup.
// We extract and test the pure helper functions in isolation here, following the
// same pattern used in IntakeForm.test.ts.

import { describe, it, expect } from 'vitest'

// ── fmtBytes ──────────────────────────────────────────────────────────────
// Copied verbatim from AIClient.tsx — keep in sync if implementation changes.
function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`
}

// ── fmtUntil ──────────────────────────────────────────────────────────────
// Copied verbatim from AIClient.tsx — keep in sync if implementation changes.
function fmtUntil(val: string | null): string {
  if (!val) return '—'
  const date = new Date(val)
  if (Number.isNaN(date.getTime())) return '—'
  const diffMs = date.getTime() - Date.now()
  if (diffMs <= 0) return 'unloading'
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'under 1 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  return `${hours} hr`
}

// ── getConfigValue (pure logic) ───────────────────────────────────────────
// Extracted from the closure inside AIClient to allow isolated testing.
interface ConfigEntry {
  key: string
  value: string | number | boolean | Record<string, unknown> | null
  type: string
}

function getConfigValue(entries: ConfigEntry[], key: string): string {
  const entry = entries.find(e => e.key === key)
  if (!entry || entry.value === null) return ''
  return String(entry.value)
}

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

describe('fmtBytes', () => {
  it('returns — for null', () => {
    expect(fmtBytes(null)).toBe('—')
  })

  it('returns — for undefined', () => {
    expect(fmtBytes(undefined)).toBe('—')
  })

  it('returns 0 B for zero', () => {
    expect(fmtBytes(0)).toBe('0 B')
  })

  it('formats bytes without a decimal', () => {
    expect(fmtBytes(512)).toBe('512 B')
  })

  it('formats kilobytes (< 10 KB shows one decimal)', () => {
    expect(fmtBytes(1024)).toBe('1.0 KB')
  })

  it('formats kilobytes (>= 10 KB no decimal)', () => {
    expect(fmtBytes(10 * 1024)).toBe('10 KB')
  })

  it('formats megabytes', () => {
    expect(fmtBytes(1024 * 1024)).toBe('1.0 MB')
  })

  it('formats gigabytes (< 10 GB shows one decimal)', () => {
    expect(fmtBytes(4 * 1024 ** 3)).toBe('4.0 GB')
  })

  it('formats gigabytes (>= 10 GB no decimal)', () => {
    expect(fmtBytes(10 * 1024 ** 3)).toBe('10 GB')
  })

  it('caps at TB (< 10 TB shows one decimal)', () => {
    // 2 TB
    expect(fmtBytes(2 * 1024 ** 4)).toBe('2.0 TB')
  })
})

describe('fmtUntil', () => {
  it('returns — for null', () => {
    expect(fmtUntil(null)).toBe('—')
  })

  it('returns — for an empty string', () => {
    expect(fmtUntil('')).toBe('—')
  })

  it('returns — for an invalid date string', () => {
    expect(fmtUntil('not-a-date')).toBe('—')
  })

  it('returns "unloading" when the expiry is in the past', () => {
    expect(fmtUntil(new Date(Date.now() - 5000).toISOString())).toBe('unloading')
  })

  it('returns "under 1 min" when less than 30 seconds remain', () => {
    // Math.round(29_000 / 60_000) === 0, so < 1 branch fires
    expect(fmtUntil(new Date(Date.now() + 29_000).toISOString())).toBe('under 1 min')
  })

  it('returns minutes when less than an hour remains', () => {
    expect(fmtUntil(new Date(Date.now() + 5 * 60_000).toISOString())).toBe('5 min')
  })

  it('returns hours when an hour or more remains', () => {
    expect(fmtUntil(new Date(Date.now() + 2 * 60 * 60_000).toISOString())).toBe('2 hr')
  })
})

describe('getConfigValue (extracted from AIClient)', () => {
  const entries: ConfigEntry[] = [
    { key: 'ai.intake.provider', value: 'anthropic', type: 'string' },
    { key: 'ai.intake.model', value: 'claude-haiku-4-5-20251001', type: 'string' },
    { key: 'ai.agents.provider', value: null, type: 'string' },
  ]

  it('returns the string value for a known key', () => {
    expect(getConfigValue(entries, 'ai.intake.provider')).toBe('anthropic')
  })

  it('returns empty string for a missing key', () => {
    expect(getConfigValue(entries, 'no.such.key')).toBe('')
  })

  it('returns empty string when value is null (tombstone)', () => {
    expect(getConfigValue(entries, 'ai.agents.provider')).toBe('')
  })

  it('coerces numeric values to string', () => {
    const numEntries: ConfigEntry[] = [{ key: 'some.count', value: 42, type: 'number' }]
    expect(getConfigValue(numEntries, 'some.count')).toBe('42')
  })

  it('coerces boolean values to string', () => {
    const boolEntries: ConfigEntry[] = [{ key: 'feature.flag', value: true, type: 'boolean' }]
    expect(getConfigValue(boolEntries, 'feature.flag')).toBe('true')
  })
})
