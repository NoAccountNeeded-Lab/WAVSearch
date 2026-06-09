import {
  ArrowDownFromLine,
  ArrowUpDown,
  Armchair,
  MoveDown,
  Settings2,
  Users,
} from 'lucide-react'
import { WavFeatureItem } from '@/components/listing/WavFeatureItem'
import { WavConversionInfo } from '@/components/listing/WavConversionInfo'
import { rampLabel } from './utils'
import type { ListingDetail } from './types'
import styles from './tabs.module.css'

interface WavTabProps {
  listing: ListingDetail
}

export function WavTab({ listing }: WavTabProps) {
  const ramp =
    listing.rampType !== 'none' && listing.rampType !== 'unknown'
      ? rampLabel(listing.rampType)
      : null

  return (
    <div className={styles.tabContent}>
      <WavConversionInfo
        conversionType={listing.conversionType}
        conversionManufacturer={listing.conversionManufacturer}
      />

      <div className={styles.wavGrid} role="list" aria-label="WAV accessibility features">
        <WavFeatureItem
          icon={<MoveDown size={16} aria-hidden />}
          label="Floor lowering"
          value={listing.floorLoweringInches !== null ? `${listing.floorLoweringInches} inches` : null}
        />
        <WavFeatureItem
          icon={<ArrowDownFromLine size={16} aria-hidden />}
          label="Ramp type"
          value={ramp}
        />
        <WavFeatureItem
          icon={<Users size={16} aria-hidden />}
          label="WC capacity"
          value={
            listing.wheelchairCapacity
              ? `${listing.wheelchairCapacity} chair${listing.wheelchairCapacity > 1 ? 's' : ''}`
              : null
          }
        />
        <WavFeatureItem
          icon={<Armchair size={16} aria-hidden />}
          label="Transfer seat"
          value={listing.transferSeat ? 'Included' : null}
        />
        <WavFeatureItem
          icon={<Settings2 size={16} aria-hidden />}
          label="Hand controls"
          value={listing.handControls ? 'Included' : null}
        />
        <WavFeatureItem
          icon={<ArrowUpDown size={16} aria-hidden />}
          label="Lift"
          value={listing.hasLift ? 'Included' : null}
        />
      </div>
    </div>
  )
}
