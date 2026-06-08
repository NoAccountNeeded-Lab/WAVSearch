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

function OllamaErrorMsg({ error, model }: { error: string; model: string | undefined }) {
  const isNotFound = error.toLowerCase().includes('not found') || error.toLowerCase().includes('pull')
  const isConnRefused =
    error === 'fetch failed' ||
    error.toLowerCase().includes('econnrefused') ||
    error.toLowerCase().includes('connect')
  return (
    <div style={{
      padding: '0.625rem 0.75rem',
      background: 'var(--clr-surface)',
      border: '1px solid var(--clr-border-strong)',
      borderLeft: '3px solid var(--clr-danger, #c0392b)',
      borderRadius: 'var(--radius-sm)',
      fontSize: '0.8125rem',
      lineHeight: 1.5,
    }}>
      <p style={{ margin: 0, fontWeight: 600, color: 'var(--clr-text)' }}>
        {isConnRefused ? 'Ollama is not running' : isNotFound ? 'Model not found' : 'Ollama error'}
      </p>
      {!isConnRefused && <p style={{ margin: '0.25rem 0 0', color: 'var(--clr-text-muted)' }}>{error}</p>}
      {isConnRefused && (
        <p style={{ margin: '0.25rem 0 0', color: 'var(--clr-text-muted)' }}>
          Start it in your terminal:{' '}
          <code style={{ userSelect: 'all', background: 'var(--clr-bg)', padding: '0.125rem 0.375rem', borderRadius: '3px' }}>
            ollama serve
          </code>
          {' '}— or open the Ollama app.
        </p>
      )}
      {isNotFound && model && (
        <p style={{ margin: '0.5rem 0 0', color: 'var(--clr-text-muted)' }}>
          Pull it first:{' '}
          <code style={{ userSelect: 'all', background: 'var(--clr-bg)', padding: '0.125rem 0.375rem', borderRadius: '3px' }}>
            ollama pull {model}
          </code>
        </p>
      )}
    </div>
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

const sampleBtnStyle: React.CSSProperties = {
  padding: '0.1875rem 0.5rem',
  fontSize: '0.75rem',
  border: '1px solid var(--clr-border-strong)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--clr-surface)',
  color: 'var(--clr-text)',
  cursor: 'pointer',
  lineHeight: 1.4,
  fontFamily: 'var(--font)',
}

function SampleButtons({
  labels,
  onSelect,
  onRandom,
  disabled,
}: {
  labels: string[]
  onSelect: (i: number) => void
  onRandom: () => void
  disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
      {labels.map((label, i) => (
        <button key={i} type="button" style={sampleBtnStyle} disabled={disabled} onClick={() => onSelect(i)}>
          {label}
        </button>
      ))}
      <button type="button" style={{ ...sampleBtnStyle, borderStyle: 'dashed' }} disabled={disabled} onClick={onRandom}>
        Random
      </button>
    </div>
  )
}

const panelGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 3fr',
  gap: '1.5rem',
  padding: '1.25rem 1.5rem',
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

const INTAKE_SAMPLES = [
  {
    label: 'Rear-entry ramp',
    text: 'I use a power wheelchair and need a rear-entry van with an in-floor ramp. Looking for a used vehicle under $40,000 in Texas.',
  },
  {
    label: 'Side-entry, hand controls',
    text: 'Need a side-entry conversion van with hand controls. New or certified pre-owned, budget up to $60,000. Based in California.',
  },
  {
    label: 'Platform lift',
    text: 'Looking for a minivan with a platform lift — my wife uses a heavy power chair. Prefer certified pre-owned in Florida, under $55k.',
  },
  {
    label: 'Fold-out ramp, budget',
    text: 'Any entry type is fine, fold-out ramp preferred. Used vehicle, max $30,000, somewhere in Ohio.',
  },
]

export function IntakeTestPanel() {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{
    filters: IntakeFilters
    rawText: string
    ollamaError: string
    meta?: OllamaMeta
    raw: unknown
    durationMs: number
    error?: string
  } | null>(null)

  function fill(i: number) {
    const s = INTAKE_SAMPLES[i]
    if (ref.current && s) ref.current.value = s.text
  }
  function fillRandom() {
    fill(Math.floor(Math.random() * INTAKE_SAMPLES.length))
  }

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
        const body = await res.json() as { data?: { filters?: IntakeFilters; rawText?: string; ollamaError?: string; _meta?: OllamaMeta } }
        const data = body.data
        setResult({
          filters: data?.filters ?? {},
          rawText: data?.rawText ?? '',
          ollamaError: data?.ollamaError ?? '',
          ...(data?._meta !== undefined ? { meta: data._meta } : {}),
          raw: body,
          durationMs: Date.now() - t,
          ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
        })
      } catch (e) {
        setResult({ filters: {}, rawText: '', ollamaError: '', raw: null, durationMs: Date.now() - t, error: String(e) })
      }
    })
  }

  const filterEntries = result ? Object.entries(result.filters) : []

  return (
    <div style={panelGrid}>
      {/* Left: input */}
      <div>
        <p style={colHead}>Description</p>
        <SampleButtons
          labels={INTAKE_SAMPLES.map(s => s.label)}
          onSelect={fill}
          onRandom={fillRandom}
          disabled={pending}
        />
        <textarea
          ref={ref}
          rows={5}
          defaultValue={INTAKE_SAMPLES[0]?.text ?? ''}
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
            {result.ollamaError ? (
              <OllamaErrorMsg error={result.ollamaError} model={result.meta?.model} />
            ) : filterEntries.length === 0 ? (
              <p className={styles.muted} style={{ fontSize: '0.875rem' }}>
                {result.rawText
                  ? 'No filters extracted — model responded but returned no recognisable JSON.'
                  : 'No response from Ollama — check it is running and the model is pulled.'}
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

const STRUCTURE_SAMPLES = [
  {
    label: 'Sienna (ul/li)',
    html: `<div class="vehicle-listing">
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
</div>`,
  },
  {
    label: 'Pacifica (dl/dd)',
    html: `<section id="listing-detail">
  <h2 class="title">2021 Chrysler Pacifica Touring Accessible Van</h2>
  <p class="asking-price">$61,500</p>
  <dl class="vehicle-details">
    <dt>Year</dt><dd>2021</dd>
    <dt>Make</dt><dd>Chrysler</dd>
    <dt>Model</dt><dd>Pacifica</dd>
    <dt>Trim</dt><dd>Touring</dd>
    <dt>Stock #</dt><dd>WV-00412</dd>
    <dt>VIN</dt><dd>2C4RC1BG1MR512345</dd>
    <dt>Mileage</dt><dd>8,900 miles</dd>
    <dt>Entry Type</dt><dd>Side Entry</dd>
    <dt>Ramp</dt><dd>Fold-Out Power Ramp</dd>
    <dt>Condition</dt><dd>New</dd>
  </dl>
  <p class="location">Orlando, FL 32801</p>
</section>`,
  },
  {
    label: 'Grand Caravan (table)',
    html: `<div class="inventory-card" data-vin="2D4RN5D18AR123456">
  <h3>2019 Dodge Grand Caravan Mobility Van</h3>
  <div class="price-block">$29,888</div>
  <table class="spec-table">
    <tr><th>Year</th><td>2019</td></tr>
    <tr><th>Make</th><td>Dodge</td></tr>
    <tr><th>Model</th><td>Grand Caravan</td></tr>
    <tr><th>Miles</th><td>52,400</td></tr>
    <tr><th>Stock</th><td>GC-0219</td></tr>
    <tr><th>Conversion</th><td>BraunAbility Rear Entry</td></tr>
    <tr><th>Floor</th><td>Lowered 14"</td></tr>
    <tr><th>Hand Controls</th><td>Yes</td></tr>
    <tr><th>Condition</th><td>Used</td></tr>
  </table>
</div>`,
  },
]

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
    ollamaError: string
    meta?: OllamaMeta
    durationMs: number
    error?: string
  } | null>(null)

  function fill(i: number) {
    const s = STRUCTURE_SAMPLES[i]
    if (ref.current && s) ref.current.value = s.html
  }
  function fillRandom() {
    fill(Math.floor(Math.random() * STRUCTURE_SAMPLES.length))
  }

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
          data?: { fields?: StructureField[]; rawText?: string; ollamaError?: string; _meta?: OllamaMeta }
        }
        const data = body.data
        setResult({
          fields: data?.fields ?? [],
          rawText: data?.rawText ?? '',
          ollamaError: data?.ollamaError ?? '',
          ...(data?._meta !== undefined ? { meta: data._meta } : {}),
          durationMs: Date.now() - t,
          ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
        })
      } catch (e) {
        setResult({ fields: [], rawText: '', ollamaError: '', durationMs: Date.now() - t, error: String(e) })
      }
    })
  }

  return (
    <div style={panelGrid}>
      {/* Left: input */}
      <div>
        <p style={colHead}>HTML snippet</p>
        <SampleButtons
          labels={STRUCTURE_SAMPLES.map(s => s.label)}
          onSelect={fill}
          onRandom={fillRandom}
          disabled={pending}
        />
        <textarea
          ref={ref}
          rows={12}
          defaultValue={STRUCTURE_SAMPLES[0]?.html ?? ''}
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
            {result.ollamaError ? (
              <OllamaErrorMsg error={result.ollamaError} model={result.meta?.model} />
            ) : result.fields.length === 0 ? (
              <p className={styles.muted} style={{ fontSize: '0.875rem' }}>
                {result.rawText
                  ? 'No fields detected — model responded but returned no recognisable JSON.'
                  : 'No response from Ollama — check it is running and the model is pulled.'}
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

const REMAP_SAMPLES = [
  {
    label: 'Honda Odyssey',
    sourceName: 'BraunAbility Dealer',
    selectors: JSON.stringify([
      { targetField: 'title',   selector: '.listing-title',  attribute: null, transform: null },
      { targetField: 'price',   selector: '.listing-price',  attribute: null, transform: 'parsePrice' },
      { targetField: 'year',    selector: '.specs .year',    attribute: null, transform: 'parseInt' },
      { targetField: 'make',    selector: '.specs .make',    attribute: null, transform: null },
      { targetField: 'model',   selector: '.specs .model',   attribute: null, transform: null },
      { targetField: 'mileage', selector: '.specs .mileage', attribute: null, transform: 'parseFloat' },
      { targetField: 'vin',     selector: '.specs .vin',     attribute: null, transform: null },
    ], null, 2),
    html: `<article class="inventory-item">
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
</article>`,
  },
  {
    label: 'Toyota Sienna (redesign)',
    sourceName: 'VMI Mobility',
    selectors: JSON.stringify([
      { targetField: 'title',   selector: 'h1.vehicle-title', attribute: null, transform: null },
      { targetField: 'price',   selector: '.price',           attribute: null, transform: 'parsePrice' },
      { targetField: 'mileage', selector: '.miles',           attribute: null, transform: 'parseFloat' },
      { targetField: 'vin',     selector: '.vin-number',      attribute: null, transform: null },
      { targetField: 'rampType', selector: '.ramp-type',      attribute: null, transform: null },
    ], null, 2),
    html: `<div class="listing-wrapper" data-stock="VMI-1042">
  <header class="listing-header">
    <h2 class="listing-name">2023 Toyota Sienna Platinum WAV</h2>
    <span class="sale-price">$74,900</span>
  </header>
  <ul class="detail-list">
    <li data-field="odometer">22,100 miles</li>
    <li data-field="vin-id">JTDZDREV5NJ012345</li>
    <li data-field="conversion">BraunAbility In-Floor Ramp</li>
    <li data-field="entry">Rear Entry</li>
  </ul>
</div>`,
  },
  {
    label: 'Chrysler Pacifica (new dealer)',
    sourceName: 'Mobility Works',
    selectors: JSON.stringify([
      { targetField: 'title',        selector: '.car-name',       attribute: null, transform: null },
      { targetField: 'price',        selector: '#asking-price',   attribute: null, transform: 'parsePrice' },
      { targetField: 'year',         selector: '.year-value',     attribute: null, transform: 'parseInt' },
      { targetField: 'conversionType', selector: '.entry-type',   attribute: null, transform: null },
    ], null, 2),
    html: `<div class="vehicle-page">
  <h1 class="veh-title">2022 Chrysler Pacifica Touring Accessible</h1>
  <div class="pricing-section">
    <p class="msrp">MSRP: <strong>$68,495</strong></p>
  </div>
  <table class="specs-grid">
    <tr><th>Year</th><td class="spec-val">2022</td></tr>
    <tr><th>Entry</th><td class="spec-val">Side Entry</td></tr>
    <tr><th>Ramp</th><td class="spec-val">PowerFold Ramp</td></tr>
    <tr><th>VIN</th><td class="spec-val">2C4RC1GG2NR543210</td></tr>
  </table>
</div>`,
  },
]

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
    ollamaError: string
    meta?: OllamaMeta
    durationMs: number
    error?: string
  } | null>(null)

  function fill(i: number) {
    const s = REMAP_SAMPLES[i]
    if (!s) return
    if (sourceRef.current)    sourceRef.current.value    = s.sourceName
    if (selectorsRef.current) selectorsRef.current.value = s.selectors
    if (htmlRef.current)      htmlRef.current.value      = s.html
  }
  function fillRandom() {
    fill(Math.floor(Math.random() * REMAP_SAMPLES.length))
  }

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
            ollamaError?: string
            _meta?: OllamaMeta
          }
        }
        const data = body.data
        setResult({
          mappings: data?.mappings ?? [],
          confidence: data?.confidence ?? 0,
          notes: data?.notes ?? '',
          rawText: data?.rawText ?? '',
          ollamaError: data?.ollamaError ?? '',
          ...(data?._meta !== undefined ? { meta: data._meta } : {}),
          durationMs: Date.now() - t,
          ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
        })
      } catch (e) {
        setResult({ mappings: [], confidence: 0, notes: '', rawText: '', ollamaError: '', durationMs: Date.now() - t, error: String(e) })
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
          <p style={colHead}>Sample data</p>
          <SampleButtons
            labels={REMAP_SAMPLES.map(s => s.label)}
            onSelect={fill}
            onRandom={fillRandom}
            disabled={pending}
          />
        </div>
        <div>
          <p style={{ ...colHead, marginBottom: '0.375rem' }}>Source name</p>
          <input
            ref={sourceRef}
            type="text"
            className={styles.input}
            defaultValue={REMAP_SAMPLES[0]?.sourceName ?? ''}
            disabled={pending}
            style={{ width: '100%', boxSizing: 'border-box' }}
            aria-label="Source name"
          />
        </div>
        <div>
          <p style={{ ...colHead, marginBottom: '0.375rem' }}>Previous selectors (JSON array)</p>
          <textarea
            ref={selectorsRef}
            rows={8}
            defaultValue={REMAP_SAMPLES[0]?.selectors ?? ''}
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
          <p style={{ ...colHead, marginBottom: '0.375rem' }}>Updated HTML</p>
          <textarea
            ref={htmlRef}
            rows={8}
            defaultValue={REMAP_SAMPLES[0]?.html ?? ''}
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
            {result.ollamaError ? (
              <OllamaErrorMsg error={result.ollamaError} model={result.meta?.model} />
            ) : result.mappings.length === 0 ? (
              <p className={styles.muted} style={{ fontSize: '0.875rem' }}>
                {result.rawText
                  ? 'No mappings returned — model responded but returned no recognisable JSON.'
                  : 'No response from Ollama — check it is running and the model is pulled.'}
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

// ── Agents test ───────────────────────────────────────────────────────────────

const AGENTS_SAMPLES = [
  {
    label: 'New filter',
    text: 'Add a new filter for wheelchair capacity (number of wheelchairs the vehicle can carry) to the listings search page.',
  },
  {
    label: 'Saved searches',
    text: 'Add a saved search feature so users can bookmark a set of filters and get an email notification when new matching listings are added.',
  },
  {
    label: 'Dealer contact form',
    text: 'Add a "Contact dealer" form to each listing page that captures the user\'s name, email, and a message, then emails the relevant dealer and stores the inquiry in the database.',
  },
  {
    label: 'Price history chart',
    text: 'Add a price history chart to the listing detail page showing how the asking price has changed over time, pulling data from a new price_history table.',
  },
]

export function AgentsTestPanel() {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{
    response: string
    ollamaError: string
    meta?: OllamaMeta
    durationMs: number
    error?: string
  } | null>(null)

  function fill(i: number) {
    const s = AGENTS_SAMPLES[i]
    if (ref.current && s) ref.current.value = s.text
  }
  function fillRandom() {
    fill(Math.floor(Math.random() * AGENTS_SAMPLES.length))
  }

  function run() {
    const task = ref.current?.value.trim() ?? ''
    if (!task) return
    setResult(null)
    start(async () => {
      const t = Date.now()
      try {
        const res = await fetch('/api/ai-test/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task }),
        })
        const body = await res.json() as { data?: { response?: string; ollamaError?: string; _meta?: OllamaMeta } }
        const data = body.data
        setResult({
          response: data?.response ?? '',
          ollamaError: data?.ollamaError ?? '',
          ...(data?._meta !== undefined ? { meta: data._meta } : {}),
          durationMs: Date.now() - t,
          ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
        })
      } catch (e) {
        setResult({ response: '', ollamaError: '', durationMs: Date.now() - t, error: String(e) })
      }
    })
  }

  return (
    <div style={panelGrid}>
      {/* Left: input */}
      <div>
        <p style={colHead}>Task description</p>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: 'var(--clr-text-muted)' }}>
          Describe a feature or change for WAV Search. The planner agent will respond with an
          implementation plan — a good smoke test for the agents model.
        </p>
        <SampleButtons
          labels={AGENTS_SAMPLES.map(s => s.label)}
          onSelect={fill}
          onRandom={fillRandom}
          disabled={pending}
        />
        <textarea
          ref={ref}
          rows={6}
          defaultValue={AGENTS_SAMPLES[0]?.text ?? ''}
          disabled={pending}
          aria-label="Task description"
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
          {pending ? 'Planning…' : 'Run test'}
        </button>
      </div>

      {/* Right: results */}
      <div>
        <p style={colHead}>Planner response</p>
        {!result && !pending && (
          <p className={styles.muted} style={{ fontSize: '0.875rem' }}>Results will appear here.</p>
        )}
        {result?.error && <p className={styles.errorMsg}>{result.error}</p>}
        {result && (
          <>
            {result.ollamaError ? (
              <OllamaErrorMsg error={result.ollamaError} model={result.meta?.model} />
            ) : result.response ? (
              <pre style={{
                margin: 0,
                padding: '0.75rem',
                border: '1px solid var(--clr-border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--clr-surface)',
                fontSize: '0.8125rem',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                maxHeight: '24rem',
                overflowY: 'auto',
              }}>
                {result.response}
              </pre>
            ) : (
              <p className={styles.muted} style={{ fontSize: '0.875rem' }}>
                No response from Ollama — check it is running and the model is pulled.
              </p>
            )}
            <MetaTable meta={result.meta} durationMs={result.durationMs} />
          </>
        )}
      </div>
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
