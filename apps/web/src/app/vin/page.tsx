import Link from 'next/link'
import type { Metadata } from 'next'
import { ChevronLeft } from 'lucide-react'
import { VinSearchForm } from './VinSearchForm'
import styles from './page.module.css'

export const metadata: Metadata = {
  title: 'VIN Safety Lookup — WAV Search',
  description: 'Check a VIN for NHTSA recall campaigns, complaint trends, and safety ratings.',
}

export default function VinLookupPage() {
  return (
    <main id="main-content" className={styles.page}>
      <Link href="/filters" className={styles.back}>
        <ChevronLeft size={16} aria-hidden />
        Back to listings
      </Link>

      <header className={styles.header}>
        <p className={styles.eyebrow}>NHTSA Safety Lookup</p>
        <h1 className={styles.title}>Check recalls, complaints, and crash ratings by VIN</h1>
        <p className={styles.lede}>
          Decode a vehicle identification number and see the safety data WAV Search has collected for that vehicle model.
        </p>
        <VinSearchForm />
      </header>

      <section className={styles.section} aria-labelledby="vin-help-heading">
        <h2 className={styles.sectionTitle} id="vin-help-heading">What you will see</h2>
        <div className={styles.notice}>
          <strong>Safety signals before you call the seller.</strong> Reports include NHTSA recall campaigns, complaint patterns by component, and safety ratings when they are available for the decoded year, make, and model.
        </div>
      </section>
    </main>
  )
}
