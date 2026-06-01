import { DoorOpen, Truck } from 'lucide-react'
import { abbreviate } from '@/app/listings/[id]/utils'
import styles from './WavConversionInfo.module.css'

interface WavConversionInfoProps {
  conversionType: string
  conversionManufacturer?: string | null
}

export function WavConversionInfo({ conversionType, conversionManufacturer }: WavConversionInfoProps) {
  const isSide = conversionType === 'side_entry'
  const isRear = conversionType === 'rear_entry'
  const hasType = isSide || isRear

  return (
    <>
      {hasType && (
        <div className={styles.entryBanner}>
          <span className={styles.entryIcon} aria-hidden>
            {isSide ? <DoorOpen size={22} /> : <Truck size={22} />}
          </span>
          <div>
            <div className={styles.entryLabel}>
              {isSide ? 'Side-entry conversion' : 'Rear-entry conversion'}
            </div>
            <div className={styles.entrySub}>
              {isSide ? 'Driver or passenger side access' : 'Rear ramp or lift access'}
            </div>
          </div>
        </div>
      )}

      {conversionManufacturer && (
        <div className={styles.convRow}>
          <div className={styles.convLogo} aria-hidden>
            {abbreviate(conversionManufacturer)}
          </div>
          <div>
            <div className={styles.convName}>{conversionManufacturer}</div>
            <div className={styles.convSub}>WAV conversion manufacturer</div>
          </div>
        </div>
      )}
    </>
  )
}
