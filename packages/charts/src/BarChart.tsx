'use client'

import * as React from 'react'
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Brush,
  type MouseHandlerDataParam,
} from 'recharts'

export interface BarChartDataPoint {
  label: string
  value: number
}

export interface BarChartProps {
  data: BarChartDataPoint[]
  /** CSS color value or custom property, e.g. "var(--primary)" */
  colorScheme?: string
  onFilterChange?: (label: string | null) => void
  /** Whether to show a brush for range selection */
  brush?: boolean
  'aria-label': string
  className?: string
}

export function BarChart({
  data,
  colorScheme = 'var(--primary, #6366f1)',
  onFilterChange,
  brush = false,
  'aria-label': ariaLabel,
  className,
}: BarChartProps) {
  const [activeLabel, setActiveLabel] = React.useState<string | null>(null)

  const handleClick = (entry: MouseHandlerDataParam) => {
    if (!onFilterChange) return
    const label = typeof entry.activeLabel === 'string' ? entry.activeLabel : null
    const next = label === activeLabel ? null : label
    setActiveLabel(next)
    onFilterChange(next)
  }

  const rechartData = data.map((d) => ({ name: d.label, value: d.value }))

  return (
    <div role="img" aria-label={ariaLabel} className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart data={rechartData} onClick={handleClick}>
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar
            dataKey="value"
            fill={colorScheme}
            opacity={1}
          />
          {brush && <Brush dataKey="name" height={20} stroke={colorScheme} />}
        </RechartsBarChart>
      </ResponsiveContainer>
      <details>
        <summary>Data table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Label</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td>{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
