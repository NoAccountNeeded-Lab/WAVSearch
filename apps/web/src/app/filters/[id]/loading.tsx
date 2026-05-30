const s = {
  page: { maxWidth: 800, margin: '0 auto', padding: '1rem', fontFamily: 'system-ui, sans-serif' } as React.CSSProperties,
  back: { display: 'inline-block', marginBottom: '1rem', width: 80, height: 14, borderRadius: 4, background: 'var(--clr-border, #e5e7eb)' } as React.CSSProperties,
  gallery: { width: '100%', aspectRatio: '16/9', borderRadius: 8, background: 'var(--clr-border, #e5e7eb)', marginBottom: '1rem' } as React.CSSProperties,
  title: { width: '60%', height: 28, borderRadius: 4, background: 'var(--clr-border, #e5e7eb)', margin: '0 0 0.5rem' } as React.CSSProperties,
  price: { width: 120, height: 36, borderRadius: 4, background: 'var(--clr-border, #e5e7eb)', margin: '0.5rem 0' } as React.CSSProperties,
  badges: { display: 'flex', gap: '0.5rem', margin: '0.75rem 0 1.25rem' } as React.CSSProperties,
  badge: { width: 80, height: 24, borderRadius: 999, background: 'var(--clr-border, #e5e7eb)' } as React.CSSProperties,
  section: { borderTop: '1px solid var(--clr-border, #e5e7eb)', paddingTop: '1rem', marginTop: '1rem' } as React.CSSProperties,
  sectionTitle: { width: 120, height: 18, borderRadius: 4, background: 'var(--clr-border, #e5e7eb)', marginBottom: '0.75rem' } as React.CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.625rem 1rem' } as React.CSSProperties,
  fieldLabel: { width: 60, height: 10, borderRadius: 3, background: 'var(--clr-border, #e5e7eb)', marginBottom: 4 } as React.CSSProperties,
  fieldValue: { width: 90, height: 14, borderRadius: 3, background: 'var(--clr-border, #e5e7eb)' } as React.CSSProperties,
  cta: { display: 'block', width: '100%', height: 48, borderRadius: 8, background: 'var(--clr-border, #e5e7eb)', marginTop: '1.5rem', boxSizing: 'border-box' as const } as React.CSSProperties,
  meta: { width: 140, height: 12, borderRadius: 3, background: 'var(--clr-border, #e5e7eb)', marginTop: '1.5rem' } as React.CSSProperties,
}

function FieldSkeleton() {
  return (
    <div>
      <div style={s.fieldLabel} />
      <div style={s.fieldValue} />
    </div>
  )
}

function SectionSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <section style={s.section}>
      <div style={s.sectionTitle} />
      <div style={s.grid}>
        {Array.from({ length: fields }).map((_, i) => <FieldSkeleton key={i} />)}
      </div>
    </section>
  )
}

export default function ListingDetailLoading() {
  return (
    <main style={s.page}>
      <div style={s.back} />
      <div style={s.gallery} />
      <div style={s.title} />
      <div style={s.price} />
      <div style={s.badges}>
        {[80, 100, 70].map((w, i) => <div key={i} style={{ ...s.badge, width: w }} />)}
      </div>
      <SectionSkeleton fields={5} />
      <SectionSkeleton fields={4} />
      <SectionSkeleton fields={3} />
      <div style={s.cta} />
      <div style={s.meta} />
    </main>
  )
}
