'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import styles from './CategoryBarChart.module.css'

// ── Types ──────────────────────────────────────────────────────────────────

interface BarDatum {
  value: string
  count: number
}

interface FacetsData {
  makeBreakdown: BarDatum[]
  modelBreakdown: BarDatum[]
  conditionBreakdown: BarDatum[]
  conversionBreakdown: BarDatum[]
  colorBreakdown: BarDatum[]
  wavFeatures: {
    hasLift: number
    handControls: number
    rampTypes: BarDatum[]
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

const MAX_BARS = 8

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function parseCommaSep(v: string | null): string[] {
  if (!v) return []
  return v.split(',').map((s) => s.trim()).filter(Boolean)
}

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

// ── Bar Group ──────────────────────────────────────────────────────────────

interface BarGroupProps {
  title: string
  bars: BarDatum[]
  activeValues: string[]
  onToggle: (value: string) => void
  labelId: string
}

function BarGroup({ title, bars, activeValues, onToggle, labelId }: BarGroupProps) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? bars : bars.slice(0, MAX_BARS)
  const maxCount = bars[0]?.count ?? 1

  return (
    <div className={styles.group}>
      <span id={labelId} className={styles.groupTitle}>{title}</span>
      <ul
        className={styles.barList}
        role="group"
        aria-labelledby={labelId}
      >
        {visible.map((bar) => {
          const isActive = activeValues.includes(bar.value)
          const pct = Math.max(4, Math.round((bar.count / maxCount) * 100))
          return (
            <li key={bar.value} className={styles.barItem}>
              <button
                type="button"
                className={styles.barBtn}
                aria-pressed={isActive}
                onClick={() => onToggle(bar.value)}
              >
                <span className={styles.barLabel}>{formatLabel(bar.value)}</span>
                <span className={styles.barTrack} aria-hidden="true">
                  <span
                    className={styles.barFill}
                    style={{ width: `${pct}%` }}
                    data-active={isActive}
                  />
                </span>
                <span className={styles.barCount}>{bar.count.toLocaleString()}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {bars.length > MAX_BARS && (
        <button
          type="button"
          className={styles.showMoreBtn}
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
        >
          {showAll ? 'Show fewer' : `Show ${bars.length - MAX_BARS} more`}
        </button>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

const FORWARD_PARAMS = [
  'q', 'make', 'model', 'yearMin', 'yearMax', 'priceMin', 'priceMax',
  'mileageMax', 'condition', 'conversionType', 'rampType', 'hasLift',
  'handControls', 'color', 'state',
]

export function CategoryBarChart() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [data, setData] = useState<FacetsData | null>(null)

  const fetchUrl = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
    const url = new URL(`${base}/v1/listings/facets`)
    for (const key of FORWARD_PARAMS) {
      const val = searchParams.get(key)
      if (val) url.searchParams.set(key, val)
    }
    return url.toString()
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    fetch(fetchUrl)
      .then((r) => r.json() as Promise<{ data: FacetsData }>)
      .then(({ data: d }) => { if (!cancelled) setData(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [fetchUrl])

  const push = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }
      params.delete('page')
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false })
      })
    },
    [router, pathname, searchParams],
  )

  const toggleArray = useCallback(
    (param: string, value: string) => {
      const current = parseCommaSep(searchParams.get(param))
      const next = toggleInList(current, value)
      push({ [param]: next.length ? next.join(',') : null })
    },
    [push, searchParams],
  )

  const toggleBool = useCallback(
    (param: string) => {
      const current = searchParams.get(param) === 'true'
      push({ [param]: current ? null : 'true' })
    },
    [push, searchParams],
  )

  if (!data) return null

  const activeMakes = parseCommaSep(searchParams.get('make'))
  const activeModels = parseCommaSep(searchParams.get('model'))
  const activeConditions = parseCommaSep(searchParams.get('condition'))
  const activeConversions = parseCommaSep(searchParams.get('conversionType'))
  const activeColors = parseCommaSep(searchParams.get('color'))
  const hasLiftActive = searchParams.get('hasLift') === 'true'
  const handControlsActive = searchParams.get('handControls') === 'true'

  const featureBars: BarDatum[] = [
    { value: 'has_lift', count: data.wavFeatures.hasLift },
    { value: 'hand_controls', count: data.wavFeatures.handControls },
    ...data.wavFeatures.rampTypes.filter((r) => r.value !== 'unknown' && r.value !== 'none'),
  ].filter((b) => b.count > 0)

  const featureActive = (value: string): boolean => {
    if (value === 'has_lift') return hasLiftActive
    if (value === 'hand_controls') return handControlsActive
    return parseCommaSep(searchParams.get('rampType')).includes(value)
  }

  const toggleFeature = (value: string) => {
    if (value === 'has_lift') { toggleBool('hasLift'); return }
    if (value === 'hand_controls') { toggleBool('handControls'); return }
    toggleArray('rampType', value)
  }

  const featureMaxCount = featureBars[0]?.count ?? 1

  const groups: Array<{
    id: string
    title: string
    bars: BarDatum[]
    param?: string
    active?: string[]
  }> = [
    { id: 'make', title: 'Make', bars: data.makeBreakdown, param: 'make', active: activeMakes },
    { id: 'model', title: 'Model', bars: data.modelBreakdown, param: 'model', active: activeModels },
    { id: 'condition', title: 'Condition', bars: data.conditionBreakdown, param: 'condition', active: activeConditions },
    { id: 'entry', title: 'Entry type', bars: data.conversionBreakdown.filter((b) => b.value !== 'unknown'), param: 'conversionType', active: activeConversions },
    { id: 'color', title: 'Color', bars: data.colorBreakdown, param: 'color', active: activeColors },
  ].filter((g) => g.bars.length > 0)

  return (
    <div className={styles.root}>
      {groups.map((g) => (
        <BarGroup
          key={g.id}
          title={g.title}
          bars={g.bars}
          activeValues={g.active ?? []}
          onToggle={(v) => toggleArray(g.param!, v)}
          labelId={`cat-bar-${g.id}`}
        />
      ))}

      {featureBars.length > 0 && (
        <div className={styles.group}>
          <span id="cat-bar-features" className={styles.groupTitle}>Features</span>
          <ul className={styles.barList} role="group" aria-labelledby="cat-bar-features">
            {featureBars.map((bar) => {
              const isActive = featureActive(bar.value)
              const pct = Math.max(4, Math.round((bar.count / featureMaxCount) * 100))
              return (
                <li key={bar.value} className={styles.barItem}>
                  <button
                    type="button"
                    className={styles.barBtn}
                    aria-pressed={isActive}
                    onClick={() => toggleFeature(bar.value)}
                  >
                    <span className={styles.barLabel}>{formatLabel(bar.value)}</span>
                    <span className={styles.barTrack} aria-hidden="true">
                      <span
                        className={styles.barFill}
                        style={{ width: `${pct}%` }}
                        data-active={isActive}
                      />
                    </span>
                    <span className={styles.barCount}>{bar.count.toLocaleString()}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
