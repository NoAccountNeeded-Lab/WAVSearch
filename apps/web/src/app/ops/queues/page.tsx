import Link from 'next/link'
import { getServerApiBaseUrl } from '@/lib/api-url'
import styles from '../ops.module.css'

interface QueueStats {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}

interface QueueRow {
  name: string
  paused: boolean
  stats: QueueStats
}

async function fetchQueues(): Promise<QueueRow[]> {
  const res = await fetch(`${getServerApiBaseUrl()}/admin/queues`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`API returned ${res.status}`)
  const body = (await res.json()) as { data: QueueRow[] }
  return body.data
}

export default async function QueuesPage() {
  let queues: QueueRow[] | null = null
  let errorMsg: string | null = null

  try {
    queues = await fetchQueues()
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : 'Failed to load queues'
  }

  return (
    <main id="main-content" className={styles.main}>
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.heading}>Queues</h1>
          <Link href="/ops" className={styles.backLink}>← Operations</Link>
        </div>

        {errorMsg ? (
          <p className={styles.error}>{errorMsg}</p>
        ) : !queues?.length ? (
          <p className={styles.empty}>No queues found.</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Queue</th>
                  <th>Status</th>
                  <th className={styles.num}>Waiting</th>
                  <th className={styles.num}>Active</th>
                  <th className={styles.num}>Delayed</th>
                  <th className={styles.num}>Completed</th>
                  <th className={styles.num}>Failed</th>
                </tr>
              </thead>
              <tbody>
                {queues.map(q => (
                  <tr key={q.name}>
                    <td>{q.name}</td>
                    <td>
                      <span
                        className={styles.badge}
                        data-variant={q.paused ? 'paused' : q.stats.active > 0 ? 'success' : 'neutral'}
                      >
                        {q.paused ? 'Paused' : q.stats.active > 0 ? 'Active' : 'Idle'}
                      </span>
                    </td>
                    <td className={styles.num}>{q.stats.waiting}</td>
                    <td className={styles.num}>{q.stats.active}</td>
                    <td className={styles.num}>{q.stats.delayed}</td>
                    <td className={styles.num}>{q.stats.completed}</td>
                    <td className={styles.num}>
                      {q.stats.failed > 0
                        ? <span style={{ color: 'var(--clr-danger-text)', fontWeight: 600 }}>{q.stats.failed}</span>
                        : 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
