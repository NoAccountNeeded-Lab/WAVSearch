'use client'

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Link from 'next/link'

const pinIcon = L.divIcon({
  html: '<div style="background:var(--clr-primary,#b85c00);width:10px;height:10px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35)"></div>',
  className: '',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
  popupAnchor: [0, -8],
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createClusterIcon(cluster: any): L.DivIcon {
  const count = cluster.getChildCount() as number
  return L.divIcon({
    html: `<div style="background:var(--clr-primary,#b85c00);color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);font-family:inherit">${count}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

export interface MapListing {
  id: string
  lat: number
  lng: number
  year: number
  make: string
  model: string
  trim: string | null
  priceCents: number | null
  city: string | null
  state: string | null
}

function formatPrice(cents: number | null): string {
  if (cents === null) return 'Call for price'
  return `$${(cents / 100).toLocaleString()}`
}

export default function ListingsMap({ listings }: { listings: MapListing[] }) {
  return (
    <MapContainer
      center={[38, -96]}
      zoom={4}
      style={{ height: 220, width: '100%' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <MarkerClusterGroup chunkedLoading iconCreateFunction={createClusterIcon}>
        {listings.map((l) => (
          <Marker key={l.id} position={[l.lat, l.lng]} icon={pinIcon}>
            <Popup>
              <Link
                href={`/listings/${l.id}`}
                style={{ fontWeight: 600, color: 'var(--clr-primary)', textDecoration: 'none' }}
              >
                {l.year} {l.make} {l.model}{l.trim ? ` ${l.trim}` : ''}
              </Link>
              <br />
              {formatPrice(l.priceCents)}
              {l.city && l.state && (
                <>
                  <br />
                  {l.city}, {l.state}
                </>
              )}
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  )
}
