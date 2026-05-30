'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { PriceHistogram } from './PriceHistogram'
import { YearHistogram } from './YearHistogram'
import { MileageHistogram } from './MileageHistogram'
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

// ── Disjunctive faceting config ────────────────────────────────────────────
//
// Array-type params that support multi-select. For each group that has active
// selections, we fire a parallel facets call *omitting that group's filter* so
// the bars show counts as if that filter is not applied (while other filters
// still narrow the results). Boolean params (hasLift, handControls) are
// single-value toggles and don't need this treatment.

const DISJUNCTIVE_PARAMS = ['make', 'model', 'condition', 'conversionType', 'color', 'rampType'] as const
type DisjunctiveParam = typeof DISJUNCTIVE_PARAMS[number]

// All params forwarded to the facets API
const ALL_FILTER_PARAMS = [
  'q', 'make', 'model', 'yearMin', 'yearMax', 'priceMin', 'priceMax',
  'mileageMax', 'condition', 'conversionType', 'rampType', 'hasLift',
  'handControls', 'color', 'state',
]

const MAX_BARS = 8

// ── Helpers ────────────────────────────────────────────────────────────────

function buildFacetsUrl(
  searchParams: { get: (key: string) => string | null },
  omitParam: string | null,
): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
  const url = new URL(`${base}/v1/listings/facets`)
  for (const key of ALL_FILTER_PARAMS) {
    if (key === omitParam) continue
    const val = searchParams.get(key)
    if (val) url.searchParams.set(key, val)
  }
  return url.toString()
}

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

async function fetchFacets(url: string): Promise<FacetsData> {
  const res = await fetch(url)
  const json = (await res.json()) as { data: FacetsData }
  return json.data
}

// ── Stability helper ───────────────────────────────────────────────────────
//
// When a filter change causes bars to disappear from the API response, we keep
// the previous bars visible at count=0 (disabled style) so layout height is
// preserved and the user isn't disoriented by collapsing sections.

