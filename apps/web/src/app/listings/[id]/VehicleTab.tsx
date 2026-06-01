import { MileageGauge } from '@/components/listing/MileageGauge'
import type { ListingDetail } from './types'
import styles from './tabs.module.css'

interface VehicleTabProps {
  listing: ListingDetail
}

export function VehicleTab({ listing }: VehicleTabProps) {
  return (
    <div className={styles.tabContent}>
      {listing.mileage !== null && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Mileage &amp; lifespan</div>
          <MileageGauge mileage={listing.mileage} make={listing.make} />
        </div>
      )}

      {/* Specs table */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Specifications</div>
        <dl className={styles.specList}>
          {listing.transmission && <SpecRow label="Transmission" value={listing.transmission} />}
          {listing.fuelType && <SpecRow label="Fuel type" value={listing.fuelType} />}
          {listing.color && <SpecRow label="Exterior color" value={listing.color} />}
          {listing.condition && <SpecRow label="Condition" value={listing.condition.replace(/_/g, ' ')} />}
          {listing.vin && <SpecRow label="VIN" value={listing.vin} mono />}
        </dl>
      </div>
    </div>
  )
}

function SpecRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.specRow}>
      <dt className={styles.specLabel}>{label}</dt>
      <dd className={mono ? styles.specValueMono : styles.specValue}>{value}</dd>
    </div>
  )
}
