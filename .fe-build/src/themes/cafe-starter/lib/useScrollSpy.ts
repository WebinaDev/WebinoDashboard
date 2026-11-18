"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Tracks which `#cat-<slug>` section is in view and scrolls to a section with a sticky-nav offset.
 * Also keeps the active chip visible inside a horizontally scrolling nav.
 */
export function useScrollSpy(slugs: string[], offset = 120) {
  const [active, setActive] = useState<string | null>(slugs[0] ?? null)
  const navRef = useRef<HTMLDivElement>(null)
  const lock = useRef(0)
  const key = slugs.join("|")

  useEffect(() => {
    if (typeof window === "undefined" || slugs.length === 0) return
    let frame = 0
    const measure = () => {
      frame = 0
      if (Date.now() < lock.current) return
      let current = slugs[0] ?? null
      for (const slug of slugs) {
        const el = document.getElementById(`cat-${slug}`)
        if (el && el.getBoundingClientRect().top - offset - 24 <= 0) current = slug
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      if (atBottom && window.scrollY > 0) current = slugs[slugs.length - 1] ?? current
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, offset])

  useEffect(() => {
    const nav = navRef.current
    if (!nav || !active) return
    const chip = nav.querySelector<HTMLElement>(`[data-slug="${CSS.escape(active)}"]`)
    if (!chip) return
    const navRect = nav.getBoundingClientRect()
    const chipRect = chip.getBoundingClientRect()
    if (chipRect.left < navRect.left || chipRect.right > navRect.right) {
      nav.scrollBy({ left: chipRect.left - navRect.left - navRect.width / 2 + chipRect.width / 2, behavior: "smooth" })
    }
  }, [active])

  const scrollTo = useCallback(
    (slug: string) => {
      const el = document.getElementById(`cat-${slug}`)
      if (!el) return
      lock.current = Date.now() + 700
      setActive(slug)
      const top = el.getBoundingClientRect().top + window.scrollY - offset + 8
      window.scrollTo({ top, behavior: "smooth" })
    },
    [offset],
  )

  return { active, scrollTo, navRef }
}

/**
 * Staged reveal for `[data-reveal]` cards inside the catalogue shell. Content stays visible without JS (the hide rule
 * only applies once `data-motion="on"` is set), cards already on screen show at once, and cards added later (search,
 * filters, accordion panels) are picked up through a MutationObserver.
 */
export function useReveal() {
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return
    const shell = document.querySelector<HTMLElement>(".cafe-shell.is-catalogue")
    if (!shell) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            ;(entry.target as HTMLElement).dataset.in = "true"
            io.unobserve(entry.target)
          }
        }
      },
      { rootMargin: "0px 0px -6% 0px" },
    )
    const track = () => {
      shell.querySelectorAll<HTMLElement>("[data-reveal]:not([data-in='true'])").forEach((node) => {
        const rect = node.getBoundingClientRect()
        if (rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0) node.dataset.in = "true"
        else io.observe(node)
      })
    }
    track()
    shell.dataset.motion = "on"
    const mo = new MutationObserver(track)
    mo.observe(shell, { childList: true, subtree: true })
    return () => {
      io.disconnect()
      mo.disconnect()
      delete shell.dataset.motion
    }
  }, [])
}
