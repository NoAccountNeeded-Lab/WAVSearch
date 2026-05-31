'use client'

import { type ReactNode, useCallback, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'
import styles from './PhotoGallery.module.css'

interface PhotoGalleryProps {
  images: string[]
  alt: string
  className?: string | undefined
  viewportClassName?: string | undefined
  imageClassName?: string | undefined
  placeholderLabel?: string | undefined
  topOverlay?: ReactNode
  bottomOverlay?: ReactNode
}

export function PhotoGallery({
  images,
  alt,
  className,
  viewportClassName,
  imageClassName,
  placeholderLabel = 'No photo available',
  topOverlay,
  bottomOverlay,
}: PhotoGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const imageCount = images.length
  const hasMultipleImages = imageCount > 1

  const goTo = useCallback(
    (index: number) => {
      if (imageCount === 0) return
      setActiveIndex((index + imageCount) % imageCount)
    },
    [imageCount],
  )

  const goToPrevious = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo])
  const goToNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo])

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null
  }

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!hasMultipleImages || touchStartX.current === null) return

    const touchEndX = event.changedTouches[0]?.clientX
    if (touchEndX === undefined) return

    const deltaX = touchEndX - touchStartX.current
    touchStartX.current = null

    if (Math.abs(deltaX) < 40) return
    if (deltaX < 0) goToNext()
    else goToPrevious()
  }

  return (
    <section
      className={[styles.gallery, className].filter(Boolean).join(' ')}
      aria-roledescription="carousel"
      aria-label={`${alt} photos`}
    >
      <div
        className={[styles.viewport, viewportClassName].filter(Boolean).join(' ')}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {imageCount > 0 ? (
          <div className={styles.track} style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
            {images.map((src, index) => (
              <div
                key={`${src}-${index}`}
                className={styles.slide}
                aria-hidden={index !== activeIndex}
              >
                <img
                  src={src}
                  alt={index === activeIndex ? alt : ''}
                  className={[styles.image, imageClassName].filter(Boolean).join(' ')}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  draggable={false}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.placeholder} role="img" aria-label={placeholderLabel}>
            <div className={styles.placeholderInner}>
              <ImageOff size={48} strokeWidth={1.5} aria-hidden />
              <span>{placeholderLabel}</span>
            </div>
          </div>
        )}

        {topOverlay && <div className={styles.overlayTop}>{topOverlay}</div>}
        {bottomOverlay && <div className={styles.overlayBottom}>{bottomOverlay}</div>}

        {hasMultipleImages && (
          <>
            <button
              className={`${styles.arrow} ${styles.arrowPrev}`}
              type="button"
              aria-label="Previous photo"
              onClick={goToPrevious}
            >
              <ChevronLeft size={22} aria-hidden />
            </button>
            <button
              className={`${styles.arrow} ${styles.arrowNext}`}
              type="button"
              aria-label="Next photo"
              onClick={goToNext}
            >
              <ChevronRight size={22} aria-hidden />
            </button>
          </>
        )}
      </div>

      {hasMultipleImages && (
        <div className={styles.dots} aria-label="Photo navigation">
          {images.map((_, index) => (
            <button
              key={index}
              type="button"
              className={`${styles.dot} ${index === activeIndex ? styles.dotActive : ''}`}
              aria-label={`Photo ${index + 1} of ${imageCount}`}
              aria-current={index === activeIndex ? 'true' : undefined}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
