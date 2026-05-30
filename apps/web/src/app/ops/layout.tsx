import Link from 'next/link'
import styles from './layout.module.css'

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className={styles.siteHeader}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.logo} aria-label="WAV Search — go to home">
            <span className={styles.logoAccent}>WAV</span> Search
          </Link>
          <span className={styles.divider} aria-hidden="true">/</span>
          <Link href="/ops" className={styles.sectionLink}>Ops</Link>
        </div>
      </header>
      {children}
    </>
  )
}
