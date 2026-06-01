import styles from './page.module.css'

export default function ListingLoading() {
  return (
    <main id="main-content" className={styles.page} aria-busy="true" aria-label="Loading listing">
      <div style={{ height: '1.5rem', width: '8rem', background: 'var(--clr-border)', borderRadius: 4, marginBottom: '0.75rem' }} />
      <div style={{ background: 'var(--clr-surface)', borderRadius: '1.25rem', overflow: 'hidden', marginBottom: '0.5rem' }}>
        <div style={{ height: 220, background: 'var(--clr-border)' }} />
        <div style={{ padding: '0.75rem 0.875rem 1rem' }}>
          <div style={{ height: '1.125rem', width: '70%', background: 'var(--clr-border)', borderRadius: 4, marginBottom: '0.5rem' }} />
          <div style={{ height: '1.5rem', width: '40%', background: 'var(--clr-border)', borderRadius: 4 }} />
        </div>
      </div>
    </main>
  )
}
