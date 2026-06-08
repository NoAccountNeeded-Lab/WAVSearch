'use client'

import { useRef, useState, useTransition } from 'react'
import type { IntakeFilters } from '@wivwav/types'
import styles from '../ops.module.css'

// ── Shared helpers ────────────────────────────────────────────────────────────

interface OllamaMeta {
  provider: string
  model: string
  baseUrl: string
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className={styles.muted} style={{ width: '8rem', paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>{label}</td>
      <td style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}><code style={{ fontSize: '0.8125rem' }}>{value}</code></td>
    </tr>
  )
}

function MetaTable({ meta, durationMs }: { meta: OllamaMeta | undefined; durationMs: number | null }) {
  if (!meta && durationMs === null) return null
  return (
    <table className={styles.table} style={{ marginTop: '0.75rem', fontSize: '0.8125rem' }}>
      <tbody>
        {meta && <>
          <MetaRow label="Provider" value={meta.provider} />
          <MetaRow label="Model" value={meta.model} />
          <MetaRow label="Base URL" value={meta.baseUrl} />
        </>}
        {durationMs !== null && <MetaRow label="Duration" value={`${durationMs.toLocaleString()} ms`} />}
      </tbody>
    </table>
  )
}

function RawResponse({ data }: { data: unknown }) {
  return (
    <details style={{ marginTop: '0.75rem' }}>
      <summary style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)', cursor: 'pointer', userSelect: 'none' }}>
        Raw response
      </summary>
      <pre className={styles.miniCode} style={{ marginTop: '0.375rem', maxHeight: '12rem' }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  )
}

const panelGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 3fr',
  gap: '1.5rem',
  padding: '1.25rem 1rem',
}

const colHead: React.CSSProperties = {
  margin: '0 0 0.625rem',
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  color: 'var(--clr-text-muted)',
}

// ── Intake test ───────────────────────────────────────────────────────────────

const INTAKE_EXAMPLE =
  'I use a power wheelchair and need a rear-entry van with an in-floor ramp. Looking for a used vehicle under $40,000 in Texas.'

