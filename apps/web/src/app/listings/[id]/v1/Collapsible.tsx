'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import styles from './page.module.css'

interface CollapsibleProps {
  header: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  greenHeader?: boolean
}

export function Collapsible({ header, children, defaultOpen = true, greenHeader = false }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        type="button"
        className={styles.sectionToggle}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={greenHeader ? styles.sectionLabelGreen : styles.sectionLabel}>
          {header}
        </span>
        <ChevronDown
          size={14}
          className={open ? styles.chevronOpen : styles.chevron}
          aria-hidden
        />
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}
