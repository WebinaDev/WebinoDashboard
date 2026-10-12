"use client"

import { useEffect } from "react"

/**
 * Stop the page behind an overlay from scrolling WITHOUT touching html/body overflow
 * or calling scrollTo. Changing overflow on the root (or the position:fixed trick)
 * makes mobile browsers jump to the top while the popup is open and jump back on close.
 * Instead we swallow wheel/touch scrolling that does not happen inside a scrollable
 * area of the open sheet, so the page stays exactly where the user was.
 */
export function useBodyScrollLock(locked: boolean, allowSelector = ".cafe-sheet") {
  useEffect(() => {
    if (!locked || typeof window === "undefined") return

    const canScrollInside = (target: EventTarget | null, deltaY: number) => {
      let el = target instanceof Element ? target : null
      const root = el?.closest(allowSelector)
      if (!root) return false
      while (el && el !== root.parentElement) {
        const style = window.getComputedStyle(el)
        const scrollable = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1
        if (scrollable) {
          if (deltaY < 0 && el.scrollTop > 0) return true
          if (deltaY > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true
          if (deltaY === 0) return true
        }
        el = el.parentElement
      }
      return false
    }

    const onWheel = (e: WheelEvent) => {
      if (!canScrollInside(e.target, e.deltaY)) e.preventDefault()
    }
    let lastY = 0
    const onTouchStart = (e: TouchEvent) => {
      lastY = e.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0
      const deltaY = lastY - y
      lastY = y
      if (!canScrollInside(e.target, deltaY)) e.preventDefault()
    }
    const keys = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "])
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (keys.has(e.key) && !t?.closest(allowSelector)) e.preventDefault()
    }

    const opts: AddEventListenerOptions = { passive: false }
    document.addEventListener("wheel", onWheel, opts)
    document.addEventListener("touchstart", onTouchStart, { passive: true })
    document.addEventListener("touchmove", onTouchMove, opts)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("wheel", onWheel)
      document.removeEventListener("touchstart", onTouchStart)
      document.removeEventListener("touchmove", onTouchMove)
      document.removeEventListener("keydown", onKey)
    }
  }, [locked, allowSelector])
}
