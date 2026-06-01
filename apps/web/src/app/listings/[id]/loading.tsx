import styles from './loading.module.css'

export default function ListingLoading() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading listing">
      <div className={styles.shimmer} />
    </div>
  )
}
