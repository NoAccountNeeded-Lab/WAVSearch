import Link from 'next/link'
import styles from './page.module.css'

const CARDS = [
  {
    href: '/ops/queues',
    title: 'Queues',
    desc: 'BullMQ job queues — stats, pause/resume, trigger, and recent jobs for each queue.',
  },
  {
    href: '/ops/schedules',
    title: 'Schedules',
    desc: 'Repeatable job schedules stored in BullMQ/Valkey — enable, disable, or edit cron patterns without restarting the scraper.',
  },
  {
    href: '/ops/sources',
    title: 'Sources',
    desc: 'Data sources with scrape status, listing counts, cron schedule, and error messages.',
  },
  {
    href: '/ops/runs',
    title: 'Scraper Runs',
    desc: 'Recent scraper run history with success/failure counts and error messages.',
  },
  {
    href: '/ops/ai',
    title: 'AI',
    desc: 'Ollama status, installed models, and sources flagged for AI-powered selector remapping.',
  },
  {
    href: '/ops/config',
    title: 'AI Config',
    desc: 'Edit AI job provider, model, API key config IDs, and encrypted provider secrets.',
  },
  {
    href: '/status',
    title: 'System Status',
    desc: 'Live health check for all services — API, Postgres, Meilisearch, Valkey, and more.',
  },
]

export default function OpsPage() {
  return (
    <main id="main-content" className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.heading}>Operations</h1>
        <p className={styles.subheading}>Internal tooling and monitoring for WAV Search.</p>
        <nav className={styles.grid} aria-label="Operations areas">
          {CARDS.map(card => (
            <Link key={card.href} href={card.href} className={styles.card}>
              <h2 className={styles.cardTitle}>{card.title}</h2>
              <p className={styles.cardDesc}>{card.desc}</p>
              <span className={styles.cardArrow} aria-hidden="true">Go →</span>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  )
}
