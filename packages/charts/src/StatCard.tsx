import * as React from 'react'

export interface StatCardProps {
  value: number | string
  label: string
  /** CSS color value or custom property for the value text. Defaults to brand primary. */
  colorScheme?: string
  className?: string
}

const defaultStyles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    background: 'var(--clr-bg, #fff)',
    border: '1.5px solid var(--clr-border, #e5e7eb)',
    borderRadius: '0.75rem',
    padding: '1.25rem 1.5rem',
  },
  value: {
    margin: 0,
    fontSize: 'clamp(1.75rem, 5vw, 2.25rem)',
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
    color: 'var(--clr-primary, #0052a3)',
  },
  label: {
    margin: 0,
    fontSize: '0.9375rem',
    color: 'var(--clr-text-secondary, #4b5563)',
  },
}

export function StatCard({ value, label, colorScheme, className }: StatCardProps) {
  return (
    <div style={defaultStyles.root} className={className}>
      <p
        style={{
          ...defaultStyles.value,
          ...(colorScheme ? { color: colorScheme } : {}),
        }}
        aria-label={`${label}: ${value}`}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p style={defaultStyles.label}>{label}</p>
    </div>
  )
}