export function IntakeTestPanel() {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{
    filters: IntakeFilters
    meta?: OllamaMeta
    raw: unknown
    durationMs: number
    error?: string
  } | null>(null)

  function run() {
    const description = ref.current?.value.trim() ?? ''
    if (!description) return
    setResult(null)
    start(async () => {
      const t = Date.now()
      try {
        const res = await fetch('/api/intake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description }),
        })
        const body = await res.json() as { data?: { filters?: IntakeFilters; _meta?: OllamaMeta } }
        const data = body.data
        setResult({
          filters: data?.filters ?? {},
          ...(data?._meta !== undefined ? { meta: data._meta } : {}),
          raw: body,
          durationMs: Date.now() - t,
          ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
        })
      } catch (e) {
        setResult({ filters: {}, raw: null, durationMs: Date.now() - t, error: String(e) })
      }
    })
  }

  const filterEntries = result ? Object.entries(result.filters) : []

  return (
    <div style={panelGrid}>
      {/* Left: input */}
      <div>
        <p style={colHead}>Description</p>
        <textarea
          ref={ref}
          rows={5}
          defaultValue={INTAKE_EXAMPLE}
          disabled={pending}
          aria-label="Test description"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '0.5rem 0.625rem',
            border: '1px solid var(--clr-border-strong)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--clr-bg)', color: 'var(--clr-text)',
            fontFamily: 'var(--font)', fontSize: '0.875rem', lineHeight: 1.5, resize: 'vertical',
          }}
        />
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          style={{ marginTop: '0.5rem' }}
          disabled={pending}
          onClick={run}
        >
          {pending ? 'Running…' : 'Run test'}
        </button>
      </div>

      {/* Right: results */}
      <div>
        <p style={colHead}>Results</p>
        {!result && !pending && (
          <p className={styles.muted} style={{ fontSize: '0.875rem' }}>Results will appear here.</p>
        )}
        {result?.error && <p className={styles.errorMsg}>{result.error}</p>}
        {result && (
          <>
            {filterEntries.length === 0 ? (
              <p className={styles.muted} style={{ fontSize: '0.875rem' }}>
                No filters extracted — check Ollama is running and the model is pulled.
              </p>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead><tr><th>Filter</th><th>Value</th></tr></thead>
                  <tbody>
                    {filterEntries.map(([k, v]) => (
                      <tr key={k}>
                        <td><code>{k}</code></td>
                        <td>{String(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <MetaTable meta={result.meta} durationMs={result.durationMs} />
            <RawResponse data={result.raw} />
          </>
        )}
      </div>
    </div>
  )
}

// ── Structure test ────────────────────────────────────────────────────────────

const STRUCTURE_EXAMPLE = `<div class="vehicle-listing">
  <h1 class="listing-title">2022 Toyota Sienna Wheelchair Van</h1>
  <span class="listing-price">$52,995</span>
  <ul class="specs">
    <li><strong>Year:</strong> 2022</li>
    <li><strong>Make:</strong> Toyota</li>
    <li><strong>Model:</strong> Sienna</li>
    <li><strong>Mileage:</strong> 14,200 miles</li>
    <li><strong>VIN:</strong> 5TDKZ3DC2NS123456</li>
    <li><strong>Conversion:</strong> Rear Entry, In-Floor Ramp</li>
    <li><strong>Condition:</strong> Used</li>
  </ul>
  <img class="vehicle-image" src="/images/sienna.jpg" alt="Sienna WAV" />
</div>`

interface StructureField {
  name: string
  selector: string
  sample: string | null
}

export function StructureTestPanel() {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{
    fields: StructureField[]
    rawText: string
    meta?: OllamaMeta
    durationMs: number
    error?: string
  } | null>(null)

  function run() {
    const html = ref.current?.value.trim() ?? ''
    if (!html) return
    setResult(null)
    start(async () => {
      const t = Date.now()
      try {
        const res = await fetch('/api/ai-test/structure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html }),
        })
        const body = await res.json() as {
          data?: { fields?: StructureField[]; rawText?: string; _meta?: OllamaMeta }
        }
        const data = body.data
        setResult({
          fields: data?.fields ?? [],
          rawText: data?.rawText ?? '',
          ...(data?._meta !== undefined ? { meta: data._meta } : {}),
          durationMs: Date.now() - t,
          ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
        })
      } catch (e) {
        setResult({ fields: [], rawText: '', durationMs: Date.now() - t, error: String(e) })
      }
    })
  }

  return (
    <div style={panelGrid}>
      {/* Left: input */}
      <div>
        <p style={colHead}>HTML snippet</p>
        <textarea
          ref={ref}
          rows={12}
          defaultValue={STRUCTURE_EXAMPLE}
          disabled={pending}
          aria-label="HTML to analyze"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '0.5rem 0.625rem',
            border: '1px solid var(--clr-border-strong)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--clr-bg)', color: 'var(--clr-text)',
            fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8125rem', lineHeight: 1.45, resize: 'vertical',
          }}
        />
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          style={{ marginTop: '0.5rem' }}
          disabled={pending}
          onClick={run}
        >
          {pending ? 'Analyzing…' : 'Run test'}
        </button>
      </div>

      {/* Right: results */}
      <div>
        <p style={colHead}>Detected fields</p>
        {!result && !pending && (
          <p className={styles.muted} style={{ fontSize: '0.875rem' }}>Results will appear here.</p>
        )}
        {result?.error && <p className={styles.errorMsg}>{result.error}</p>}
        {result && (
          <>
            {result.fields.length === 0 ? (
              <p className={styles.muted} style={{ fontSize: '0.875rem' }}>
                No fields detected — check Ollama is running and the model is pulled.
                {result.rawText && <><br /><br /><em>Raw response:</em> {result.rawText}</>}
              </p>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead><tr><th>Field</th><th>Selector</th><th>Sample</th></tr></thead>
                  <tbody>
                    {result.fields.map((f, i) => (
                      <tr key={i}>
                        <td><code>{f.name}</code></td>
                        <td><code style={{ fontSize: '0.75rem' }}>{f.selector}</code></td>
                        <td className={styles.muted}>{f.sample ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <MetaTable meta={result.meta} durationMs={result.durationMs} />
            <RawResponse data={result} />
          </>
        )}
      </div>
    </div>
  )
}

// ── Remap test ────────────────────────────────────────────────────────────────

const REMAP_HTML_EXAMPLE = `<article class="inventory-item">
  <h2 class="vehicle-name">2020 Honda Odyssey Conversion Van</h2>
  <div class="vehicle-cost">$38,500</div>
  <div class="vehicle-specs">
    <span class="spec-year">2020</span>
    <span class="spec-make">Honda</span>
    <span class="spec-model">Odyssey</span>
    <span class="spec-miles">41,000 mi</span>
    <span class="spec-vin">5FNRL6H74LB012345</span>
  </div>
  <p class="conversion-info">Side Entry, Fold-Out Ramp, Hand Controls</p>
</article>`

const REMAP_SELECTORS_EXAMPLE = JSON.stringify([
  { targetField: 'title',   selector: '.listing-title',  attribute: null, transform: null },
  { targetField: 'price',   selector: '.listing-price',  attribute: null, transform: 'parsePrice' },
  { targetField: 'year',    selector: '.specs .year',    attribute: null, transform: 'parseInt' },
  { targetField: 'make',    selector: '.specs .make',    attribute: null, transform: null },
  { targetField: 'model',   selector: '.specs .model',   attribute: null, transform: null },
  { targetField: 'mileage', selector: '.specs .mileage', attribute: null, transform: 'parseFloat' },
  { targetField: 'vin',     selector: '.specs .vin',     attribute: null, transform: null },
], null, 2)

interface RemapFieldMapping {
  targetField: string
  selector: string
  attribute: string | null
  transform: string | null
}

export function RemapTestPanel() {
  const htmlRef = useRef<HTMLTextAreaElement>(null)
  const selectorsRef = useRef<HTMLTextAreaElement>(null)
  const sourceRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{
    mappings: RemapFieldMapping[]
    confidence: number
    notes: string
    rawText: string
    meta?: OllamaMeta
    durationMs: number
    error?: string
  } | null>(null)

  function run() {
    const html = htmlRef.current?.value.trim() ?? ''
    if (!html) return
    let previousMappings: unknown = []
    try { previousMappings = JSON.parse(selectorsRef.current?.value ?? '[]') } catch { /* ignore */ }
    const sourceName = sourceRef.current?.value.trim() || 'Test Source'
    setResult(null)
    start(async () => {
      const t = Date.now()
      try {
        const res = await fetch('/api/ai-test/remap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html, previousMappings, sourceName }),
        })
        const body = await res.json() as {
          data?: {
            mappings?: RemapFieldMapping[]
            confidence?: number
            notes?: string
            rawText?: string
            _meta?: OllamaMeta
          }
        }
        const data = body.data
        setResult({
          mappings: data?.mappings ?? [],
          confidence: data?.confidence ?? 0,
          notes: data?.notes ?? '',
          rawText: data?.rawText ?? '',
          ...(data?._meta !== undefined ? { meta: data._meta } : {}),
          durationMs: Date.now() - t,
          ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
        })
      } catch (e) {
        setResult({ mappings: [], confidence: 0, notes: '', rawText: '', durationMs: Date.now() - t, error: String(e) })
      }
    })
  }

  const confidencePct = result ? Math.round(result.confidence * 100) : 0
  const confidenceVariant = confidencePct >= 80 ? 'success' : confidencePct >= 50 ? 'warning' : 'danger'

  return (
    <div style={{ ...panelGrid, gridTemplateColumns: '1fr 1fr' }}>
      {/* Left: inputs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <p style={colHead}>Source name</p>
          <input
            ref={sourceRef}
            type="text"
            className={styles.input}
            defaultValue="Test Source"
            disabled={pending}
            style={{ width: '100%', boxSizing: 'border-box' }}
            aria-label="Source name"
          />
        </div>
        <div>
          <p style={colHead}>Previous selectors (JSON array)</p>
          <textarea
            ref={selectorsRef}
            rows={8}
            defaultValue={REMAP_SELECTORS_EXAMPLE}
            disabled={pending}
            aria-label="Previous selectors JSON"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '0.5rem 0.625rem',
              border: '1px solid var(--clr-border-strong)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--clr-bg)', color: 'var(--clr-text)',
              fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', lineHeight: 1.45, resize: 'vertical',
            }}
          />
        </div>
        <div>
          <p style={colHead}>Updated HTML</p>
          <textarea
            ref={htmlRef}
            rows={8}
            defaultValue={REMAP_HTML_EXAMPLE}
            disabled={pending}
            aria-label="Updated HTML"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '0.5rem 0.625rem',
              border: '1px solid var(--clr-border-strong)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--clr-bg)', color: 'var(--clr-text)',
              fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', lineHeight: 1.45, resize: 'vertical',
            }}
          />
        </div>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={pending}
          onClick={run}
        >
          {pending ? 'Remapping…' : 'Run test'}
        </button>
      </div>

      {/* Right: results */}
      <div>
        <p style={colHead}>Proposed selectors</p>
        {!result && !pending && (
          <p className={styles.muted} style={{ fontSize: '0.875rem' }}>Results will appear here.</p>
        )}
        {result?.error && <p className={styles.errorMsg}>{result.error}</p>}
        {result && (
          <>
            {result.mappings.length === 0 ? (
              <p className={styles.muted} style={{ fontSize: '0.875rem' }}>
                No mappings returned — check Ollama is running and the model is pulled.
                {result.rawText && <><br /><br /><em>Raw:</em> {result.rawText}</>}
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem' }}>
                  <span className={styles.muted} style={{ fontSize: '0.8125rem' }}>Confidence</span>
                  <span className={styles.badge} data-variant={confidenceVariant}>{confidencePct}%</span>
                </div>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr><th>Field</th><th>Selector</th><th>Attr</th><th>Transform</th></tr>
                    </thead>
                    <tbody>
                      {result.mappings.map((m, i) => (
                        <tr key={i}>
                          <td><code>{m.targetField}</code></td>
                          <td><code style={{ fontSize: '0.75rem' }}>{m.selector}</code></td>
                          <td className={styles.muted}>{m.attribute ?? '—'}</td>
                          <td className={styles.muted}>{m.transform ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.notes && (
                  <p style={{ marginTop: '0.625rem', fontSize: '0.8125rem', color: 'var(--clr-text-muted)' }}>
                    <strong>Notes:</strong> {result.notes}
                  </p>
                )}
              </>
            )}
            <MetaTable meta={result.meta} durationMs={result.durationMs} />
            <RawResponse data={result} />
          </>
        )}
      </div>
    </div>
  )
}

// ── Agents test (placeholder — filled in next commit) ────────────────────────

export function AgentsTestPanel() {
  return (
    <div style={{ padding: '1.25rem 1rem' }}>
      <p className={styles.muted} style={{ fontSize: '0.875rem' }}>
        Agents test coming in the next commit.
      </p>
    </div>
  )
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export function JobTestPanel({ jobId }: { jobId: string }) {
  switch (jobId) {
    case 'intake':           return <IntakeTestPanel />
    case 'scraper.structure': return <StructureTestPanel />
    case 'scraper.remap':    return <RemapTestPanel />
    case 'agents':           return <AgentsTestPanel />
    default:                 return null
  }
}
