'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import styles from './page.module.css'

export function BackButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={styles.back}
      aria-label="Back to listings"
    >
      <ChevronLeft size={20} aria-hidden />
    </button>
  )
}
