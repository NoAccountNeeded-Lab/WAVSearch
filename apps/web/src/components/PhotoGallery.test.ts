import { describe, it, expect, vi } from 'vitest'

// useSwipeHandlers lives inside a 'use client' module and depends on React hooks, so
// it cannot be imported directly in a non-browser environment.  Instead, we duplicate
// the gesture-classification logic here under test — if the implementation changes,
// update both.  This approach mirrors the IntakeForm.test.ts pattern in this project.

interface SwipePoint {
  x: number
  y: number
}

interface SwipeOptions {
  horizontalThreshold?: number
  verticalThreshold?: number
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeDown?: () => void
}

function classifySwipe(
  start: SwipePoint,
  end: SwipePoint,
  {
    horizontalThreshold = 40,
    verticalThreshold = 80,
    onSwipeLeft,
    onSwipeRight,
    onSwipeDown,
  }: SwipeOptions,
): void {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const absX = Math.abs(deltaX)
  const absY = Math.abs(deltaY)

  if (absX >= horizontalThreshold && absX > absY) {
    if (deltaX < 0 && onSwipeLeft) onSwipeLeft()
    else if (deltaX > 0 && onSwipeRight) onSwipeRight()
    return
  }

  if (deltaY >= verticalThreshold && absY > absX && onSwipeDown) {
    onSwipeDown()
  }
}

// Helper to build SwipePoint objects
const pt = (x: number, y: number): SwipePoint => ({ x, y })

describe('swipe gesture classification', () => {
  describe('horizontal swipe — left (next photo)', () => {
    it('fires onSwipeLeft when deltaX < -threshold and horizontal dominates', () => {
      const onSwipeLeft = vi.fn()
      classifySwipe(pt(200, 100), pt(150, 102), { onSwipeLeft })
      expect(onSwipeLeft).toHaveBeenCalledOnce()
    })

    it('does not fire when deltaX is below threshold', () => {
      const onSwipeLeft = vi.fn()
      classifySwipe(pt(200, 100), pt(165, 100), { onSwipeLeft }) // deltaX = -35, below 40
      expect(onSwipeLeft).not.toHaveBeenCalled()
    })

    it('does not fire when vertical movement dominates', () => {
      const onSwipeLeft = vi.fn()
      classifySwipe(pt(200, 100), pt(150, 40), { onSwipeLeft }) // absX=50 absY=60 → vertical wins
      expect(onSwipeLeft).not.toHaveBeenCalled()
    })

    it('fires at exactly the threshold boundary', () => {
      const onSwipeLeft = vi.fn()
      classifySwipe(pt(200, 100), pt(160, 100), { onSwipeLeft }) // deltaX = -40, exactly threshold
      expect(onSwipeLeft).toHaveBeenCalledOnce()
    })
  })

  describe('horizontal swipe — right (previous photo)', () => {
    it('fires onSwipeRight when deltaX > threshold and horizontal dominates', () => {
      const onSwipeRight = vi.fn()
      classifySwipe(pt(150, 100), pt(200, 102), { onSwipeRight })
      expect(onSwipeRight).toHaveBeenCalledOnce()
    })

    it('does not fire when deltaX is below threshold', () => {
      const onSwipeRight = vi.fn()
      classifySwipe(pt(150, 100), pt(185, 100), { onSwipeRight }) // deltaX = 35
      expect(onSwipeRight).not.toHaveBeenCalled()
    })
  })

  describe('vertical swipe down — dismiss lightbox', () => {
    it('fires onSwipeDown when deltaY >= verticalThreshold and vertical dominates', () => {
      const onSwipeDown = vi.fn()
      classifySwipe(pt(100, 100), pt(105, 185), { onSwipeDown }) // deltaY=85 absY>absX
      expect(onSwipeDown).toHaveBeenCalledOnce()
    })

    it('does not fire when below vertical threshold', () => {
      const onSwipeDown = vi.fn()
      classifySwipe(pt(100, 100), pt(100, 170), { onSwipeDown }) // deltaY=70 < 80
      expect(onSwipeDown).not.toHaveBeenCalled()
    })

    it('does not fire on upward swipe', () => {
      const onSwipeDown = vi.fn()
      classifySwipe(pt(100, 200), pt(100, 100), { onSwipeDown }) // deltaY = -100, upward
      expect(onSwipeDown).not.toHaveBeenCalled()
    })

    it('does not fire when horizontal movement dominates', () => {
      const onSwipeDown = vi.fn()
      // deltaX=-90, deltaY=85 → absX(90) > absY(85) → horizontal dominates, downward suppressed
      classifySwipe(pt(200, 100), pt(110, 185), { onSwipeDown })
      expect(onSwipeDown).not.toHaveBeenCalled()
    })

    it('fires at exactly the vertical threshold', () => {
      const onSwipeDown = vi.fn()
      classifySwipe(pt(100, 100), pt(100, 180), { onSwipeDown }) // deltaY=80 exactly
      expect(onSwipeDown).toHaveBeenCalledOnce()
    })
  })

  describe('mutual exclusivity', () => {
    it('horizontal swipe does not also trigger onSwipeDown', () => {
      const onSwipeLeft = vi.fn()
      const onSwipeDown = vi.fn()
      classifySwipe(pt(200, 100), pt(140, 120), { onSwipeLeft, onSwipeDown })
      expect(onSwipeLeft).toHaveBeenCalledOnce()
      expect(onSwipeDown).not.toHaveBeenCalled()
    })

    it('downward swipe does not trigger horizontal callbacks', () => {
      const onSwipeLeft = vi.fn()
      const onSwipeRight = vi.fn()
      const onSwipeDown = vi.fn()
      classifySwipe(pt(100, 100), pt(105, 190), { onSwipeLeft, onSwipeRight, onSwipeDown })
      expect(onSwipeLeft).not.toHaveBeenCalled()
      expect(onSwipeRight).not.toHaveBeenCalled()
      expect(onSwipeDown).toHaveBeenCalledOnce()
    })
  })

  describe('no-op cases', () => {
    it('does nothing when callbacks are not provided', () => {
      // Should not throw
      expect(() => classifySwipe(pt(200, 100), pt(100, 100), {})).not.toThrow()
    })

    it('does nothing for a tiny movement below all thresholds', () => {
      const onSwipeLeft = vi.fn()
      const onSwipeRight = vi.fn()
      const onSwipeDown = vi.fn()
      classifySwipe(pt(100, 100), pt(105, 105), { onSwipeLeft, onSwipeRight, onSwipeDown })
      expect(onSwipeLeft).not.toHaveBeenCalled()
      expect(onSwipeRight).not.toHaveBeenCalled()
      expect(onSwipeDown).not.toHaveBeenCalled()
    })

    it('does nothing on tap (zero movement)', () => {
      const onSwipeLeft = vi.fn()
      const onSwipeDown = vi.fn()
      classifySwipe(pt(100, 100), pt(100, 100), { onSwipeLeft, onSwipeDown })
      expect(onSwipeLeft).not.toHaveBeenCalled()
      expect(onSwipeDown).not.toHaveBeenCalled()
    })
  })

  describe('custom thresholds', () => {
    it('respects custom horizontalThreshold', () => {
      const onSwipeLeft = vi.fn()
      classifySwipe(pt(200, 100), pt(175, 100), { horizontalThreshold: 20, onSwipeLeft })
      expect(onSwipeLeft).toHaveBeenCalledOnce()
    })

    it('respects custom verticalThreshold', () => {
      const onSwipeDown = vi.fn()
      classifySwipe(pt(100, 100), pt(100, 160), { verticalThreshold: 50, onSwipeDown })
      expect(onSwipeDown).toHaveBeenCalledOnce()
    })
  })
})

