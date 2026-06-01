'use client'

import { Heart } from 'lucide-react'
import { PhotoGallery } from '@/components/PhotoGallery'
import styles from './page.module.css'

interface HeroGalleryProps {
  images: string[]
  alt: string
}

export function HeroGallery({ images, alt }: HeroGalleryProps) {
  return (
    <PhotoGallery
      images={images}
      alt={alt}
      className={styles.heroGallery}
      viewportClassName={styles.heroPhotoArea}
      dotsClassName={styles.heroPhotoDots}
      topOverlay={
        <div className={styles.heroActions}>
          <button className={styles.heroActionBtn} aria-label="Save listing" type="button">
            <Heart size={14} aria-hidden />
          </button>
        </div>
      }
    />
  )
}
