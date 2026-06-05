'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageOff, Maximize2, X } from 'lucide-react'
import styles from './PhotoGallery.module.css'

interface PhotoGalleryProps {
  images: string[]
  alt: string
  className?: string | undefined
  viewportClassName?: string | undefined
  imageClassName?: string | undefined
  dotsClassName?: string | undefined
  placeholderLabel?: string | undefined
  showExpand?: boolean | undefined
  topOverlay?: ReactNode
  bottomOverlay?: ReactNode
}

interface SwipePoint {
  x: number
  y: number
}

interface UseSwipeHandlersOptions {
  /** Minimum horizontal delta (px) to trigger left/right navigation. Default 40. */
  horizontalThreshold?: number
  /** Minimum vertical delta (px) to trigger the dismiss callback. Default 80. */
  verticalThreshold?: number
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeDown?: () => void
}

function useSwipeHandlers({
  horizontalThreshold = 40,
  verticalThreshold = 80,
  onSwipeLeft,
  onSwipeRight,
  onSwipeDown,
}: UseSwipeHandlersOptions) {
  const startPoint = useRef<SwipePoint | null>(null)

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0]
    if (!touch) return
    startPoint.current = { x: touch.clientX, y: touch.clientY }
  }, [])

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!startPoint.current) return

      const touch = event.changedTouches[0]
      if (!touch) return

      const deltaX = touch.clientX - startPoint.current.x
      const deltaY = touch.clientY - startPoint.current.y
      startPoint.current = null

      const absX = Math.abs(deltaX)
      const absY = Math.abs(deltaY)

      // Horizontal swipe dominates — prevent vertical scroll interference
      if (absX >= horizontalThreshold && absX > absY) {
        if (deltaX < 0 && onSwipeLeft) onSwipeLeft()
        else if (deltaX > 0 && onSwipeRight) onSwipeRight()
        return
      }

      // Downward swipe (dismiss), only when not primarily horizontal
      if (deltaY >= verticalThreshold && absY > absX && onSwipeDown) {
        onSwipeDown()
      }
    },
    [horizontalThreshold, verticalThreshold, onSwipeLeft, onSwipeRight, onSwipeDown],
  )

  return { handleTouchStart, handleTouchEnd }
}

