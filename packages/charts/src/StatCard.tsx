import * as React from 'react'

export interface StatCardProps {
  value: number | string
  label: string
  /** CSS color value or custom property for the value text */
  colorScheme?: string
  className?: string
}

export function StatCard({ value, label, colorScheme, className }: StatCardProps) {
  return (
    <div className={className}>
      <p
        style={colorScheme ? { color: colorScheme } : undefined}
        aria-label={`${label}: ${value}`}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p>{label}</p>
    </div>
  )
}
