"use client"

/**
 * MapPinPicker: Leaflet + OpenStreetMap tiles (no API key). Leaflet is loaded from the
 * official unpkg build with SRI so no new npm dependency is needed.
 * Click or drag the marker to pick a point; `readOnly` just shows a point.
 */
import { useEffect, useRef, useState } from "react"

type LatLng = { lat: number; lng: number }

type LeafletMap = {
  setView: (c: [number, number], z: number) => LeafletMap
  on: (ev: string, fn: (e: { latlng: LatLng }) => void) => void
  remove: () => void
  invalidateSize: () => void
}
type LeafletMarker = {
  setLatLng: (c: [number, number]) => LeafletMarker
  addTo: (m: LeafletMap) => LeafletMarker
  on: (ev: string, fn: () => void) => void
  getLatLng: () => LatLng
}
type LeafletNS = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap
  tileLayer: (url: string, opts: Record<string, unknown>) => { addTo: (m: LeafletMap) => void }
  marker: (c: [number, number], opts?: Record<string, unknown>) => LeafletMarker
  circle: (c: [number, number], opts: Record<string, unknown>) => { addTo: (m: LeafletMap) => void }
}

const CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
const CSS_SRI = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
const JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
const JS_SRI = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="

let loader: Promise<LeafletNS> | null = null

function loadLeaflet(): Promise<LeafletNS> {
  const w = window as unknown as { L?: LeafletNS }
  if (w.L) return Promise.resolve(w.L)
  if (loader) return loader
  loader = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${CSS_URL}"]`)) {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = CSS_URL
      link.integrity = CSS_SRI
      link.crossOrigin = ""
      document.head.appendChild(link)
    }
    const script = document.createElement("script")
    script.src = JS_URL
    script.integrity = JS_SRI
    script.crossOrigin = ""
    script.async = true
    script.onload = () => (w.L ? resolve(w.L) : reject(new Error("leaflet")))
    script.onerror = () => {
      loader = null
      reject(new Error("leaflet"))
    }
    document.head.appendChild(script)
  })
  return loader
}

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
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<LeafletMarker | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadLeaflet()
      .then((L) => {
        if (cancelled || !el.current || mapRef.current) return
        const start = value ?? center ?? TEHRAN
        const map = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], value ? 16 : 14)
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap",
        }).addTo(map)
        if (center && radiusKm && radiusKm > 0) {
          L.circle([center.lat, center.lng], { radius: radiusKm * 1000, color: "#c46b3a", weight: 1, fillOpacity: 0.06 }).addTo(map)
        }
        if (value) {
          markerRef.current = L.marker([value.lat, value.lng], { draggable: !readOnly }).addTo(map)
        }
        const place = (p: LatLng) => {
          if (readOnly) return
          if (!markerRef.current) {
            markerRef.current = L.marker([p.lat, p.lng], { draggable: true }).addTo(map)
            markerRef.current.on("dragend", () => {
              const ll = markerRef.current!.getLatLng()
              onChangeRef.current?.({ lat: ll.lat, lng: ll.lng })
            })
          } else {
            markerRef.current.setLatLng([p.lat, p.lng])
          }
          onChangeRef.current?.({ lat: p.lat, lng: p.lng })
        }
        if (markerRef.current && !readOnly) {
          markerRef.current.on("dragend", () => {
            const ll = markerRef.current!.getLatLng()
            onChangeRef.current?.({ lat: ll.lat, lng: ll.lng })
          })
        }
        map.on("click", (e) => place(e.latlng))
        mapRef.current = map
        ;(el.current as unknown as { __place?: (p: LatLng) => void }).__place = place
        window.setTimeout(() => map.invalidateSize(), 150)
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function locate() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      mapRef.current?.setView([p.lat, p.lng], 17)
      ;(el.current as unknown as { __place?: (p: LatLng) => void } | null)?.__place?.(p)
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
