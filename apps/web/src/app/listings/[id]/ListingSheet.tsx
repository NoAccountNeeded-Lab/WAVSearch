'use client'

import { useState } from 'react'
import { BottomSheet, type SnapPoint } from '@/components/BottomSheet'
import { Tabs, type TabDefinition } from '@/components/Tabs'

interface ListingSheetProps {
  tabs: TabDefinition[]
}

export function ListingSheet({ tabs }: ListingSheetProps) {
  const [snap, setSnap] = useState<SnapPoint>('peek')

  const handleTabSelect = () => {
    if (snap === 'peek') setSnap('mid')
  }

  return (
    <BottomSheet snap={snap} onSnapChange={setSnap}>
      <Tabs tabs={tabs} defaultTab="overview" onTabSelect={handleTabSelect} />
    </BottomSheet>
  )
}
