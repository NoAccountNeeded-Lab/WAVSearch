'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import styles from './ActiveFilters.module.css'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDollars(dollars: number): string {
  if (dollars === 0) return '$0'
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(0)}k`
  return `$${dollars}`
}

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function parseCommaSep(v: string | null): string[] {
  if (!v) return []
  return v.split(',').map((s) => s.trim()).filter(Boolean)
}

const MULTI_PARAM_LABELS: Record<string, { singular: string; plural: string }> = {
  make:           { singular: 'Make',       plural: 'Makes'       },
  model:          { singular: 'Model',      plural: 'Models'      },
  condition:      { singular: 'Condition',  plural: 'Conditions'  },
  conversionType: { singular: 'Entry type', plural: 'Entry types' },
  color:          { singular: 'Color',      plural: 'Colors'      },
  rampType:       { singular: 'Ramp type',  plural: 'Ramp types'  },
  state:          { singular: 'State',      plural: 'States'      },
}

const BOOL_LABELS: Record<string, string> = {
  hasLift:      'Has lift',
  handControls: 'Hand controls',
}

// ── Pill building ──────────────────────────────────────────────────────────

interface Pill {
  key: string
  label: string
  ariaLabel: string
  paramsToDelete: string[]
}

function buildPills(params: URLSearchParams): Pill[] {
  const pills: Pill[] = []

  // Price
  const priceMinCents = params.get('priceMin')
  const priceMaxCents = params.get('priceMax')
  if (priceMinCents || priceMaxCents) {
    const min = priceMinCents ? Math.floor(parseInt(priceMinCents, 10) / 100) : null
    const max = priceMaxCents ? Math.floor(parseInt(priceMaxCents, 10) / 100) : null
    let label: string
    if (min !== null && max !== null) {
      label = `${fmtDollars(min)}–${fmtDollars(max)}`
    } else if (min !== null) {
      label = `${fmtDollars(min)}+`
    } else {
      label = `Up to ${fmtDollars(max!)}`
    }
    pills.push({ key: 'price', label, ariaLabel: 'Remove price filter', paramsToDelete: ['priceMin', 'priceMax'] })
  }

  // Multi-value
  for (const [param, labels] of Object.entries(MULTI_PARAM_LABELS)) {
    const values = parseCommaSep(params.get(param))
    if (values.length === 0) continue
    let label: string
    if (values.length === 1) {
      label = formatLabel(values[0]!)
    } else if (values.length === 2) {
      label = values.map(formatLabel).join(', ')
    } else {
      label = `${values.length} ${labels.plural}`
    }
    pills.push({
      key: param,
      label,
      ariaLabel: `Remove ${labels.singular.toLowerCase()} filter`,
      paramsToDelete: [param],
    })
  }

  // Booleans
  for (const [param, label] of Object.entries(BOOL_LABELS)) {
    if (params.get(param) === 'true') {
      pills.push({
        key: param,
        label,
        ariaLabel: `Remove ${label.toLowerCase()} filter`,
        paramsToDelete: [param],
      })
    }
  }

  // Year range
  const yearMin = params.get('yearMin')
  const yearMax = params.get('yearMax')
  if (yearMin || yearMax) {
    let label: string
    if (yearMin && yearMax) label = `${yearMin}–${yearMax}`
    else if (yearMin) label = `${yearMin}+`
    else label = `Up to ${yearMax}`
    pills.push({ key: 'year', label, ariaLabel: 'Remove year filter', paramsToDelete: ['yearMin', 'yearMax'] })
  }

  // Mileage
  const mileageMax = params.get('mileageMax')
  if (mileageMax) {
    const miles = parseInt(mileageMax, 10)
    pills.push({
      key: 'mileage',
      label: `Under ${new Intl.NumberFormat('en-US').format(miles)} mi`,
      ariaLabel: 'Remove mileage filter',
      paramsToDelete: ['mileageMax'],
    })
  }

  return pills
}

// ── Component ──────────────────────────────────────────────────────────────

export function ActiveFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const pills = buildPills(new URLSearchParams(searchParams.toString()))

  if (pills.length === 0) return null

  const removePill = (paramsToDelete: string[]) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const key of paramsToDelete) next.delete(key)
    next.delete('page')
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`, { scroll: false })
    })
  }

  const clearAll = () => {
    startTransition(() => {
      router.push(pathname, { scroll: false })
    })
  }

  return (
    <ul
      className={styles.pills}
      role="list"
      aria-label="Active filters"
      aria-live="polite"
    >
      {pills.map((pill) => (
        <li key={pill.key} className={styles.pill}>
          <span className={styles.pillLabel}>{pill.label}</span>
          <button
            type="button"
            className={styles.pillRemove}
            aria-label={pill.ariaLabel}
            onClick={() => removePill(pill.paramsToDelete)}
          >
            ×
          </button>
        </li>
      ))}
      {pills.length >= 2 && (
        <li>
          <button
            type="button"
            className={`${styles.pill} ${styles.clearAll}`}
            aria-label="Clear all filters"
            onClick={clearAll}
          >
            Clear all ×
          </button>
        </li>
      )}
    </ul>
  )
}
