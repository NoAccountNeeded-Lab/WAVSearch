'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  BarChart,
  Bar,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Slider } from '@/components/ui/slider'
import styles from './PriceHistogram.module.css'

// ── Types ──────────────────────────────────────────────────────────────────

interface RawBucket {
  bucket: string
  count: number
}

interface BucketDatum {
  bucket: string
  lo: number  // dollars
  hi: number  // dollars
  count: number
  label: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

const BUCKET_SIZE_DOLLARS = 5000

function parseBucket(raw: string): { lo: number; hi: number } {
  const parts = raw.split('-')
  const lo = parseInt(parts[0] ?? '0', 10)
  const hi = parts[1] !== undefined ? parseInt(parts[1], 10) : lo + BUCKET_SIZE_DOLLARS
  return { lo, hi }
}

function fmtDollars(dollars: number): string {
  if (dollars === 0) return '$0'
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(0)}k`
  return `$${dollars}`
}

function fmtFull(dollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(dollars)
}

// ── Custom tooltip ─────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: BucketDatum }>
}

function PriceTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipRange}>
        {fmtFull(d.lo)}–{fmtFull(d.hi)}
      </span>
      <span className={styles.tooltipCount}>{d.count} listing{d.count !== 1 ? 's' : ''}</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

const DEFAULT_MAX = 150000  // dollars

const FORWARD_PARAMS = [
  'q', 'make', 'model', 'yearMin', 'yearMax',
  'mileageMax', 'condition', 'conversionType', 'rampType', 'hasLift', 'handControls', 'color', 'state',
]

export function PriceHistogram() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // URL price range in dollars (URL stores cents)
  const urlMin = useMemo(() => {
    const v = searchParams.get('priceMin')
    return v ? Math.floor(parseInt(v, 10) / 100) : 0
  }, [searchParams])

  const urlMax = useMemo(() => {
    const v = searchParams.get('priceMax')
    return v ? Math.floor(parseInt(v, 10) / 100) : 0
  }, [searchParams])

  const [data, setData] = useState<BucketDatum[]>([])
  const [rangeMax, setRangeMax] = useState(DEFAULT_MAX)

  // Local slider value (dollars) — tracks drag before commit
  const [localValue, setLocalValue] = useState<[number, number] | null>(null)

  // The effective committed range (dollars)
  const committedMin = urlMin
  const committedMax = urlMax > 0 ? urlMax : rangeMax

  // What to render in the slider
  const sliderDisplay = localValue ?? [committedMin, committedMax]

  const hasFilter = urlMin > 0 || urlMax > 0

  // Build facets fetch URL without price params (cross-filter behaviour)
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
      .then((r) => r.json() as Promise<{ data: { priceDistribution: RawBucket[] } }>)
      .then(({ data: { priceDistribution } }) => {
        if (cancelled) return
        const parsed: BucketDatum[] = priceDistribution.map(({ bucket, count }) => {
          const { lo, hi } = parseBucket(bucket)
          return { bucket, lo, hi, count, label: fmtDollars(lo) }
        })
        setData(parsed)
        const max = parsed.length > 0
          ? Math.max(...parsed.map((b) => b.hi))
          : DEFAULT_MAX
        setRangeMax(max)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [fetchUrl])

  const push = useCallback(
    (min: number, max: number) => {
      const params = new URLSearchParams(searchParams.toString())
      if (min > 0) {
        params.set('priceMin', String(min * 100))
      } else {
        params.delete('priceMin')
      }
      if (max > 0) {
        params.set('priceMax', String(max * 100))
      } else {
        params.delete('priceMax')
      }
      params.delete('page')
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams, rangeMax],
  )

  const handleBarClick = useCallback(
    (d: BucketDatum) => {
      const alreadyActive =
        hasFilter && committedMin === d.lo && committedMax === d.hi
      if (alreadyActive) {
        push(0, 0)
      } else {
        push(d.lo, d.hi)
      }
    },
    [hasFilter, committedMin, committedMax, push],
  )

  const handleSliderChange = useCallback((v: number[]) => {
    if (v.length >= 2) setLocalValue([v[0]!, v[1]!])
  }, [])

  const handleSliderCommit = useCallback(
    (v: number[]) => {
      setLocalValue(null)
      if (v.length >= 2) {
        // Treat right handle at rangeMax as "no upper bound" so priceMax is omitted
        const max = v[1]! >= rangeMax ? 0 : v[1]!
        push(v[0]!, max)
      }
    },
    [push, rangeMax],
  )

  const ariaLabel = useMemo(() => {
    const suffix = hasFilter
      ? `, filtered from ${fmtFull(committedMin)} to ${fmtFull(committedMax)}`
      : ', no price filter active'
    return `Price distribution histogram showing listing counts per $5,000 price bracket${suffix}`
  }, [hasFilter, committedMin, committedMax])

  const [displayMin, displayMax] = sliderDisplay

  const isBarActive = useCallback(
    (d: BucketDatum): boolean => {
      if (displayMin === 0 && displayMax >= rangeMax) return true
      return d.lo >= displayMin && d.hi <= displayMax
    },
    [displayMin, displayMax, rangeMax],
  )

  const matchingCount = useMemo(() => {
    if (!data.length) return null
    return data
      .filter(b => b.lo >= displayMin && b.hi <= displayMax)
      .reduce((sum, b) => sum + b.count, 0)
  }, [data, displayMin, displayMax])

  const highLabel = displayMax >= rangeMax
    ? `${fmtDollars(rangeMax)}+`
    : fmtFull(displayMax)

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.label}>Price</span>
      </div>

      {/* Bar chart */}
      <div
        className={styles.chartWrapper}
        role="img"
        aria-label={ariaLabel}
      >
        <ResponsiveContainer width="100%" height={80}>
          <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap="10%">
            <Tooltip content={<PriceTooltip />} cursor={{ fill: 'var(--clr-border)', opacity: 0.5 }} />
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

      {/* Dual-handle range slider */}
      <div className={styles.sliderWrapper}>
        <Slider
          min={0}
          max={rangeMax}
          step={5000}
          value={[displayMin, displayMax]}
          onValueChange={handleSliderChange}
          onValueCommit={handleSliderCommit}
          aria-label="Price range"
          className={styles.slider}
        />
      </div>

      {/* Labels below slider: low price | count | high price */}
      <div className={styles.sliderLabels}>
        <span className={styles.sliderLow}>{fmtFull(displayMin)}</span>
        {matchingCount !== null && (
          <span className={styles.sliderCount}>
            {matchingCount.toLocaleString()} listing{matchingCount !== 1 ? 's' : ''}
          </span>
        )}
        <span className={styles.sliderHigh}>{highLabel}</span>
      </div>

      {hasFilter && (
        <button
          type="button"
          className={styles.clearBtn}
          onClick={() => push(0, 0)}
        >
          Clear price filter
        </button>
      )}

    </div>
  )
}
