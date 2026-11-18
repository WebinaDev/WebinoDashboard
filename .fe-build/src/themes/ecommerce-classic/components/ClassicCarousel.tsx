"use client"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { IconChevronLeft, IconChevronRight } from "./icons"

/**
 * Horizontal snap carousel (RTL-aware): native swipe on touch, arrow buttons on
 * desktop, optional autoplay that pauses on hover/focus/touch and wraps around.
 */
export function ClassicCarousel({
  children,
  className = "",
  trackClassName = "",
  autoplay = false,
  interval = 5,
  label,
}: {
  children: ReactNode
  className?: string
  trackClassName?: string
  autoplay?: boolean
  interval?: number
  label?: string
}) {
  const track = useRef<HTMLDivElement>(null)
  const paused = useRef(false)
  const [edges, setEdges] = useState({ start: true, end: false })

  const measure = useCallback(() => {
    const el = track.current
    if (!el) return
    // In RTL scrollLeft is 0 at start and negative toward the end.
    const pos = Math.abs(el.scrollLeft)
    const max = el.scrollWidth - el.clientWidth
    setEdges({ start: pos <= 2, end: pos >= max - 2 })
  }, [])

  const step = useCallback((dir: 1 | -1) => {
    const el = track.current
    if (!el) return
    const rtl = getComputedStyle(el).direction === "rtl"
    const first = el.firstElementChild as HTMLElement | null
    const amount = Math.max(first?.offsetWidth ?? 0, el.clientWidth * 0.8)
    const pos = Math.abs(el.scrollLeft)
    const max = el.scrollWidth - el.clientWidth
    if (dir === 1 && pos >= max - 2) {
      el.scrollTo({ left: 0, behavior: "smooth" })
      return
    }
    el.scrollBy({ left: (rtl ? -1 : 1) * dir * amount, behavior: "smooth" })
  }, [])

  useEffect(() => {
    measure()
    const el = track.current
    if (!el) return
    el.addEventListener("scroll", measure, { passive: true })
    window.addEventListener("resize", measure)
    return () => {
      el.removeEventListener("scroll", measure)
      window.removeEventListener("resize", measure)
    }
  }, [measure])

  useEffect(() => {
    if (!autoplay) return
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const ms = Math.max(2, interval || 5) * 1000
    const timer = window.setInterval(() => {
      if (!paused.current && document.visibilityState === "visible") step(1)
    }, ms)
    return () => window.clearInterval(timer)
  }, [autoplay, interval, step])

  const pause = () => (paused.current = true)
  const resume = () => (paused.current = false)

  return (
    <div
      className={`sfc-carousel ${className}`}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resume}
      onTouchStart={pause}
    >
      <button
        type="button"
        className="sfc-carousel__arrow sfc-carousel__arrow--prev"
        aria-label="قبلی"
        disabled={edges.start}
        onClick={() => step(-1)}
      >
        <IconChevronRight size={18} />
      </button>
      <div className={`sfc-carousel__track ${trackClassName}`} ref={track}>
        {children}
      </div>
      <button
        type="button"
        className="sfc-carousel__arrow sfc-carousel__arrow--next"
        aria-label="بعدی"
        disabled={edges.end && !autoplay}
        onClick={() => step(1)}
      >
        <IconChevronLeft size={18} />
      </button>
    </div>
  )
}
