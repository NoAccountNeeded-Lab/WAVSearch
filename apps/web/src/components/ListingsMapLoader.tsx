'use client'

import dynamic from 'next/dynamic'
import type { MapListing } from './ListingsMap'

const ListingsMap = dynamic(() => import('./ListingsMap'), { ssr: false })

export default function ListingsMapLoader({ listings }: { listings: MapListing[] }) {
  return <ListingsMap listings={listings} />
}
