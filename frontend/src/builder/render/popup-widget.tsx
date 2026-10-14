"use client"

import { X } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"

import { readRules, rulesAllow } from "../popup-rules"
import { linkAttrs, propBool, propNum, propStr } from "../props"
import type { WidgetNode } from "../types"

const PV_KEY = "wb_pv"
const SESSION_KEY = "wb_sessions"

/** Count page views (per tab session) and sessions (per browser) once per page load. */
let counted = false
function countVisit() {
  if (counted || typeof window === "undefined") return
  counted = true
  try {
    const pv = Number(window.sessionStorage.getItem(PV_KEY) ?? "0") + 1
    window.sessionStorage.setItem(PV_KEY, String(pv))
    if (pv === 1) window.localStorage.setItem(SESSION_KEY, String(Number(window.localStorage.getItem(SESSION_KEY) ?? "0") + 1))
  } catch {
    /* storage disabled */
  }
}

function storage(kind: "local" | "session", key: string): string | null {
  try {
    return (kind === "local" ? window.localStorage : window.sessionStorage).getItem(key)
  } catch {
    return null
  }
}

/** Popup engine: triggers (load, delay, scroll %, scroll to element, click, inactivity, exit intent), rules, layouts, a11y. */
export function PopupWidget({ widget, editing }: { widget: WidgetNode; editing: boolean }) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<Element | null>(null)
  const anchor = (widget.advanced?.cssId || widget.id).replace(/[^\w-]/g, "")
  const storeKey = `wb_popup_${anchor}`
  const trigger = propStr(widget.props, "trigger", "delay")
  const layout = propStr(widget.props, "layout", "modal")
  const overlayClose = propBool(widget.props, "overlayClose", true)

  const show = useCallback((force = false) => {
    const rules = readRules(widget.props)
    const allowed = force || rulesAllow(rules, {
      lastShown: storage("local", storeKey) ? Number(storage("local", storeKey)) : null,
      sessionShown: storage("session", storeKey) === "1",
      pageViews: Number(storage("session", PV_KEY) ?? "1"),
      sessions: Number(storage("local", SESSION_KEY) ?? "1"),
      referrer: typeof document === "undefined" ? "" : document.referrer,
      isMobile: typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
      now: Date.now(),
    })
    if (!allowed) return
    try {
      window.localStorage.setItem(storeKey, String(Date.now()))
      window.sessionStorage.setItem(storeKey, "1")
    } catch {
      /* ignore */
    }
    returnFocus.current = document.activeElement
    setOpen(true)
  }, [storeKey, widget.props])

  const close = useCallback(() => {
    setOpen(false)
    if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus()
  }, [])

  // Links with href="#popup-<id>" open this popup from anywhere ("Open popup" action), bypassing frequency rules.
  useEffect(() => {
    if (editing) return
    countVisit()
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement | null)?.closest?.(`a[href="#popup-${anchor}"]`)
      if (!link) return
      event.preventDefault()
      show(true)
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [anchor, editing, show])

  useEffect(() => {
    if (editing || trigger === "click") return
    if (trigger === "load") {
      show()
      return
    }
    if (trigger === "delay") {
      const timer = window.setTimeout(() => show(), Math.max(0, propNum(widget.props, "delayMs", 2000)))
      return () => window.clearTimeout(timer)
    }
    if (trigger === "scroll") {
      const percent = Math.max(1, Math.min(100, propNum(widget.props, "scrollPercent", 50)))
      const onScroll = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        if (max <= 0 || (window.scrollY / max) * 100 >= percent) {
          window.removeEventListener("scroll", onScroll)
          show()
        }
      }
      window.addEventListener("scroll", onScroll, { passive: true })
      return () => window.removeEventListener("scroll", onScroll)
    }
    if (trigger === "element") {
      const target = document.getElementById(propStr(widget.props, "elementId", "").replace(/^#/, ""))
      if (!target || typeof IntersectionObserver === "undefined") return
      const io = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          io.disconnect()
          show()
        }
      })
      io.observe(target)
      return () => io.disconnect()
    }
    if (trigger === "inactivity") {
      const ms = Math.max(3, propNum(widget.props, "inactivitySec", 30)) * 1000
      let timer = window.setTimeout(() => show(), ms)
      const reset = () => {
        window.clearTimeout(timer)
        timer = window.setTimeout(() => show(), ms)
      }
      const events = ["mousemove", "keydown", "scroll", "touchstart"] as const
      events.forEach((name) => window.addEventListener(name, reset, { passive: true }))
      return () => {
        window.clearTimeout(timer)
        events.forEach((name) => window.removeEventListener(name, reset))
      }
    }
    // exit intent (desktop pointer leaves through the top edge)
    const onLeave = (event: MouseEvent) => {
      if (!event.relatedTarget && event.clientY <= 0) {
        document.removeEventListener("mouseout", onLeave)
        show()
      }
    }
    document.addEventListener("mouseout", onLeave)
    return () => document.removeEventListener("mouseout", onLeave)
  }, [editing, show, trigger, widget.props])

  // Esc + focus trap while open.
  useEffect(() => {
    if (!open) return
    const node = dialogRef.current
    node?.querySelector<HTMLElement>("a,button,input,select,textarea,[tabindex]:not([tabindex='-1'])")?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close()
        return
      }
      if (event.key !== "Tab" || !node) return
      const items = Array.from(node.querySelectorAll<HTMLElement>("a,button,input,select,textarea,[tabindex]:not([tabindex='-1'])"))
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [close, open])

  if (editing) {
    return (
      <div className="rounded-2xl border border-dashed border-primary/50 p-4 text-sm">
        <strong>پاپ‌آپ: {propStr(widget.props, "title", "")}</strong>
        <p className="mt-1 text-xs text-foreground/60">فقط در سایت نمایش داده می‌شود. پیوند باز کردن: <bdi dir="ltr">#popup-{anchor}</bdi></p>
      </div>
    )
  }
  if (!open) return null
  const panel = {
    modal: "w-full max-w-md rounded-3xl",
    "slide-in": "w-full max-w-sm rounded-2xl",
    "bar-top": "w-full rounded-none",
    "bar-bottom": "w-full rounded-none",
    fullscreen: "h-full w-full rounded-none grid place-content-center",
  }[layout] ?? "w-full max-w-md rounded-3xl"
  const position = {
    modal: "grid place-items-center p-4",
    "slide-in": "flex items-end justify-end p-4",
    "bar-top": "flex items-start",
    "bar-bottom": "flex items-end",
    fullscreen: "flex",
  }[layout] ?? "grid place-items-center p-4"
  const backdrop = layout === "modal" || layout === "fullscreen"
  const image = propStr(widget.props, "image", "")
  return (
    <div className={`fixed inset-0 z-50 ${position} ${backdrop ? "bg-black/40" : "pointer-events-none"}`} onClick={backdrop && overlayClose ? close : undefined}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal={backdrop ? "true" : undefined}
        aria-labelledby={`${anchor}-title`}
        className={`pointer-events-auto relative border border-border bg-card p-5 shadow-xl motion-safe:animate-in motion-safe:fade-in ${panel}`}
        onClick={(event) => event.stopPropagation()}
      >
        {propBool(widget.props, "closeButton", true) ? (
          <button type="button" aria-label="بستن" className="absolute end-3 top-3 grid size-8 place-items-center rounded-full hover:bg-muted" onClick={close}><X className="size-4" /></button>
        ) : null}
        {image ? <img src={image} alt="" className="mb-3 max-h-48 w-full rounded-2xl object-cover" /> : null}
        <h3 id={`${anchor}-title`} className="wb-type-h3 pe-8">{propStr(widget.props, "title", "پاپ‌آپ")}</h3>
        <p className="wb-type-body mt-2 text-muted-foreground">{propStr(widget.props, "text", "")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {propStr(widget.props, "cta", "") ? (
            <Link href={propStr(widget.props, "href", "/")} {...linkAttrs(widget.props, "href")} className="wb-btn wb-btn-primary" onClick={close}>
              {propStr(widget.props, "cta", "باشه")}
            </Link>
          ) : null}
          <button type="button" className="wb-btn" onClick={close}>بستن</button>
        </div>
      </div>
    </div>
  )
}
