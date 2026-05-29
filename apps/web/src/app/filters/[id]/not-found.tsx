import Link from 'next/link'

const s = {
  page: { maxWidth: 800, margin: '0 auto', padding: '1rem', fontFamily: 'system-ui, sans-serif', textAlign: 'center' as const } as React.CSSProperties,
  wrapper: { marginTop: '4rem' } as React.CSSProperties,
  heading: { fontSize: '2rem', fontWeight: 700, margin: '0 0 0.5rem' } as React.CSSProperties,
  sub: { color: '#6b7280', margin: '0 0 2rem' } as React.CSSProperties,
  link: { display: 'inline-block', padding: '0.625rem 1.25rem', background: '#111827', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 500 } as React.CSSProperties,
}

export default function ListingNotFound() {
  return (
    <main style={s.page}>
      <div style={s.wrapper}>
        <h1 style={s.heading}>Listing not found</h1>
        <p style={s.sub}>This listing may have been removed or the link is incorrect.</p>
        <Link href="/filters" style={s.link}>Back to listings</Link>
      </div>
    </main>
  )
}
