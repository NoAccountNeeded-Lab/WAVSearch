'use client'

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Link from 'next/link'

const pinIcon = L.divIcon({
  html: '<div style="background:#2563eb;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
  popupAnchor: [0, -10],
})

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
      style={{ height: 320, borderRadius: 8, marginBottom: '1.5rem' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MarkerClusterGroup chunkedLoading>
        {listings.map((l) => (
          <Marker key={l.id} position={[l.lat, l.lng]} icon={pinIcon}>
            <Popup>
              <Link
                href={`/listings/${l.id}`}
                style={{ fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}
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
