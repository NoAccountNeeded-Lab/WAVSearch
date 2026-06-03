import { IntakeForm } from '../components/IntakeForm'
import styles from './page.module.css'

export default function HomePage() {
  return (
    <>
      <header className={styles.siteHeader}>
        <div className={styles.headerInner}>
          <a href="/" className={styles.logo} aria-label="WAV Search — home">
            <span className={styles.logoAccent}>WAV</span> Search
          </a>
          <p className={styles.headerTagline}>Wheelchair Accessible Vehicles</p>
        </div>
      </header>

      <main id="main-content" className={styles.main}>
        <div className={styles.container}>

          <section className={styles.heroSection} aria-labelledby="hero-heading">
            <h1 id="hero-heading" className={styles.heroHeading}>
              Find the right wheelchair accessible vehicle
            </h1>
            <p className={styles.heroLead}>
              Describe what you need in plain language — we&apos;ll set the filters for you. Or skip
              straight to the search.
            </p>

            <div className={styles.intakeCard}>
              <IntakeForm />
            </div>
          </section>

        </div>
      </main>
    </>
  )
}
