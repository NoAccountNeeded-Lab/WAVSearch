'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import styles from './SearchFilters.module.css'

export function SortSelect() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

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

  return (
    <div className={styles.sortGroup}>
      <label htmlFor="sort-select" className={styles.sortLabel}>
        Sort
      </label>
      <select
        id="sort-select"
        className={styles.sortSelect}
        value={sort}
        onChange={(e) => push({ sort: e.target.value })}
      >
        <option value="listedAt:desc">Newest listings</option>
        <option value="priceCents:asc">Price: Low to high</option>
        <option value="priceCents:desc">Price: High to low</option>
        <option value="mileage:asc">Lowest mileage</option>
        <option value="year:desc">Year: Newest first</option>
      </select>
    </div>
  )
}
