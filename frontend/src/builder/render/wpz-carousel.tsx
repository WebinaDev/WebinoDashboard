"use client"

/* Lightweight RTL-aware carousel: CSS scroll-snap track (native swipe, SSR markup identical to grid items),
 * prev/next arrows on desktop, optional autoplay (paused on hover/focus/touch and reduced motion).
 * slidesPerView is driven by CSS vars so the first paint is already laid out (no JS measurement). */

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react"

export type CarouselOpts = { desktop: number; mobile: number; autoplay: boolean; interval: number; gap?: number }

export function clampSpv(v: number, def: number): number {
  return Number.isFinite(v) && v > 0 ? Math.min(8, Math.max(1, v)) : def
}

export function WpzCarousel({ opts, label, className = "", children }: { opts: CarouselOpts; label?: string; className?: string; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null)
  const paused = useRef(false)

  const step = (dir: 1 | -1) => {
    const el = track.current
    if (!el) return
    const first = el.firstElementChild as HTMLElement | null
    const gap = parseFloat(getComputedStyle(el).columnGap || "0") || 0
    const w = (first?.offsetWidth ?? el.clientWidth) + gap
    const rtl = getComputedStyle(el).direction === "rtl"
    // "next" moves toward the inline end: negative scrollLeft direction in RTL.
    const max = el.scrollWidth - el.clientWidth
    const pos = Math.abs(el.scrollLeft)
    if (dir === 1 && pos >= max - 4) {
      el.scrollTo({ left: 0, behavior: "smooth" })
      return
    }
    el.scrollBy({ left: (rtl ? -1 : 1) * dir * w, behavior: "smooth" })
  }

  useEffect(() => {
    if (!opts.autoplay) return
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setInterval(() => {
      if (!paused.current && document.visibilityState === "visible") step(1)
    }, Math.max(2, opts.interval) * 1000)
    return () => window.clearInterval(id)
  }, [opts.autoplay, opts.interval])

  const style = {
    ["--wpz-spv" as string]: String(opts.desktop),
    ["--wpz-spv-m" as string]: String(opts.mobile),
    ...(opts.gap !== undefined ? { ["--wpz-cgap" as string]: `${opts.gap}px` } : {}),
  } as CSSProperties
  const pause = (v: boolean) => () => { paused.current = v }

  return (
    <div className={`wpz-carousel ${className}`} style={style} role="region" aria-roledescription="carousel" aria-label={label}
      onMouseEnter={pause(true)} onMouseLeave={pause(false)} onFocus={pause(true)} onBlur={pause(false)} onTouchStart={pause(true)}>
      <div ref={track} className="wpz-carousel-track" role="list">{children}</div>
      <button type="button" className="wpz-carousel-btn wpz-carousel-prev" aria-label="قبلی" onClick={() => step(-1)}><ChevronRight className="h-5 w-5" aria-hidden /></button>
      <button type="button" className="wpz-carousel-btn wpz-carousel-next" aria-label="بعدی" onClick={() => step(1)}><ChevronLeft className="h-5 w-5" aria-hidden /></button>
    </div>
  )
}
