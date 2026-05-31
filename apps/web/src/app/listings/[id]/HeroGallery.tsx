'use client'

import { useState } from 'react'
import { Heart, Share2 } from 'lucide-react'
import styles from './page.module.css'

interface HeroGalleryProps {
  images: string[]
  alt: string
  conditionLabel: string
  daysListed: number
}

export function HeroGallery({ images, alt, conditionLabel, daysListed }: HeroGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  return (
    <div className={styles.heroPhotoArea}>
      {images.length > 0 ? (
        <img
          src={images[activeIndex]}
          alt={alt}
          className={styles.heroPhoto}
        />
      ) : (
        <div className={styles.heroPhotoPlaceholder} aria-label="No photo available">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
      )}

      <div className={styles.heroOverlayTop}>
        <span className={styles.conditionPill}>{conditionLabel}</span>
        <span className={styles.daysPill}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          {daysListed === 0 ? 'Listed today' : `${daysListed} day${daysListed === 1 ? '' : 's'} listed`}
        </span>
      </div>

      <div className={styles.heroOverlayBottom}>
        <div className={styles.photoDots} role="tablist" aria-label="Photo navigation">
          {images.slice(0, 6).map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === activeIndex}
              aria-label={`Photo ${i + 1}`}
              className={i === activeIndex ? styles.photoDotActive : styles.photoDot}
              onClick={() => setActiveIndex(i)}
            />
          ))}
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
    </div>
  )
}
