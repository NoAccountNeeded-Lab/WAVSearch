const s = {
  page: { maxWidth: '50rem', margin: '0 auto', padding: '1rem 1rem 4rem', fontFamily: 'system-ui, sans-serif' } as React.CSSProperties,
  back: { display: 'inline-block', marginBottom: '0.75rem', width: 100, height: 14, borderRadius: 4, background: 'var(--clr-border, #e5e7eb)' } as React.CSSProperties,
  gallery: { width: 'calc(100% + 2rem)', marginLeft: '-1rem', aspectRatio: '16/9', background: 'var(--clr-border, #e5e7eb)' } as React.CSSProperties,
  titleWrap: { paddingTop: '1rem' } as React.CSSProperties,
  title: { width: '65%', height: 22, borderRadius: 4, background: 'var(--clr-border, #e5e7eb)', marginBottom: '0.5rem' } as React.CSSProperties,
  price: { width: 120, height: 40, borderRadius: 4, background: 'var(--clr-border, #e5e7eb)', marginBottom: '0.375rem' } as React.CSSProperties,
  location: { width: 140, height: 14, borderRadius: 4, background: 'var(--clr-border, #e5e7eb)' } as React.CSSProperties,
  statsStrip: { display: 'flex', margin: '1rem 0', border: '1px solid var(--clr-border, #e5e7eb)', borderRadius: 8, background: 'var(--clr-surface, #f9fafb)', overflow: 'hidden' } as React.CSSProperties,
  statCell: { flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '0.625rem 0.375rem', borderRight: '1px solid var(--clr-border, #e5e7eb)', gap: '0.3rem' } as React.CSSProperties,
  statValue: { width: 48, height: 16, borderRadius: 3, background: 'var(--clr-border, #e5e7eb)' } as React.CSSProperties,
  statLabel: { width: 32, height: 8, borderRadius: 3, background: 'var(--clr-border, #e5e7eb)' } as React.CSSProperties,
  section: { borderTop: '1px solid var(--clr-border, #e5e7eb)', paddingTop: '1rem', marginTop: '1rem' } as React.CSSProperties,
  sectionLabel: { width: 100, height: 10, borderRadius: 3, background: 'var(--clr-border, #e5e7eb)', marginBottom: '0.75rem' } as React.CSSProperties,
  wavRow: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' } as React.CSSProperties,
  wavChip: { width: 140, height: 52, borderRadius: 8, background: 'var(--clr-border, #e5e7eb)' } as React.CSSProperties,
  specGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem 1rem' } as React.CSSProperties,
  specLabel: { width: 60, height: 9, borderRadius: 3, background: 'var(--clr-border, #e5e7eb)', marginBottom: 4 } as React.CSSProperties,
  specValue: { width: 90, height: 14, borderRadius: 3, background: 'var(--clr-border, #e5e7eb)' } as React.CSSProperties,
  sellerRow: { display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.625rem' } as React.CSSProperties,
  sellerIcon: { width: 16, height: 16, borderRadius: 4, background: 'var(--clr-border, #e5e7eb)', flexShrink: 0 } as React.CSSProperties,
  sellerText: { height: 14, borderRadius: 3, background: 'var(--clr-border, #e5e7eb)' } as React.CSSProperties,
  cta: { display: 'block', width: '100%', height: 52, borderRadius: 8, background: 'var(--clr-border, #e5e7eb)', marginTop: '1.5rem', boxSizing: 'border-box' as const } as React.CSSProperties,
  meta: { width: 140, height: 11, borderRadius: 3, background: 'var(--clr-border, #e5e7eb)', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--clr-border, #e5e7eb)' } as React.CSSProperties,
}

export default function ListingDetailLoading() {
  return (
    <main style={s.page}>
      <div style={s.back} />

      <div style={s.gallery} />

      <div style={s.titleWrap}>
        <div style={s.title} />
        <div style={s.price} />
        <div style={s.location} />
      </div>

      {/* Stats strip */}
      <div style={s.statsStrip}>
        {[48, 56, 64, 40].map((w, i) => (
          <div key={i} style={{ ...s.statCell, ...(i === 3 ? { borderRight: 'none' } : {}) }}>
            <div style={{ ...s.statValue, width: w }} />
            <div style={s.statLabel} />
          </div>
        ))}
      </div>

      {/* WAV features */}
      <div style={s.section}>
        <div style={s.sectionLabel} />
        <div style={s.wavRow}>
          {[160, 130, 110, 120, 140].map((w, i) => (
            <div key={i} style={{ ...s.wavChip, width: w }} />
          ))}
        </div>
      </div>

      {/* Vehicle specs */}
      <div style={s.section}>
        <div style={s.sectionLabel} />
        <div style={s.specGrid}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div style={s.specLabel} />
              <div style={s.specValue} />
            </div>
          ))}
        </div>
      </div>

      {/* Seller */}
      <div style={s.section}>
        <div style={s.sectionLabel} />
        {[160, 140, 120, 180].map((w, i) => (
          <div key={i} style={s.sellerRow}>
            <div style={s.sellerIcon} />
            <div style={{ ...s.sellerText, width: w }} />
          </div>
        ))}
      </div>

      <div style={s.cta} />
      <div style={s.meta} />
    </main>
  )
}
