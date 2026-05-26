'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useId, useRef, useTransition } from 'react'
import styles from './SearchFilters.module.css'

interface ChipProps {
  label: string
  active: boolean
  onToggle: () => void
}

function Chip({ label, active, onToggle }: ChipProps) {
  return (
    <button
      type="button"
      className={styles.chip}
      aria-pressed={active}
      onClick={onToggle}
    >
      {label}
    </button>
  )
}

export function SearchFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const searchInputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const q = searchParams.get('q') ?? ''
  const conversionType = searchParams.get('conversionType') ?? ''
  const hasLift = searchParams.get('hasLift') === 'true'
  const handControls = searchParams.get('handControls') === 'true'
  const condition = searchParams.get('condition') ?? ''
  const sort = searchParams.get('sort') ?? 'listedAt:desc'

  const push = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
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

  const toggleConversionType = (type: string) =>
    push({ conversionType: conversionType === type ? null : type })

  const toggleBool = (key: string, current: boolean) =>
    push({ [key]: current ? null : 'true' })

  const toggleCondition = (cond: string) =>
    push({ condition: condition === cond ? null : cond })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const value = inputRef.current?.value.trim() ?? ''
    push({ q: value || null })
  }

  const hasActiveFilters =
    q || conversionType || hasLift || handControls || condition

  return (
    <div className={`${styles.root} ${isPending ? styles.pending : ''}`}>
      {isPending && (
        <p className="sr-only" role="status" aria-live="polite">
          Loading results&hellip;
        </p>
      )}

      {/* Search input */}
      <form onSubmit={handleSearch} role="search" className={styles.searchForm}>
        <label htmlFor={searchInputId} className={styles.searchLabel}>
          Search by make, model, or keyword
        </label>
        <div className={styles.searchRow}>
          <input
            ref={inputRef}
            id={searchInputId}
            type="search"
            name="q"
            defaultValue={q}
            placeholder="e.g. Toyota Sienna, minivan&hellip;"
            className={styles.searchInput}
            autoComplete="off"
          />
          <button type="submit" className={styles.searchBtn}>
            Search
          </button>
        </div>
      </form>

      {/* Filters */}
      <div
        className={styles.filters}
        role="group"
        aria-label="Filter vehicles"
      >
        <div className={styles.filterGroup}>
          <span id="label-entry" className={styles.filterGroupLabel}>
            Entry type
          </span>
          <div className={styles.chips} role="group" aria-labelledby="label-entry">
            <Chip
              label="Rear entry"
              active={conversionType === 'rear_entry'}
              onToggle={() => toggleConversionType('rear_entry')}
            />
            <Chip
              label="Side entry"
              active={conversionType === 'side_entry'}
              onToggle={() => toggleConversionType('side_entry')}
            />
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span id="label-features" className={styles.filterGroupLabel}>
            Features
          </span>
          <div
            className={styles.chips}
            role="group"
            aria-labelledby="label-features"
          >
            <Chip
              label="Has lift"
              active={hasLift}
              onToggle={() => toggleBool('hasLift', hasLift)}
            />
            <Chip
              label="Hand controls"
              active={handControls}
              onToggle={() => toggleBool('handControls', handControls)}
            />
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span id="label-condition" className={styles.filterGroupLabel}>
            Condition
          </span>
          <div
            className={styles.chips}
            role="group"
            aria-labelledby="label-condition"
          >
            <Chip
              label="New"
              active={condition === 'new'}
              onToggle={() => toggleCondition('new')}
            />
            <Chip
              label="Used"
              active={condition === 'used'}
              onToggle={() => toggleCondition('used')}
            />
            <Chip
              label="Certified pre-owned"
              active={condition === 'certified_pre_owned'}
              onToggle={() => toggleCondition('certified_pre_owned')}
            />
          </div>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => router.push(pathname)}
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Sort — rendered inside the filters bar on desktop, exposed here for layout control from parent */}
      <div className={styles.filterGroup} data-sort>
        <span id="label-sort" className={styles.filterGroupLabel}>
          Sort
        </span>
        <label htmlFor="sort-select" className="sr-only">
          Sort results
        </label>
        <select
          id="sort-select"
          className={styles.sortSelect}
          value={sort}
          onChange={(e) => push({ sort: e.target.value })}
          aria-labelledby="label-sort"
        >
          <option value="listedAt:desc">Newest listings</option>
          <option value="priceCents:asc">Price: Low to high</option>
          <option value="priceCents:desc">Price: High to low</option>
          <option value="mileage:asc">Lowest mileage</option>
          <option value="year:desc">Year: Newest first</option>
        </select>
      </div>
    </div>
  )
}
