"use client"

import { useEffect, type RefObject } from "react"

import type { AdvancedProps, ShapeName } from "../types"

const SHAPES: Record<Exclude<ShapeName, "none">, string> = {
  wave: "M0,64 C240,120 480,0 720,48 C960,96 1200,24 1440,64 L1440,0 L0,0 Z",
  curve: "M0,0 C480,120 960,120 1440,0 L1440,0 L0,0 Z",
  tilt: "M0,0 L1440,96 L1440,0 Z",
  triangle: "M0,0 L720,96 L1440,0 Z",
  zigzag: "M0,0 L120,48 L240,0 L360,48 L480,0 L600,48 L720,0 L840,48 L960,0 L1080,48 L1200,0 L1320,48 L1440,0 Z",
}

function safeColor(value: string | undefined, fallback: string): string {
  return value && /^[#a-zA-Z0-9(),.%\s-]{1,60}$/.test(value) ? value : fallback
}

/** Background video, colour overlay and SVG shape dividers for a section/column (`.wb-decor`). */
export function Decor({ advanced }: { advanced: AdvancedProps | undefined }) {
  const bg = advanced?.background
  if (!bg) return null
  const color = safeColor(bg.shapeColor, "var(--wb-color-background, #fff)")
  const height = Math.max(20, Math.min(200, bg.shapeHeight ?? 60))
  const shape = (name: ShapeName | undefined, side: "top" | "bottom") =>
    name && name !== "none" ? (
      <div className={`wb-shape wb-shape-${side}`} style={{ height }} aria-hidden>
        <svg viewBox="0 0 1440 120" preserveAspectRatio="none"><path d={SHAPES[name]} fill={color} /></svg>
      </div>
    ) : null
  const video = bg.video && /^(https?:\/\/|\/)/.test(bg.video) ? bg.video : ""
  return (
    <>
      {video ? <video className="wb-bg-video" src={video} poster={bg.poster || undefined} autoPlay muted loop playsInline preload="metadata" aria-hidden /> : null}
      {bg.overlay ? <div className="wb-bg-overlay" style={{ background: safeColor(bg.overlay, "transparent"), opacity: Math.max(0, Math.min(1, bg.overlayOpacity ?? 0.5)) }} aria-hidden /> : null}
      {shape(bg.shapeTop, "top")}
      {shape(bg.shapeBottom, "bottom")}
    </>
  )
}

/** Live-site motion: entrance animations on scroll, parallax and 3D tilt. One observer per canvas. */
export function useCanvasMotion(root: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = root.current
    if (!enabled || !el) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const animated = Array.from(el.querySelectorAll<HTMLElement>(".wb-anim"))
    let io: IntersectionObserver | null = null
    if (animated.length && !reduce && typeof IntersectionObserver !== "undefined") {
      // Content already on screen at load stays as server-rendered: hiding it and
      // fading it back in after hydration delays LCP by about a second on mobile.
      const vh = window.innerHeight
      for (const node of animated) {
        if (node.getBoundingClientRect().top < vh) {
          node.classList.add("wb-in")
          node.style.animationName = "none"
        }
      }
      el.classList.add("wb-motion")
      io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add("wb-in")
          io?.unobserve(entry.target)
        }
      }, { rootMargin: "0px 0px -10% 0px" })
      animated.forEach((node) => { if (!node.classList.contains("wb-in")) io?.observe(node) })
    }
    const parallax = reduce ? [] : Array.from(el.querySelectorAll<HTMLElement>("[data-wb-parallax]"))
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const vh = window.innerHeight
        for (const node of parallax) {
          const speed = Number(node.dataset.wbParallax) || 0
          const rect = node.getBoundingClientRect()
          const offset = (rect.top + rect.height / 2 - vh / 2) * speed * -0.05
          node.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`
        }
      })
    }
    if (parallax.length) {
      window.addEventListener("scroll", onScroll, { passive: true })
      onScroll()
    }
    const tilts = reduce ? [] : Array.from(el.querySelectorAll<HTMLElement>("[data-wb-tilt]"))
    const move = (event: PointerEvent) => {
      const node = event.currentTarget as HTMLElement
      const rect = node.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width - 0.5
      const y = (event.clientY - rect.top) / rect.height - 0.5
      node.style.transform = `perspective(800px) rotateY(${(x * 8).toFixed(2)}deg) rotateX(${(-y * 8).toFixed(2)}deg)`
    }
    const leave = (event: PointerEvent) => {
      ;(event.currentTarget as HTMLElement).style.transform = ""
    }
    tilts.forEach((node) => {
      node.style.transition = "transform .15s ease"
      node.addEventListener("pointermove", move)
      node.addEventListener("pointerleave", leave)
    })
    return () => {
      io?.disconnect()
      el.classList.remove("wb-motion")
      window.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
      tilts.forEach((node) => {
        node.removeEventListener("pointermove", move)
        node.removeEventListener("pointerleave", leave)
      })
    }
  }, [enabled, root])
}

export function motionAttrs(advanced: AdvancedProps | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  const speed = advanced?.motion?.parallax
  if (speed) out["data-wb-parallax"] = String(Math.max(-10, Math.min(10, speed)))
  if (advanced?.motion?.tilt) out["data-wb-tilt"] = ""
  return out
}
