'use client'

import { useState } from 'react'

interface ImageGalleryProps {
  images: string[]
  alt: string
}

export function ImageGallery({ images, alt }: ImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  if (images.length === 0) {
    return (
      <div style={styles.placeholder}>No photo available</div>
    )
  }

  return (
    <div>
      <img
        src={images[activeIndex]}
        alt={alt}
        style={styles.hero}
      />
      {images.length > 1 && (
        <div style={styles.strip}>
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              style={{
                ...styles.thumbButton,
                ...(i === activeIndex ? styles.thumbActive : {}),
              }}
              aria-label={`Photo ${i + 1}`}
              aria-pressed={i === activeIndex}
            >
              <img src={src} alt="" style={styles.thumb} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const styles = {
  hero: {
    width: '100%',
    aspectRatio: '16/9',
    objectFit: 'cover' as const,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    display: 'block',
  } as React.CSSProperties,
  placeholder: {
    width: '100%',
    aspectRatio: '16/9',
    borderRadius: 8,
    marginBottom: '1rem',
    backgroundColor: '#f0f0f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#999',
    fontSize: '0.875rem',
  } as React.CSSProperties,
  strip: {
    display: 'flex',
    gap: '0.5rem',
    overflowX: 'auto' as const,
    paddingTop: '0.5rem',
    paddingBottom: '0.5rem',
    marginBottom: '0.5rem',
    scrollbarWidth: 'thin' as const,
  } as React.CSSProperties,
  thumbButton: {
    flexShrink: 0,
    width: 72,
    height: 54,
    padding: 0,
    border: '2px solid transparent',
    borderRadius: 6,
    cursor: 'pointer',
    background: 'none',
    overflow: 'hidden',
  } as React.CSSProperties,
  thumbActive: {
    borderColor: '#0066CC',
  } as React.CSSProperties,
  thumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
  } as React.CSSProperties,
}
