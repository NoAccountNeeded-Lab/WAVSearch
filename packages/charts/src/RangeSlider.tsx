'use client'

import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'

export interface RangeSliderProps {
  min: number
  max: number
  value: [number, number]
  step?: number
  /** CSS color value or custom property for the active range track */
  colorScheme?: string
  onFilterChange: (value: [number, number]) => void
  'aria-label'?: string
  className?: string
}

export function RangeSlider({
  min,
  max,
  value,
  step = 1,
  colorScheme = 'var(--clr-primary, #0052a3)',
  onFilterChange,
  'aria-label': ariaLabel,
  className,
}: RangeSliderProps) {
  const handleValueChange = (next: number[]) => {
    const [lo, hi] = next
    if (lo !== undefined && hi !== undefined) {
      onFilterChange([lo, hi])
    }
  }

  return (
    <SliderPrimitive.Root
      className={['relative flex w-full touch-none select-none items-center', className]
        .filter(Boolean)
        .join(' ')}
      min={min}
      max={max}
      step={step}
      value={value}
      onValueChange={handleValueChange}
      aria-label={ariaLabel}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[var(--clr-border,#e5e7eb)]">
        <SliderPrimitive.Range
          className="absolute h-full rounded-full"
          style={{ backgroundColor: colorScheme }}
        />
      </SliderPrimitive.Track>
      {value.map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className="block h-4 w-4 rounded-full border bg-white shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          style={
            {
              borderColor: colorScheme,
              '--tw-ring-color': colorScheme,
            } as React.CSSProperties
          }
        />
      ))}
    </SliderPrimitive.Root>
  )
}
