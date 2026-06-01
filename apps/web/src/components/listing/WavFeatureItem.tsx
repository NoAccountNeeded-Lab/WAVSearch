import styles from './WavFeatureItem.module.css'

interface WavFeatureItemProps {
  icon: React.ReactNode
  label: string
  value: string | null
}

export function WavFeatureItem({ icon, label, value }: WavFeatureItemProps) {
  const included = value !== null
  return (
    <div role="listitem" className={included ? styles.item : styles.itemOff}>
      <div className={included ? styles.icon : styles.iconOff}>{icon}</div>
      <div className={included ? styles.label : styles.labelOff}>{label}</div>
      <div className={included ? styles.value : styles.valueOff}>
        {value ?? 'Not included'}
      </div>
    </div>
  )
}
