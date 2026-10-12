"use client"

/**
 * MapPinPicker: Leaflet (npm) + OpenStreetMap tiles, no API key.
 * Leaflet touches `window`, so it is imported dynamically inside an effect (client only).
 * Marker icons are served locally from /public/leaflet.
 */
import "leaflet/dist/leaflet.css"
import type * as Leaflet from "leaflet"
import { useEffect, useRef, useState } from "react"

type LatLng = { lat: number; lng: number }

const TEHRAN: LatLng = { lat: 35.6997, lng: 51.338 }

export function MapPinPicker({
  value,
  onChange,
  center,
  radiusKm,
  readOnly = false,
  height = 220,
  labels,
}: {
  value: LatLng | null
  onChange?: (v: LatLng) => void
  center?: LatLng | null
  radiusKm?: number
  readOnly?: boolean
  height?: number
  labels?: { locate?: string; failed?: string; hint?: string }
}) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Leaflet.Map | null>(null)
  const markerRef = useRef<Leaflet.Marker | null>(null)
  const circleRef = useRef<Leaflet.Circle | null>(null)
  const libRef = useRef<typeof Leaflet | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)

  function place(p: LatLng, emit: boolean) {
    const L = libRef.current
    const map = mapRef.current
    if (!L || !map) return
    if (!markerRef.current) {
      markerRef.current = L.marker([p.lat, p.lng], { draggable: !readOnly }).addTo(map)
      markerRef.current.on("dragend", () => {
        const ll = markerRef.current!.getLatLng()
        onChangeRef.current?.({ lat: ll.lat, lng: ll.lng })
      })
    } else {
      markerRef.current.setLatLng([p.lat, p.lng])
    }
    if (emit) onChangeRef.current?.({ lat: p.lat, lng: p.lng })
  }

  useEffect(() => {
    let cancelled = false
    import("leaflet")
      .then((mod) => {
        const L = ((mod as unknown as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet
        if (cancelled || !el.current || mapRef.current) return
        libRef.current = L
        L.Icon.Default.mergeOptions({
          iconUrl: "/leaflet/marker-icon.png",
          iconRetinaUrl: "/leaflet/marker-icon-2x.png",
          shadowUrl: "/leaflet/marker-shadow.png",
        })
        // Bundlers break Leaflet's CSS-based icon path detection; the options above are enough.
        delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
        const start = value ?? center ?? TEHRAN
        const map = L.map(el.current).setView([start.lat, start.lng], value ? 16 : 14)
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap",
        }).addTo(map)
        mapRef.current = map
        if (value) place(value, false)
        if (!readOnly) map.on("click", (e: Leaflet.LeafletMouseEvent) => place(e.latlng, true))
        window.setTimeout(() => map.invalidateSize(), 150)
        setReady(true)
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
      circleRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep marker in sync when the value changes from outside (saved address picked).
  useEffect(() => {
    if (!ready || !value) return
    const cur = markerRef.current?.getLatLng()
    if (!cur || Math.abs(cur.lat - value.lat) > 1e-7 || Math.abs(cur.lng - value.lng) > 1e-7) {
      place(value, false)
      mapRef.current?.setView([value.lat, value.lng], Math.max(mapRef.current.getZoom(), 15))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, value?.lat, value?.lng])

  // Delivery radius circle follows settings.
  useEffect(() => {
    const L = libRef.current
    const map = mapRef.current
    if (!ready || !L || !map) return
    circleRef.current?.remove()
    circleRef.current = null
    if (center && radiusKm && radiusKm > 0) {
      circleRef.current = L.circle([center.lat, center.lng], { radius: radiusKm * 1000, color: "#c46b3a", weight: 1, fillOpacity: 0.06 }).addTo(map)
    }
  }, [ready, center?.lat, center?.lng, radiusKm, center])

  function locate() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      mapRef.current?.setView([p.lat, p.lng], 17)
      place(p, true)
    })
  }

  if (failed) {
    return <p className="cafe-hint">{labels?.failed ?? "Map unavailable"}</p>
  }

  return (
    <div className="cafe-map" dir="ltr">
      <div ref={el} style={{ height, width: "100%", borderRadius: 14, overflow: "hidden", zIndex: 0 }} />
      {!readOnly ? (
        <div className="cafe-map-bar" dir="auto">
          <span className="cafe-hint">{labels?.hint}</span>
          <button type="button" className="cafe-chip" onClick={locate}>{labels?.locate ?? "My location"}</button>
        </div>
      ) : null}
    </div>
  )
}
