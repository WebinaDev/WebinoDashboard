"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { Box, RotateCw } from "lucide-react"

import { cn } from "@/lib/utils"

import type { CatalogGalleryView } from "../types"

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        poster?: string
        alt?: string
        ar?: string
        "ar-modes"?: string
        "camera-controls"?: string
        "auto-rotate"?: string
        "rotation-per-second"?: string
        "environment-image"?: string
        "shadow-intensity"?: string
        "touch-action"?: string
        loading?: string
      }
    }
  }
}

const MODEL_VIEWER_SRC = "https://cdn.jsdelivr.net/npm/@google/model-viewer@4.0.0/dist/model-viewer.min.js"

let modelViewerPromise: Promise<boolean> | null = null

/**
 * Loads Google's <model-viewer> once, on demand. It renders glTF/GLB, supports lighting,
 * and exposes AR on phones (Scene Viewer / Quick Look). If the CDN is blocked the promise
 * resolves false and callers fall back to the poster image, so the sheet never breaks.
 */
function loadModelViewer(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false)
  if (customElements.get("model-viewer")) return Promise.resolve(true)
  if (modelViewerPromise) return modelViewerPromise

  modelViewerPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement("script")
    script.type = "module"
    script.src = MODEL_VIEWER_SRC
    script.onload = () => resolve(Boolean(customElements.get("model-viewer")))
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
    // A slow network must not keep the skeleton forever.
    window.setTimeout(() => resolve(Boolean(customElements.get("model-viewer"))), 6000)
  })

  return modelViewerPromise
}

/**
 * 3D preview of a dish:
 * - `model3d` → glTF/GLB in a draggable AR stage (falls back to the poster).
 * - `spin360` → a frames folder spun with a drag or arrow keys; works with no library at all.
 */
export function Item3DViewer({
  view,
  title,
  labels,
  className,
}: {
  view: CatalogGalleryView
  title: string
  labels: { drag: string; ar: string; loading: string }
  className?: string
}) {
  if (view.type === "spin360") {
    return <Spin360 view={view} title={title} hint={labels.drag} className={className} />
  }
  return <Model3D view={view} title={title} labels={labels} className={className} />
}

function Model3D({
  view,
  title,
  labels,
  className,
}: {
  view: CatalogGalleryView
  title: string
  labels: { drag: string; ar: string; loading: string }
  className?: string
}) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    void loadModelViewer().then((ok) => {
      if (!alive) return
      setReady(ok)
      setFailed(!ok)
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div ref={ref} className={cn("cafe-3d", className)} data-ready={ready ? "true" : "false"}>
      {ready ? (
        <model-viewer
          src={view.url}
          poster={view.poster_url ?? undefined}
          alt={title}
          camera-controls=""
          auto-rotate=""
          rotation-per-second="18deg"
          environment-image="neutral"
          shadow-intensity="0.8"
          touch-action="pan-y"
          ar=""
          ar-modes="webxr scene-viewer quick-look"
          loading="lazy"
          style={{ width: "100%", height: "100%", background: "transparent" }}
        >
          <button slot="ar-button" type="button" className="cafe-3d-ar">
            {labels.ar}
          </button>
        </model-viewer>
      ) : view.poster_url ? (
        <Image src={view.poster_url} alt={title} fill unoptimized className="object-cover" />
      ) : (
        <div className="cafe-3d-skeleton" role="status" aria-live="polite">
          <Box className="size-8 opacity-50" aria-hidden="true" />
          <span>{failed ? labels.ar : labels.loading}</span>
        </div>
      )}
      <span className="cafe-3d-hint">
        <RotateCw className="size-3.5" aria-hidden="true" /> {labels.drag}
      </span>
    </div>
  )
}

/**
 * 360° turntable: `url` is a folder holding `1.jpg … {frames}.jpg` (or the first frame URL,
 * in which case the file number is swapped on drag). Pointer drag and arrow keys move it.
 */
function Spin360({
  view,
  title,
  hint,
  className,
}: {
  view: CatalogGalleryView
  title: string
  hint: string
  className?: string
}) {
  const frames = Math.max(2, Math.min(72, view.frames || 24))
  const [frame, setFrame] = useState(0)
  const drag = useRef<{ startX: number; startFrame: number } | null>(null)

  const frameUrl = (index: number) => {
    const number = (index % frames) + 1
    if (/\.[a-z0-9]+$/i.test(view.url)) {
      // Single pattern such as /spin/latte-1.jpg → swap the trailing number.
      return view.url.replace(/(\d+)(\.[a-z0-9]+)$/i, (_m, _n, ext) => `${number}${ext}`)
    }
    return `${view.url.replace(/\/$/, "")}/${number}.jpg`
  }

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { startX: e.clientX, startFrame: frame }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    const delta = e.clientX - drag.current.startX
    const step = Math.trunc(delta / 12)
    setFrame((drag.current.startFrame - step + frames * 4) % frames)
  }

  function onPointerUp() {
    drag.current = null
  }

  return (
    <div
      className={cn("cafe-3d cafe-spin", className)}
      role="img"
      aria-label={title}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setFrame((f) => (f - 1 + frames) % frames)
        if (e.key === "ArrowRight") setFrame((f) => (f + 1) % frames)
      }}
    >
      {/* Frames are user-uploaded asset URLs, not layout images, so a plain img keeps the spin instant. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={frameUrl(frame)}
        alt={title}
        draggable={false}
        onError={(e) => {
          if (view.poster_url) (e.currentTarget as HTMLImageElement).src = view.poster_url
        }}
      />
      <span className="cafe-3d-hint">
        <RotateCw className="size-3.5" aria-hidden="true" /> {hint}
      </span>
      <span className="cafe-3d-progress" aria-hidden="true">
        <span style={{ width: `${((frame + 1) / frames) * 100}%` }} />
      </span>
    </div>
  )
}
