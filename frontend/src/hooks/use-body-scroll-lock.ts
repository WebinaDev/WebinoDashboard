"use client"

import { useLayoutEffect } from "react"

/**
 * Lock document scroll without the position:fixed body trick.
 * That pattern paints a solid theme background (brown/black on cafe dark)
 * over the page and makes storefront content disappear behind overlays.
 */
export function useBodyScrollLock(locked: boolean) {
  useLayoutEffect(() => {
    if (!locked) return

    const html = document.documentElement
    const body = document.body
    const scrollY = window.scrollY || window.pageYOffset || 0

    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevBodyOverscroll = body.style.overscrollBehavior

    html.style.overflow = "hidden"
    body.style.overflow = "hidden"
    body.style.overscrollBehavior = "none"

    const pin = () => {
      if (Math.abs(window.scrollY - scrollY) > 1) {
        window.scrollTo(0, scrollY)
      }
    }
    const raf = window.requestAnimationFrame(pin)
    const t0 = window.setTimeout(pin, 0)
    const t1 = window.setTimeout(pin, 50)
    const t2 = window.setTimeout(pin, 120)

    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(t0)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      body.style.overscrollBehavior = prevBodyOverscroll
      window.scrollTo(0, scrollY)
    }
  }, [locked])
}