export function PhotoGallery({
  images,
  alt,
  className,
  viewportClassName,
  imageClassName,
  dotsClassName,
  placeholderLabel = 'No photo available',
  showExpand = true,
  topOverlay,
  bottomOverlay,
}: PhotoGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)
  const expandedCloseRef = useRef<HTMLButtonElement | null>(null)
  const imageCount = images.length
  const hasMultipleImages = imageCount > 1
  const hasImages = imageCount > 0
  const visibleDotIndices = getVisibleDotIndices(activeIndex, imageCount)

  const goTo = useCallback(
    (index: number) => {
      if (imageCount === 0) return
      setActiveIndex((index + imageCount) % imageCount)
    },
    [imageCount],
  )

  const goToPrevious = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo])
  const goToNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo])

  const closeExpanded = useCallback(() => setIsExpanded(false), [])

  useEffect(() => {
    if (!isExpanded) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    expandedCloseRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeExpanded()
      if (event.key === 'ArrowLeft' && hasMultipleImages) goToPrevious()
      if (event.key === 'ArrowRight' && hasMultipleImages) goToNext()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeExpanded, goToNext, goToPrevious, hasMultipleImages, isExpanded])

  // Inline gallery swipe — horizontal only, 40 px threshold
  const { handleTouchStart: handleViewportTouchStart, handleTouchEnd: handleViewportTouchEnd } =
    useSwipeHandlers({
      horizontalThreshold: 40,
      ...(hasMultipleImages && { onSwipeLeft: goToNext, onSwipeRight: goToPrevious }),
    })

  // Lightbox swipe — horizontal navigate + downward dismiss, 80 px vertical threshold
  const { handleTouchStart: handleLightboxTouchStart, handleTouchEnd: handleLightboxTouchEnd } =
    useSwipeHandlers({
      horizontalThreshold: 40,
      verticalThreshold: 80,
      ...(hasMultipleImages && { onSwipeLeft: goToNext, onSwipeRight: goToPrevious }),
      onSwipeDown: closeExpanded,
    })

  const handleViewportClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!hasMultipleImages) return
    if ((event.target as HTMLElement).closest('button')) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const clickX = event.clientX - bounds.left
    if (clickX < bounds.width / 2) goToPrevious()
    else goToNext()
  }

  return (
    <section
      className={[styles.gallery, className].filter(Boolean).join(' ')}
      aria-roledescription="carousel"
      aria-label={`${alt} photos`}
    >
      <div
        className={[styles.viewport, viewportClassName].filter(Boolean).join(' ')}
        onClick={handleViewportClick}
        onTouchStart={handleViewportTouchStart}
        onTouchEnd={handleViewportTouchEnd}
      >
        {hasImages ? (
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

        {hasImages && showExpand && (
          <button
            className={styles.expandButton}
            type="button"
            aria-label="Expand photo gallery"
            onClick={() => setIsExpanded(true)}
          >
            <Maximize2 size={18} aria-hidden />
          </button>
        )}

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
        <div className={[styles.dots, dotsClassName].filter(Boolean).join(' ')} aria-label="Photo navigation">
          {visibleDotIndices.map((index) => (
            <button
              key={index}
              type="button"
              className={`${styles.dot} ${index === activeIndex ? styles.dotActive : ''}`}
              data-distance={Math.min(Math.abs(index - activeIndex), 3)}
              aria-label={`Photo ${index + 1} of ${imageCount}`}
              aria-current={index === activeIndex ? 'true' : undefined}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      )}

      {isExpanded && hasImages && (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} expanded photos`}
          onTouchStart={handleLightboxTouchStart}
          onTouchEnd={handleLightboxTouchEnd}
        >
          <button
            ref={expandedCloseRef}
            className={`${styles.lightboxButton} ${styles.lightboxClose}`}
            type="button"
            aria-label="Close expanded photo gallery"
            onClick={closeExpanded}
          >
            <X size={24} aria-hidden />
          </button>

          {hasMultipleImages && (
            <button
              className={`${styles.lightboxButton} ${styles.lightboxPrev}`}
              type="button"
              aria-label="Previous photo"
              onClick={goToPrevious}
            >
              <ChevronLeft size={30} aria-hidden />
            </button>
          )}

          <div className={styles.lightboxStage}>
            <img
              src={images[activeIndex]}
              alt={alt}
              className={styles.lightboxImage}
              draggable={false}
            />
            <div className={styles.lightboxCount}>
              Photo {activeIndex + 1} of {imageCount}
            </div>
          </div>

          {hasMultipleImages && (
            <button
              className={`${styles.lightboxButton} ${styles.lightboxNext}`}
              type="button"
              aria-label="Next photo"
              onClick={goToNext}
            >
              <ChevronRight size={30} aria-hidden />
            </button>
          )}

          {hasMultipleImages && (
            <div className={styles.lightboxDots} aria-label="Expanded photo navigation">
              {images.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  className={`${styles.lightboxDot} ${index === activeIndex ? styles.lightboxDotActive : ''}`}
                  aria-label={`Photo ${index + 1} of ${imageCount}`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                  onClick={() => goTo(index)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function getVisibleDotIndices(activeIndex: number, imageCount: number): number[] {
  const maxVisible = 7
  if (imageCount <= maxVisible) return Array.from({ length: imageCount }, (_, index) => index)

  const halfWindow = Math.floor(maxVisible / 2)
  const start = Math.min(Math.max(activeIndex - halfWindow, 0), imageCount - maxVisible)
  return Array.from({ length: maxVisible }, (_, offset) => start + offset)
}
