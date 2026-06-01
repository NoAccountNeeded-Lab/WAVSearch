import { AlertTriangle, Check } from 'lucide-react'
import { formatDate } from '@/app/listings/[id]/utils'
import type { Recall, SafetyData } from '@/app/listings/[id]/types'
import styles from './RecallsList.module.css'

interface RecallsListProps {
  vin: string | null
  safety: SafetyData | null
}

export function RecallsList({ vin, safety }: RecallsListProps) {
  const openRecalls = (safety?.recalls ?? []).filter((r) => !r.remedy || r.remedy.trim() === '')

  return (
    <div>
      {vin && (
        <div className={styles.vinRow}>
          <span className={styles.vinKey}>VIN</span>
          <span className={styles.vinVal}>{vin}</span>
        </div>
      )}

      {safety === null || safety.vehicleModel === null ? (
        <p className={styles.placeholder}>
          Safety data not yet available for this vehicle. Check back after the next NHTSA sync.
        </p>
      ) : openRecalls.length === 0 ? (
        <div className={styles.noRecalls}>
          <Check size={14} aria-hidden />
          No open recalls found for {safety.vehicleModel.year} {safety.vehicleModel.make}{' '}
          {safety.vehicleModel.model}
        </div>
      ) : (
        <ul className={styles.list} aria-label="Recall campaigns">
          {safety.recalls.map((recall) => (
            <RecallItem key={recall.id} recall={recall} />
          ))}
        </ul>
      )}
    </div>
  )
}

function RecallItem({ recall }: { recall: Recall }) {
  const isOpen = !recall.remedy || recall.remedy.trim() === ''
  return (
    <li className={styles.item}>
      <div className={isOpen ? styles.iconWarn : styles.iconOk} aria-hidden>
        {isOpen ? <AlertTriangle size={14} /> : <Check size={14} />}
      </div>
      <div>
        <div className={styles.title}>
          NHTSA #{recall.nhtsaCampaignId} · {recall.component}
        </div>
        <div className={styles.sub}>Issued {formatDate(recall.reportedAt)}</div>
        {recall.summary && <div className={styles.sub}>{recall.summary}</div>}
        <span className={isOpen ? styles.statusOpen : styles.statusDone}>
          {isOpen ? 'Remedy open — schedule service' : 'Completed'}
        </span>
      </div>
    </li>
  )
}
