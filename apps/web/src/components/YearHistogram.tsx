'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { BarChart, Bar, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Slider } from '@/components/ui/slider'
import styles from './PriceHistogram.module.css'

// ── Types ──────────────────────────────────────────────────────────────────

interface YearDatum {
  year: number
  count: number
}

// Omit year params so this histogram shows cross-filtered data (all years visible)
const FORWARD_PARAMS = [
  'q', 'make', 'model', 'priceMin', 'priceMax', 'mileageMax',
  'condition', 'conversionType', 'rampType', 'hasLift', 'handControls', 'color', 'state',
]

// ── Custom tooltip ─────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: YearDatum }>
}

function YearTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipRange}>{d.year}</span>
      <span className={styles.tooltipCount}>{d.count} listing{d.count !== 1 ? 's' : ''}</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function YearHistogram() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const urlMin = useMemo(() => {
    const v = searchParams.get('yearMin')
    return v ? parseInt(v, 10) : 0
  }, [searchParams])

  const urlMax = useMemo(() => {
    const v = searchParams.get('yearMax')
    return v ? parseInt(v, 10) : 0
  }, [searchParams])

  const [data, setData] = useState<YearDatum[]>([])
  const [rangeMin, setRangeMin] = useState(2000)
  const [rangeMax, setRangeMax] = useState(new Date().getFullYear())
  const [localValue, setLocalValue] = useState<[number, number] | null>(null)

  const committedMin = urlMin > 0 ? urlMin : rangeMin
  const committedMax = urlMax > 0 ? urlMax : rangeMax
  const sliderDisplay = localValue ?? [committedMin, committedMax]
  const hasFilter = urlMin > 0 || urlMax > 0

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
      .then((r) => r.json() as Promise<{ data: { yearDistribution: YearDatum[] } }>)
      .then(({ data: { yearDistribution } }) => {
        if (cancelled || !yearDistribution.length) return
        setData(yearDistribution)
        const years = yearDistribution.map((d) => d.year)
        setRangeMin(Math.min(...years))
        setRangeMax(Math.max(...years))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [fetchUrl])

  const push = useCallback(
    (min: number, max: number) => {
      const params = new URLSearchParams(searchParams.toString())
      if (min > 0 && min > rangeMin) {
        params.set('yearMin', String(min))
      } else {
        params.delete('yearMin')
      }
      if (max > 0 && max < rangeMax) {
        params.set('yearMax', String(max))
      } else {
        params.delete('yearMax')
      }
      params.delete('page')
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams, rangeMin, rangeMax],
  )

  const handleBarClick = useCallback(
    (d: YearDatum) => {
      const alreadyActive = hasFilter && committedMin === d.year && committedMax === d.year
      if (alreadyActive) push(0, 0)
      else push(d.year, d.year)
    },
    [hasFilter, committedMin, committedMax, push],
  )

  const handleSliderChange = useCallback((v: number[]) => {
    if (v.length >= 2) setLocalValue([v[0]!, v[1]!])
  }, [])

  const handleSliderCommit = useCallback(
    (v: number[]) => {
      setLocalValue(null)
      if (v.length >= 2) push(v[0]!, v[1]!)
    },
    [push],
  )

  const [displayMin, displayMax] = sliderDisplay

  const isBarActive = useCallback(
    (d: YearDatum): boolean => {
      if (displayMin <= rangeMin && displayMax >= rangeMax) return true
      return d.year >= displayMin && d.year <= displayMax
    },
    [displayMin, displayMax, rangeMin, rangeMax],
  )

  const matchingCount = useMemo(() => {
    if (!data.length) return null
    return data
      .filter((d) => d.year >= displayMin && d.year <= displayMax)
      .reduce((sum, d) => sum + d.count, 0)
  }, [data, displayMin, displayMax])

  const ariaLabel = useMemo(() => {
    const suffix = hasFilter
      ? `, filtered from ${displayMin} to ${displayMax}`
      : ', no year filter active'
    return `Year distribution histogram showing listing counts per model year${suffix}`
  }, [hasFilter, displayMin, displayMax])

  if (!data.length) return null

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.label}>Year</span>
      </div>

      <div className={styles.chartWrapper} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={80}>
          <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap="10%">
            <Tooltip content={<YearTooltip />} cursor={{ fill: 'var(--clr-border)', opacity: 0.5 }} />
            <Bar
              dataKey="count"
              radius={[2, 2, 0, 0]}
              onClick={(d) => handleBarClick(d as unknown as YearDatum)}
              style={{ cursor: 'pointer' }}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.year}
                  fill={isBarActive(entry) ? 'var(--clr-primary)' : 'var(--clr-border-strong)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.sliderWrapper}>
        <Slider
          min={rangeMin}
          max={rangeMax}
          step={1}
          value={[displayMin, displayMax]}
          onValueChange={handleSliderChange}
          onValueCommit={handleSliderCommit}
          aria-label="Year range"
          className={styles.slider}
        />
      </div>

      <div className={styles.sliderLabels}>
        <span className={styles.sliderLow}>{displayMin}</span>
        {matchingCount !== null && (
          <span className={styles.sliderCount}>
            {matchingCount.toLocaleString()} listing{matchingCount !== 1 ? 's' : ''}
          </span>
        )}
        <span className={styles.sliderHigh}>{displayMax}</span>
      </div>
    </div>
  )
}
