'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import type { IntakeFilters } from '@wivwav/types'
import styles from '../ops.module.css'

interface IntakeMeta {
  provider: string
  model: string
  baseUrl: string
}

interface IntakeResult {
  filters: IntakeFilters
  _meta?: IntakeMeta
  rawResponse: unknown
  durationMs: number
  error?: string
}

const EXAMPLES = [
  'I use a power wheelchair and need a rear-entry van with an in-floor ramp. Looking for a used vehicle under $40,000 in Texas.',
  'My dad transfers out of his chair but needs a lift. Budget is around $35k. We live near Miami.',
  'Side-entry conversion, fold-out ramp, hand controls. New vehicle only, no budget limit. California.',
]

export function IntakeTestClient() {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<IntakeResult | null>(null)

  function runTest(description: string) {
    setResult(null)
    startTransition(async () => {
      const start = Date.now()
      try {
        const res = await fetch('/api/intake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description }),
        })
        const body: unknown = await res.json()
        const durationMs = Date.now() - start
        const data = (body as { data?: { filters?: IntakeFilters; _meta?: IntakeMeta } }).data
        setResult({
          filters: data?.filters ?? {},
          ...(data?._meta !== undefined ? { _meta: data._meta } : {}),
          rawResponse: body,
          durationMs,
          ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
        })
      } catch (err) {
        setResult({
          filters: {},
          rawResponse: null,
          durationMs: Date.now() - start,
          error: err instanceof Error ? err.message : 'Network error',
        })
      }
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const description = textareaRef.current?.value.trim() ?? ''
    if (description) runTest(description)
  }

  function loadExample(text: string) {
    if (textareaRef.current) textareaRef.current.value = text
  }

  const filterEntries = result ? Object.entries(result.filters) : []

  return (
    <main id="main-content" className={styles.main}>
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.heading}>Intake AI Test</h1>
          <Link href="/ops/ai" className={styles.backLink}>← AI</Link>
        </div>

        <p className={styles.pageIntro}>
          Submit free-form text and see how Ollama interprets it into search filters. Shows which model
          and base URL was used, the parsed filters, and the raw response.
        </p>

        {/* ── Input form ───────────────────────────────────── */}
        <section style={{ marginTop: '1.5rem' }} aria-labelledby="test-form-heading">
          <h2 id="test-form-heading" className={styles.sectionHeading}>Description</h2>

          <div style={{ marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--clr-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Examples
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.375rem' }}>
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  onClick={() => loadExample(ex)}
                  style={{ fontSize: '0.75rem', whiteSpace: 'normal', textAlign: 'left', height: 'auto', lineHeight: 1.4, padding: '0.3rem 0.6rem' }}
                >
                  {ex.slice(0, 60)}…
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              rows={5}
              defaultValue={EXAMPLES[0]}
              disabled={isPending}
              aria-label="Vehicle description to test"
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                border: '1px solid var(--clr-border-strong)',
                borderRadius: 'var(--radius)',
                background: 'var(--clr-bg)',
                color: 'var(--clr-text)',
                fontFamily: 'var(--font)',
                fontSize: '0.9375rem',
                lineHeight: 1.5,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ marginTop: '0.75rem' }}>
              <button
                type="submit"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={isPending}
                style={{ fontSize: '0.9375rem', padding: '0.5rem 1.25rem' }}
              >
                {isPending ? 'Calling Ollama…' : 'Run intake'}
              </button>
            </div>
          </form>
        </section>

        {/* ── Results ──────────────────────────────────────── */}
        {result && (
          <>
            {/* Ollama metadata */}
            <section style={{ marginTop: '1.75rem' }} aria-labelledby="meta-heading">
              <h2 id="meta-heading" className={styles.sectionHeading}>Ollama used</h2>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className={styles.muted}>Provider</td>
                      <td><code>{result._meta?.provider ?? '—'}</code></td>
                    </tr>
                    <tr>
                      <td className={styles.muted}>Model</td>
                      <td><code>{result._meta?.model ?? '—'}</code></td>
                    </tr>
                    <tr>
                      <td className={styles.muted}>Base URL</td>
                      <td><code>{result._meta?.baseUrl ?? '—'}</code></td>
                    </tr>
                    <tr>
                      <td className={styles.muted}>Duration</td>
                      <td>{result.durationMs.toLocaleString()} ms</td>
                    </tr>
                    {result.error && (
                      <tr>
                        <td className={styles.muted}>Error</td>
                        <td><span className={styles.errorMsg}>{result.error}</span></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Parsed filters */}
            <section style={{ marginTop: '1.75rem' }} aria-labelledby="filters-heading">
              <h2 id="filters-heading" className={styles.sectionHeading}>Parsed filters</h2>
              {filterEntries.length === 0 ? (
                <p className={styles.empty} style={{ padding: '0.75rem 0' }}>
                  No filters extracted — Ollama may be unreachable at{' '}
                  <code>{result._meta?.baseUrl ?? 'http://localhost:11434'}</code>, or the model returned
                  no recognizable fields. Check that Ollama is running and the model is pulled.
                </p>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Filter</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filterEntries.map(([key, value]) => (
                        <tr key={key}>
                          <td><code>{key}</code></td>
                          <td>{String(value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Raw response */}
            <section style={{ marginTop: '1.75rem' }} aria-labelledby="raw-heading">
              <h2 id="raw-heading" className={styles.sectionHeading}>Raw response</h2>
              <pre className={styles.miniCode} style={{ maxHeight: '20rem' }}>
                {JSON.stringify(result.rawResponse, null, 2)}
              </pre>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
