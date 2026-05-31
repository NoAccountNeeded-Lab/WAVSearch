'use client'

import { Heart, Share2 } from 'lucide-react'
import { PhotoGallery } from '@/components/PhotoGallery'
import styles from './page.module.css'

interface HeroGalleryProps {
  images: string[]
  alt: string
  conditionLabel: string
  daysListed: number
}

export function HeroGallery({ images, alt, conditionLabel, daysListed }: HeroGalleryProps) {
  return (
    <PhotoGallery
      images={images}
      alt={alt}
      className={styles.heroGallery}
      viewportClassName={styles.heroPhotoArea}
      dotsClassName={styles.heroPhotoDots}
      topOverlay={
        <div className={styles.heroOverlayTop}>
          <div className={styles.heroPills}>
            <span className={styles.conditionPill}>{conditionLabel}</span>
            <span className={styles.daysPill}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              {daysListed === 0 ? 'Listed today' : `${daysListed} day${daysListed === 1 ? '' : 's'} listed`}
            </span>
          </div>
          <div className={styles.heroActions}>
            <button className={styles.heroActionBtn} aria-label="Save listing" type="button">
              <Heart size={14} aria-hidden />
            </button>
            <button className={styles.heroActionBtn} aria-label="Share listing" type="button">
              <Share2 size={14} aria-hidden />
            </button>
          </div>
        </div>
      }
    />
  )
}
