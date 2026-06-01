'use client'

import { useRef, useState } from 'react'
import styles from './Tabs.module.css'

export interface TabDefinition {
  id: string
  label: string
  icon?: React.ReactNode
  content: React.ReactNode
}

interface TabsProps {
  tabs: TabDefinition[]
  defaultTab?: string
  onTabSelect?: (id: string) => void
}

export function Tabs({ tabs, defaultTab, onTabSelect }: TabsProps) {
  const [activeId, setActiveId] = useState(defaultTab ?? tabs[0]?.id ?? '')
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length
    if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    if (e.key === 'Home') next = 0
    if (e.key === 'End') next = tabs.length - 1
    if (next === null) return
    e.preventDefault()
    const nextTab = tabs[next]
    if (nextTab) {
      setActiveId(nextTab.id)
      tabRefs.current[next]?.focus()
    }
  }

  return (
    <div className={styles.root}>
      <div
        role="tablist"
        className={styles.tabList}
        aria-label="Vehicle detail sections"
      >
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={el => { tabRefs.current[i] = el }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-controls={`panel-${tab.id}`}
            aria-selected={tab.id === activeId}
            tabIndex={tab.id === activeId ? 0 : -1}
            className={styles.tab}
            data-active={tab.id === activeId ? 'true' : undefined}
            onClick={() => { setActiveId(tab.id); onTabSelect?.(tab.id) }}
            onKeyDown={e => handleKeyDown(e, i)}
            type="button"
          >
            {tab.icon != null && (
              <span className={styles.tabIcon} aria-hidden>
                {tab.icon}
              </span>
            )}
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className={styles.panels}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`panel-${tab.id}`}
            aria-labelledby={`tab-${tab.id}`}
            className={styles.panel}
            hidden={tab.id !== activeId}
            tabIndex={0}
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  )
}
