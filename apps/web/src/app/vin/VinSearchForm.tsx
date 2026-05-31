'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import styles from './page.module.css'

interface VinSearchFormProps {
  initialVin?: string
}

export function VinSearchForm({ initialVin = '' }: VinSearchFormProps) {
  const router = useRouter()
  const [vin, setVin] = useState(initialVin)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedVin = vin.trim().toUpperCase()
    if (!normalizedVin) return
    router.push(`/vin/${encodeURIComponent(normalizedVin)}`)
  }

  return (
    <form className={styles.searchForm} onSubmit={onSubmit}>
      <label htmlFor="vin-search" className={styles.searchLabel}>Enter a VIN</label>
      <div className={styles.searchRow}>
        <input
          id="vin-search"
          className={styles.searchInput}
          value={vin}
          onChange={(event) => setVin(event.target.value)}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={17}
          placeholder="17-character VIN"
        />
        <button type="submit" className={styles.searchButton}>
          <Search size={18} aria-hidden />
          Check VIN
        </button>
      </div>
    </form>
  )
}
