"use client"

/* poetry-hero slides[]: lightweight CSS scroll-snap slider (no library). RTL swipe is native scrolling;
 * autoplay pauses on hover/focus/hidden tab and is off under prefers-reduced-motion. */
import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"

import { parseRows, propBool, propNum, propStr } from "../props"
import { optImg } from "@/lib/image-url"

type P = Record<string, unknown>
export type HeroSlide = { image: string; title: string; text: string; primaryLabel: string; primaryHref: string; secondaryLabel: string; secondaryHref: string }
const KEYS = ["image", "title", "text", "primaryLabel", "primaryHref", "secondaryLabel", "secondaryHref"]

export function heroSlides(p: P): HeroSlide[] {
  return (parseRows(p.slides, KEYS) as unknown as HeroSlide[]).filter((s) => s.image.trim() || s.title.trim())
}

const href = (v: string) => (/^(https?:|mailto:|tel:|\/|#)/i.test((v || "").trim()) ? v.trim() : "#")

export function HeroSlider({ p, slides, eyebrow }: { p: P; slides: HeroSlide[]; eyebrow: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(0)
  const [hold, setHold] = useState(false)
  const n = slides.length
  const auto = propBool(p, "sliderAutoplay", true) && n > 1
  const interval = Math.max(2, Math.min(30, propNum(p, "sliderInterval", 6))) * 1000
  const go = useCallback((i: number) => {
    const el = track.current
    if (!el || !n) return
    const t = ((i % n) + n) % n
    const child = el.children[t] as HTMLElement | undefined
    if (child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
    setIdx(t)
  }, [n])
  useEffect(() => {
    const el = track.current
    if (!el) return
    const on = () => { const w = el.clientWidth || 1; setIdx(Math.min(n - 1, Math.round(Math.abs(el.scrollLeft) / w))) }
    el.addEventListener("scroll", on, { passive: true })
    return () => el.removeEventListener("scroll", on)
  }, [n])
  useEffect(() => {
    if (!auto || hold || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const t = window.setInterval(() => { if (!document.hidden) go(idx + 1) }, interval)
    return () => window.clearInterval(t)
  }, [auto, hold, idx, interval, go])
  const h = Math.max(280, Math.min(900, propNum(p, "sliderHeight", 520)))
  return (
    <div className="wpz-hs" style={{ ["--wpz-hs-h" as string]: `${h}px` } as CSSProperties} role="region" aria-roledescription="carousel" aria-label={propStr(p, "title") || "اسلایدر"}
      onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}>
      <div className="wpz-hs-track" ref={track}>
        {slides.map((s, i) => (
          <div key={i} className="wpz-hs-slide" role="group" aria-roledescription="slide" aria-label={`${i + 1} از ${n}`} aria-hidden={i !== idx}>
            {s.image ? <img className="wpz-hs-img" {...optImg(s.image, "100vw", i === 0)} alt="" loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} decoding="async" /> : null}
            <div className="wpz-hs-body">
              {eyebrow && i === 0 ? <span className="wpz-eyebrow">{eyebrow}</span> : null}
              {s.title ? (i === 0 ? <h1 className="wpz-hero-title">{s.title}</h1> : <h2 className="wpz-hero-title">{s.title}</h2>) : null}
              {s.text ? <p className="wpz-hero-sub">{s.text}</p> : null}
              <div className="wpz-actions">
                {s.primaryLabel ? <Link tabIndex={i === idx ? 0 : -1} className="wpz-btn wpz-btn-primary" href={href(s.primaryHref)}>{s.primaryLabel}</Link> : null}
                {s.secondaryLabel ? <Link tabIndex={i === idx ? 0 : -1} className="wpz-btn wpz-btn-ghost" href={href(s.secondaryHref)}>{s.secondaryLabel}</Link> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
      {n > 1 && propBool(p, "sliderArrows", true) ? <>
        <button type="button" className="wpz-hs-arrow wpz-hs-prev" aria-label="اسلاید قبلی" onClick={() => go(idx - 1)}><ChevronRight size={22} aria-hidden /></button>
        <button type="button" className="wpz-hs-arrow wpz-hs-next" aria-label="اسلاید بعدی" onClick={() => go(idx + 1)}><ChevronLeft size={22} aria-hidden /></button>
      </> : null}
      {n > 1 && propBool(p, "sliderDots", true) ? (
        <div className="wpz-hs-dots">{slides.map((_, i) => <button key={i} type="button" aria-label={`اسلاید ${i + 1}`} aria-current={i === idx} className={i === idx ? "is-on" : ""} onClick={() => go(i)} />)}</div>
      ) : null}
    </div>
  )
}