function stabilizeBars(current: BarDatum[], previous: BarDatum[]): BarDatum[] {
  const currentSet = new Set(current.map((b) => b.value))
  const ghost = previous
    .filter((b) => !currentSet.has(b.value))
    .map((b) => ({ value: b.value, count: 0 }))
    .slice(0, MAX_BARS)
  return [...current, ...ghost]
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

  // Enabled bars (count > 0) first by count desc; disabled (count = 0) last
  const sorted = [...bars].sort((a, b) => {
    const aOff = a.count === 0
    const bOff = b.count === 0
    if (aOff !== bOff) return aOff ? 1 : -1
    return b.count - a.count
  })

  const visible = showAll ? sorted : sorted.slice(0, MAX_BARS)
  const maxCount = sorted.find((b) => b.count > 0)?.count ?? 1

  return (
    <div className={styles.group}>
      <span id={labelId} className={styles.groupTitle}>{title}</span>
      <ul className={styles.barList} role="group" aria-labelledby={labelId}>
        {visible.map((bar) => {
          const isActive = activeValues.includes(bar.value)
          const isDisabled = bar.count === 0 && !isActive
          const pct = bar.count > 0 ? Math.max(4, Math.round((bar.count / maxCount) * 100)) : 4
          return (
            <li key={bar.value}>
              <button
                type="button"
                className={styles.barBtn}
                aria-pressed={isActive}
                disabled={isDisabled}
                onClick={() => onToggle(bar.value)}
              >
                <span
                  className={styles.barFill}
                  style={{ width: `${pct}%` }}
                  data-active={isActive}
                  aria-hidden="true"
                />
                <span className={styles.barLabel}>{formatLabel(bar.value)}</span>
                <span className={styles.barCount}>
                  {bar.count > 0 ? bar.count.toLocaleString() : '—'}
                </span>
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

// ── Main component ─────────────────────────────────────────────────────────

export function CategoryBarChart() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [data, setData] = useState<FacetsData | null>(null)
  const prevFacetsRef = useRef<FacetsData | null>(null)

  useEffect(() => {
    let cancelled = false

    // Which array-type groups have active selections → need their own call
    const activeDisjunctive = DISJUNCTIVE_PARAMS.filter(
      (p) => parseCommaSep(searchParams.get(p)).length > 0,
    )

    const baseUrl = buildFacetsUrl(searchParams, null)
    const disjunctiveCalls = activeDisjunctive.map((param) => ({
      param,
      url: buildFacetsUrl(searchParams, param),
    }))

    const doFetch = async () => {
      try {
        const [base, ...disjResults] = await Promise.all([
          fetchFacets(baseUrl),
          ...disjunctiveCalls.map(({ url }) => fetchFacets(url)),
        ])

        if (cancelled || !base) return

        // Start from base (reflects all active filters for every group)
        const merged: FacetsData = { ...base, wavFeatures: { ...base.wavFeatures } }

        // For each active group, override with its own call's counts so the
        // group shows all options (not just those matching its own filter)
        disjResults.forEach((d, i) => {
          const param = disjunctiveCalls[i]!.param as DisjunctiveParam
          switch (param) {
            case 'make':           merged.makeBreakdown = d.makeBreakdown; break
            case 'model':          merged.modelBreakdown = d.modelBreakdown; break
            case 'condition':      merged.conditionBreakdown = d.conditionBreakdown; break
            case 'conversionType': merged.conversionBreakdown = d.conversionBreakdown; break
            case 'color':          merged.colorBreakdown = d.colorBreakdown; break
            case 'rampType':       merged.wavFeatures.rampTypes = d.wavFeatures.rampTypes; break
          }
        })

        const prev = prevFacetsRef.current
        const stabilized: FacetsData = prev
          ? {
              ...merged,
              makeBreakdown:       stabilizeBars(merged.makeBreakdown,       prev.makeBreakdown),
              modelBreakdown:      stabilizeBars(merged.modelBreakdown,      prev.modelBreakdown),
              conditionBreakdown:  stabilizeBars(merged.conditionBreakdown,  prev.conditionBreakdown),
              conversionBreakdown: stabilizeBars(merged.conversionBreakdown, prev.conversionBreakdown),
              colorBreakdown:      stabilizeBars(merged.colorBreakdown,      prev.colorBreakdown),
              wavFeatures: {
                ...merged.wavFeatures,
                rampTypes: stabilizeBars(merged.wavFeatures.rampTypes, prev.wavFeatures.rampTypes),
              },
            }
          : merged

        prevFacetsRef.current = merged
        setData(stabilized)
      } catch {
        // silent — chart just stays at last known state
      }
    }

    void doFetch()
    return () => { cancelled = true }
  }, [searchParams])

  // ── URL mutation helpers ─────────────────────────────────────────────────

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

  // ── Render ───────────────────────────────────────────────────────────────

  const featureBars: BarDatum[] = data ? [
    { value: 'has_lift', count: data.wavFeatures.hasLift },
    { value: 'hand_controls', count: data.wavFeatures.handControls },
    ...data.wavFeatures.rampTypes.filter((r) => r.value !== 'unknown' && r.value !== 'none'),
  ] : []

  const featureActiveValues: string[] = [
    ...(searchParams.get('hasLift') === 'true' ? ['has_lift'] : []),
    ...(searchParams.get('handControls') === 'true' ? ['hand_controls'] : []),
    ...parseCommaSep(searchParams.get('rampType')),
  ]

  const handleFeatureToggle = (value: string) => {
    if (value === 'has_lift') { toggleBool('hasLift'); return }
    if (value === 'hand_controls') { toggleBool('handControls'); return }
    toggleArray('rampType', value)
  }

  const groups: Array<{
    id: string
    title: string
    bars: BarDatum[]
    param: string
    active: string[]
  }> = data ? [
    { id: 'make',      title: 'Make',       bars: data.makeBreakdown,                                               param: 'make',           active: parseCommaSep(searchParams.get('make'))           },
    { id: 'model',     title: 'Model',      bars: data.modelBreakdown,                                              param: 'model',          active: parseCommaSep(searchParams.get('model'))          },
    { id: 'condition', title: 'Condition',  bars: data.conditionBreakdown,                                          param: 'condition',      active: parseCommaSep(searchParams.get('condition'))      },
    { id: 'entry',     title: 'Entry type', bars: data.conversionBreakdown.filter((b) => b.value !== 'unknown'),    param: 'conversionType', active: parseCommaSep(searchParams.get('conversionType')) },
    { id: 'color',     title: 'Color',      bars: data.colorBreakdown,                                              param: 'color',          active: parseCommaSep(searchParams.get('color'))          },
  ].filter((g) => g.bars.length > 0) : []

  return (
    <div className={styles.root}>
      <PriceHistogram />
      <YearHistogram />
      <MileageHistogram />
      {groups.map((g) => (
        <BarGroup
          key={g.id}
          title={g.title}
          bars={g.bars}
          activeValues={g.active}
          onToggle={(v) => toggleArray(g.param, v)}
          labelId={`cat-bar-${g.id}`}
        />
      ))}

      {(featureBars.some((b) => b.count > 0) || featureActiveValues.length > 0) && (
        <BarGroup
          title="Features"
          bars={featureBars}
          activeValues={featureActiveValues}
          onToggle={handleFeatureToggle}
          labelId="cat-bar-features"
        />
      )}
    </div>
  )
}
