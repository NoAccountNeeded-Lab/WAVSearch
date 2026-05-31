'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { BarChart, Bar, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Slider } from '@/components/ui/slider'
import styles from './PriceHistogram.module.css'

// ── Types ──────────────────────────────────────────────────────────────────

interface RawBucket {
  bucket: string
  count: number
}

interface BucketDatum {
  bucket: string
  lo: number
  hi: number
  count: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

const BUCKET_SIZE_MILES = 10000
const DEFAULT_MAX = 200000

function parseBucket(raw: string): { lo: number; hi: number } {
  const parts = raw.split('-')
  const lo = parseInt(parts[0] ?? '0', 10)
  const hi = parts[1] !== undefined ? parseInt(parts[1], 10) : lo + BUCKET_SIZE_MILES
  return { lo, hi }
}

function fmtMiles(miles: number): string {
  if (miles === 0) return '0'
  return `${(miles / 1000).toFixed(0)}k`
}

// Omit mileageMax so histogram shows cross-filtered counts (all mileages visible)
const FORWARD_PARAMS = [
  'q', 'make', 'model', 'yearMin', 'yearMax', 'priceMin', 'priceMax',
  'condition', 'conversionType', 'rampType', 'hasLift', 'handControls', 'color', 'state',
]

// ── Custom tooltip ─────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: BucketDatum }>
}

function MileageTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipRange}>
        {fmtMiles(d.lo)}k–{fmtMiles(d.hi)}k mi
      </span>
      <span className={styles.tooltipCount}>{d.count} listing{d.count !== 1 ? 's' : ''}</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function MileageHistogram() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const urlMax = useMemo(() => {
    const v = searchParams.get('mileageMax')
    return v ? parseInt(v, 10) : 0
  }, [searchParams])

  const [data, setData] = useState<BucketDatum[]>([])
  const [rangeMax, setRangeMax] = useState(DEFAULT_MAX)
  const [localValue, setLocalValue] = useState<number | null>(null)
  const [facetsTotal, setFacetsTotal] = useState<number | null>(null)

  const committedMax = urlMax > 0 ? urlMax : rangeMax
  const displayMax = localValue ?? committedMax
  const hasFilter = urlMax > 0

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
      .then((r) => r.json() as Promise<{ data: { mileageDistribution: RawBucket[]; total: number } }>)
      .then(({ data: { mileageDistribution, total } }) => {
        if (cancelled || !mileageDistribution.length) return
        const parsed: BucketDatum[] = mileageDistribution.map(({ bucket, count }) => {
          const { lo, hi } = parseBucket(bucket)
          return { bucket, lo, hi, count }
        })
        setData(parsed)
        setFacetsTotal(total)
        setRangeMax(Math.max(...parsed.map((b) => b.hi)))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [fetchUrl])

  const push = useCallback(
    (max: number) => {
      const params = new URLSearchParams(searchParams.toString())
      if (max > 0 && max < rangeMax) {
        params.set('mileageMax', String(max))
      } else {
        params.delete('mileageMax')
      }
      params.delete('page')
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams, rangeMax],
  )

  const handleBarClick = useCallback(
    (d: BucketDatum) => {
      const alreadyActive = hasFilter && committedMax === d.hi
      if (alreadyActive) push(0)
      else push(d.hi)
    },
    [hasFilter, committedMax, push],
  )

  const handleSliderChange = useCallback((v: number[]) => {
    if (v.length >= 1) setLocalValue(v[0]!)
  }, [])

  const handleSliderCommit = useCallback(
    (v: number[]) => {
      setLocalValue(null)
      if (v.length >= 1) push(v[0]!)
    },
    [push],
  )

  const isBarActive = useCallback(
    (d: BucketDatum): boolean => {
      if (displayMax >= rangeMax) return true
      return d.hi <= displayMax
    },
    [displayMax, rangeMax],
  )

  const matchingCount = useMemo(() => {
    if (!data.length) return null
    return data
      .filter((d) => d.hi <= displayMax)
      .reduce((sum, d) => sum + d.count, 0)
  }, [data, displayMax])

  const withoutMileage = useMemo(() => {
    if (facetsTotal === null || !data.length) return null
    const withMileage = data.reduce((sum, d) => sum + d.count, 0)
    const n = facetsTotal - withMileage
    return n > 0 ? n : null
  }, [facetsTotal, data])

  const ariaLabel = useMemo(() => {
    const suffix = hasFilter ? `, filtered to ${fmtMiles(displayMax)}k miles or less` : ', no mileage filter active'
    return `Mileage distribution histogram showing listing counts per 10,000-mile bracket${suffix}`
  }, [hasFilter, displayMax])

  const highLabel = displayMax >= rangeMax ? `${fmtMiles(rangeMax)}k+ mi` : `${fmtMiles(displayMax)}k mi`

  if (!data.length) return null

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.label}>Mileage</span>
      </div>

      <div className={styles.chartWrapper} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={80}>
          <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap="10%">
            <Tooltip content={<MileageTooltip />} cursor={{ fill: 'var(--clr-border)', opacity: 0.5 }} />
            <Bar
              dataKey="count"
              radius={[2, 2, 0, 0]}
              onClick={(d) => handleBarClick(d as unknown as BucketDatum)}
              style={{ cursor: 'pointer' }}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.bucket}
                  fill={isBarActive(entry) ? 'var(--clr-primary)' : 'var(--clr-border-strong)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.sliderWrapper}>
        <Slider
          min={0}
          max={rangeMax}
          step={BUCKET_SIZE_MILES}
          value={[displayMax]}
          onValueChange={handleSliderChange}
          onValueCommit={handleSliderCommit}
          aria-label="Maximum mileage"
          className={styles.slider}
        />
      </div>

      <div className={styles.sliderLabels}>
        <span className={styles.sliderLow}>0 mi</span>
        {matchingCount !== null && (
          <span className={styles.sliderCount}>
            {matchingCount.toLocaleString()} listing{matchingCount !== 1 ? 's' : ''}
          </span>
        )}
        <span className={styles.sliderHigh}>{highLabel}</span>
      </div>
      {withoutMileage !== null && (
        <p className={styles.noDataNote}>
          + {withoutMileage.toLocaleString()} without mileage listed
        </p>
      )}
    </div>
  )
}
