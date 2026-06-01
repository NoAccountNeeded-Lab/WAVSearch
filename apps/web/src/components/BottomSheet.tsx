'use client'

import { useRef, useState } from 'react'
import styles from './BottomSheet.module.css'

export type SnapPoint = 'peek' | 'mid' | 'full'

// Order: most-open first. Used to cycle on tap.
const SNAP_ORDER: SnapPoint[] = ['full', 'mid', 'peek']

const PEEK_HEIGHT = 72 // px — must match --peek-height in CSS

interface BottomSheetProps {
  children: React.ReactNode
  defaultSnap?: SnapPoint
  /** Controlled mode: pass snap + onSnapChange together */
  snap?: SnapPoint
  onSnapChange?: (snap: SnapPoint) => void
}

function resolveSnap(y: number, velocityY: number, vh: number): SnapPoint {
  const snapYs: Record<SnapPoint, number> = {
    full: vh * 0.08,
    mid: vh * 0.45,
    peek: vh - PEEK_HEIGHT,
  }

  if (velocityY > 0.35) {
    // Fast downward — collapse one step
    if (y < snapYs.mid) return 'mid'
    return 'peek'
  }
  if (velocityY < -0.35) {
    // Fast upward — expand one step
    if (y > snapYs.mid) return 'mid'
    return 'full'
  }

  return (Object.entries(snapYs) as [SnapPoint, number][]).reduce((nearest, [s, sy]) =>
    Math.abs(sy - y) < Math.abs(snapYs[nearest] - y) ? s : nearest,
    'peek' as SnapPoint,
  )
}

function getBackdropOpacity(snap: SnapPoint, dragY: number | null, vh: number): number {
  if (dragY !== null) {
    const min = vh * 0.08
    const max = vh - PEEK_HEIGHT
    return Math.max(0, Math.min(0.5, ((max - dragY) / (max - min)) * 0.5))
  }
  if (snap === 'peek') return 0
  if (snap === 'mid') return 0.3
  return 0.5
}

export function BottomSheet({ children, defaultSnap = 'peek', snap: controlledSnap, onSnapChange }: BottomSheetProps) {
  const [internalSnap, setInternalSnap] = useState<SnapPoint>(defaultSnap)

  const snap = controlledSnap ?? internalSnap
  const setSnap = (s: SnapPoint) => {
    if (controlledSnap === undefined) setInternalSnap(s)
    onSnapChange?.(s)
  }
  const [dragY, setDragY] = useState<number | null>(null)

  const isDragging = useRef(false)
  const startPointerY = useRef(0)
  const startSheetY = useRef(0)
  const dragDistance = useRef(0)
  const lastPointer = useRef<{ y: number; t: number } | null>(null)

  const cycleSnap = () => {
    const i = SNAP_ORDER.indexOf(snap)
    setSnap(SNAP_ORDER[(i - 1 + SNAP_ORDER.length) % SNAP_ORDER.length] ?? snap)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const vh = window.innerHeight
    const currentY = dragY ?? (
      snap === 'peek' ? vh - PEEK_HEIGHT :
      snap === 'mid' ? vh * 0.45 :
      vh * 0.08
    )
    isDragging.current = true
    dragDistance.current = 0
    startPointerY.current = e.clientY
    startSheetY.current = currentY
    lastPointer.current = { y: e.clientY, t: Date.now() }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return
    lastPointer.current = { y: e.clientY, t: Date.now() }
    const vh = window.innerHeight
    const delta = e.clientY - startPointerY.current
    dragDistance.current = Math.abs(delta)
    const newY = Math.max(vh * 0.08, Math.min(vh - PEEK_HEIGHT, startSheetY.current + delta))
    setDragY(newY)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return
    isDragging.current = false

    if (dragDistance.current < 8) {
      // Tap — cycle snap
      setDragY(null)
      cycleSnap()
      return
    }

    const vh = window.innerHeight
    const y = dragY ?? startSheetY.current
    const now = Date.now()
    const velocity = lastPointer.current && (now - lastPointer.current.t) < 100
      ? (e.clientY - lastPointer.current.y) / Math.max(now - lastPointer.current.t, 1)
      : 0

    setSnap(resolveSnap(y, velocity, vh))
    setDragY(null)
  }

  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const backdropOpacity = getBackdropOpacity(snap, dragY, vh)

  return (
    <div className={styles.root} data-snap={dragY === null ? snap : undefined}>
      <div
        className={styles.backdrop}
        style={{ opacity: backdropOpacity, pointerEvents: snap !== 'peek' || dragY !== null ? 'auto' : 'none' }}
        onClick={() => { setSnap('peek'); setDragY(null) }}
        aria-hidden
      />
      <div
        className={styles.sheet}
        data-snap={dragY === null ? snap : undefined}
        data-dragging={dragY !== null ? 'true' : undefined}
        style={dragY !== null ? { top: `${dragY}px` } : undefined}
        role="complementary"
        aria-label="Vehicle details"
      >
        <div
          className={styles.handleArea}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="button"
          tabIndex={0}
          aria-label={snap === 'peek' ? 'Expand vehicle details' : 'Collapse vehicle details'}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycleSnap() }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSnap(snap === 'peek' ? 'mid' : 'full') }
            if (e.key === 'ArrowDown') { e.preventDefault(); setSnap(snap === 'full' ? 'mid' : 'peek') }
          }}
        >
          <div className={styles.handle} aria-hidden />
        </div>
        <div className={styles.content}>
          {children}
        </div>
      </div>
    </div>
  )
}
