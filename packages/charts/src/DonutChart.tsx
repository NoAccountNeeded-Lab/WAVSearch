'use client'

import * as React from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

export interface DonutChartDataPoint {
  label: string
  value: number
}

export interface DonutChartProps {
  data: DonutChartDataPoint[]
  /**
   * Array of CSS color values or custom properties for each segment.
   * Cycles if fewer entries than data points.
   */
  colorScheme?: string[]
  onFilterChange?: (label: string | null) => void
  'aria-label': string
  className?: string
}

const DEFAULT_COLORS = [
  'var(--chart-1, #6366f1)',
  'var(--chart-2, #8b5cf6)',
  'var(--chart-3, #a78bfa)',
  'var(--chart-4, #c4b5fd)',
  'var(--chart-5, #ddd6fe)',
]

export function DonutChart({
  data,
  colorScheme = DEFAULT_COLORS,
  onFilterChange,
  'aria-label': ariaLabel,
  className,
}: DonutChartProps) {
  const [activeLabel, setActiveLabel] = React.useState<string | null>(null)

  const handleClick = (entry: { name?: string } | null) => {
    if (!onFilterChange) return
    const label = entry?.name ?? null
    const next = label === activeLabel ? null : label
    setActiveLabel(next)
    onFilterChange(next)
  }

  const rechartData = data.map((d) => ({ name: d.label, value: d.value }))
  const colors = colorScheme.length > 0 ? colorScheme : DEFAULT_COLORS

  return (
    <div role="img" aria-label={ariaLabel} className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={rechartData}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="80%"
            onClick={handleClick}
            style={{ cursor: onFilterChange ? 'pointer' : undefined }}
          >
            {rechartData.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={colors[index % colors.length] ?? DEFAULT_COLORS[0] ?? '#6366f1'}
                opacity={activeLabel === null || activeLabel === rechartData[index]?.name ? 1 : 0.4}
              />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
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