describe('getVisibleDotIndices', () => {
  // Also duplicate and test this pure utility, which determines which dots
  // are shown in the navigation strip.
  function getVisibleDotIndices(activeIndex: number, imageCount: number): number[] {
    const maxVisible = 7
    if (imageCount <= maxVisible) return Array.from({ length: imageCount }, (_, index) => index)

    const halfWindow = Math.floor(maxVisible / 2)
    const start = Math.min(Math.max(activeIndex - halfWindow, 0), imageCount - maxVisible)
    return Array.from({ length: maxVisible }, (_, offset) => start + offset)
  }

  it('returns all indices when imageCount <= 7', () => {
    expect(getVisibleDotIndices(0, 5)).toEqual([0, 1, 2, 3, 4])
    expect(getVisibleDotIndices(3, 7)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('returns empty array when imageCount is 0', () => {
    expect(getVisibleDotIndices(0, 0)).toEqual([])
  })

  it('returns exactly 7 indices when imageCount > 7', () => {
    expect(getVisibleDotIndices(5, 20)).toHaveLength(7)
  })

  it('centers window on active index (mid-range)', () => {
    // activeIndex=10, halfWindow=3, start = max(10-3, 0)=7, clamped to 20-7=13 → start=7
    const result = getVisibleDotIndices(10, 20)
    expect(result[0]).toBe(7)
    expect(result[6]).toBe(13)
  })

  it('clamps to start when activeIndex is near beginning', () => {
    const result = getVisibleDotIndices(1, 20)
    expect(result[0]).toBe(0)
    expect(result).toHaveLength(7)
  })

  it('clamps to end when activeIndex is near end', () => {
    const result = getVisibleDotIndices(18, 20)
    expect(result[result.length - 1]).toBe(19)
    expect(result).toHaveLength(7)
  })
})
