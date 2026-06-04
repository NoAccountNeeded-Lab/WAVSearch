'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import type { IntakeFilters } from '@wav-search/types'
import styles from './IntakeForm.module.css'

const PLACEHOLDER =
  'e.g. I use a power wheelchair and need a rear-entry van with an in-floor ramp. Looking for a used vehicle under $40,000 in Texas.'

function buildFilterSearch(filters: IntakeFilters): string {
  const params = new URLSearchParams()

  if (filters.conversionType != null) params.set('conversionType', filters.conversionType)
  if (filters.rampType != null) params.set('rampType', filters.rampType)
  if (filters.hasLift === true) params.set('hasLift', 'true')
  if (filters.handControls === true) params.set('handControls', 'true')
  if (filters.condition != null) params.set('condition', filters.condition)
  if (filters.priceMax != null && filters.priceMax > 0) {
    // API accepts price in cents
    params.set('priceMax', String(filters.priceMax * 100))
  }
  if (filters.state != null) params.set('state', filters.state)

  return params.toString()
}

export function IntakeForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const description = textareaRef.current?.value.trim() ?? ''
    if (!description) {
      setErrorMsg('Please describe what you need before searching.')
      textareaRef.current?.focus()
      return
    }

    setErrorMsg(null)

    startTransition(async () => {
      try {
        const res = await fetch('/api/intake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description }),
        })

        if (res.ok) {
          const body = await res.json() as { data?: { filters?: IntakeFilters } }
          const filters = body.data?.filters ?? {}
          const qs = buildFilterSearch(filters)
          router.push(qs ? `/filters?${qs}` : '/filters')
        } else {
          // API error — fall back to unfiltered search
          router.push('/filters')
        }
      } catch {
        // Network error — fall back
        router.push('/filters')
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Describe your vehicle needs"
      noValidate
      className={styles.form}
    >
      <div className={styles.fieldGroup}>
        <label htmlFor="intake-description" className={styles.label}>
          Describe what you need
        </label>
        <p id="intake-hint" className={styles.hint}>
          Tell us about the wheelchair user, the type of access equipment needed, budget, location,
          and whether you want a new or used vehicle. We&apos;ll set the filters for you.
        </p>
        <textarea
          ref={textareaRef}
          id="intake-description"
          name="description"
          rows={4}
          aria-describedby={`intake-hint${errorMsg ? ' intake-error' : ''}`}
          aria-invalid={errorMsg != null ? 'true' : undefined}
          className={styles.textarea}
          placeholder={PLACEHOLDER}
          disabled={isPending}
          maxLength={2000}
        />
        {errorMsg && (
          <p id="intake-error" role="alert" className={styles.error}>
            {errorMsg}
          </p>
        )}
      </div>

      <span className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {isPending ? 'Searching for matching vehicles…' : ' '}
      </span>

      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.submitBtn}
          disabled={isPending}
        >
          {isPending ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              <span>Finding matches…</span>
            </>
          ) : (
            'Find matching vehicles'
          )}
        </button>

        <a href="/filters" className={styles.skipLink}>
          Skip — search on my own
        </a>
      </div>
    </form>
  )
}
