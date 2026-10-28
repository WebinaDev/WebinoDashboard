"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { quietApi } from "@/builder/storefront/session"

import { PopupCard, type PopupContent } from "./PopupCard"

type PublicPopup = {
  id: number
  content: PopupContent
  trigger: "load" | "delay" | "scroll" | "exit" | "idle"
  trigger_value: number
  targeting?: { include?: string[]; exclude?: string[]; devices?: string[]; audience?: "all" | "guest" | "logged_in"; new_visitors_only?: boolean } | null
  display?: { frequency?: "always" | "session" | "once" | "days"; days?: number; max_views?: number } | null
}

const KEY = "wb_popups"
type Seen = Record<string, { n: number; last: number }>
const readSeen = (): Seen => {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") as Seen } catch { return {} }
}
const globToRe = (g: string) => new RegExp("^" + g.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "/?$")
const matchAny = (path: string, list?: string[]) => (list ?? []).some((g) => g && globToRe(g).test(path))
const loggedIn = () => /(?:^|;\s*)(wb_session|wb_customer|customer_token)=/.test(document.cookie) || !!localStorage.getItem("wb_customer_token")

function eligible(p: PublicPopup, path: string): boolean {
  const t = p.targeting ?? {}
  if (path.startsWith("/dashboard") || path.startsWith("/checkout")) return false
  if (t.include?.length && !matchAny(path, t.include)) return false
  if (matchAny(path, t.exclude)) return false
  const mobile = window.matchMedia("(max-width: 767px)").matches
  if (t.devices?.length && !t.devices.includes(mobile ? "mobile" : "desktop")) return false
  if (t.audience === "guest" && loggedIn()) return false
  if (t.audience === "logged_in" && !loggedIn()) return false
  if (t.new_visitors_only && localStorage.getItem("wb_returning") === "1") return false
  const d = p.display ?? {}
  const s = readSeen()[p.id]
  if (d.max_views && s && s.n >= d.max_views) return false
  switch (d.frequency ?? "session") {
    case "once": return !s
    case "days": return !s || Date.now() - s.last > (d.days ?? 7) * 86400000
    case "session": return sessionStorage.getItem(`${KEY}_${p.id}`) !== "1"
    default: return true
  }
}

const track = (id: number, type: "view" | "click" | "close" | "lead", value?: string) =>
  quietApi(`/api/v1/public/marketing/popups/${id}/event`, { method: "POST", json: { type, value } })

/** Storefront popup runtime: picks the highest-priority eligible popup and arms its trigger. */
export function StorefrontPopups() {
  const path = usePathname() || "/"
  const [all, setAll] = useState<PublicPopup[] | null>(null)
  const [open, setOpen] = useState<PublicPopup | null>(null)
  const shown = useRef(false)

  useEffect(() => {
    void quietApi<{ data?: PublicPopup[] }>("/api/v1/public/marketing/popups").then((r) => setAll(r.ok ? r.data.data ?? [] : []))
    const t = window.setTimeout(() => localStorage.setItem("wb_returning", "1"), 30000)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!all?.length || shown.current) return
    const p = all.find((x) => eligible(x, path))
    if (!p) return
    const fire = () => {
      if (shown.current) return
      shown.current = true
      cleanup()
      setOpen(p)
      const seen = readSeen()
      seen[p.id] = { n: (seen[p.id]?.n ?? 0) + 1, last: Date.now() }
      localStorage.setItem(KEY, JSON.stringify(seen))
      sessionStorage.setItem(`${KEY}_${p.id}`, "1")
      void track(p.id, "view")
    }
    const v = Math.max(0, p.trigger_value || 0)
    const timers: number[] = []
    const off: (() => void)[] = []
    const on = <K extends keyof WindowEventMap>(ev: K, fn: (e: WindowEventMap[K]) => void, target: Window | Document = window) => {
      target.addEventListener(ev, fn as EventListener, { passive: true })
      off.push(() => target.removeEventListener(ev, fn as EventListener))
    }
    const cleanup = () => { timers.forEach((t) => window.clearTimeout(t)); off.forEach((f) => f()) }
    if (p.trigger === "load") fire()
    else if (p.trigger === "delay") timers.push(window.setTimeout(fire, v * 1000))
    else if (p.trigger === "scroll") on("scroll", () => {
      const h = document.documentElement.scrollHeight - window.innerHeight
      if (h <= 0 || (window.scrollY / h) * 100 >= Math.min(100, v || 50)) fire()
    })
    else if (p.trigger === "exit") {
      on("mouseout", (e) => { if (!e.relatedTarget && e.clientY <= 0) fire() }, document)
      if (window.matchMedia("(max-width: 767px)").matches) timers.push(window.setTimeout(fire, 20000))
    } else if (p.trigger === "idle") {
      let t = 0
      const reset = () => { window.clearTimeout(t); t = window.setTimeout(fire, (v || 15) * 1000) }
      ;(["mousemove", "keydown", "scroll", "touchstart"] as const).forEach((ev) => on(ev, reset))
      reset()
      off.push(() => window.clearTimeout(t))
    }
    return cleanup
  }, [all, path])

  if (!open) return null
  const pos = open.content.position ?? "center"
  const close = () => { void track(open.id, "close"); setOpen(null) }
  const wrap =
    pos === "center" ? "fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
    : pos === "bottom" ? "fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3"
    : "fixed bottom-4 right-4 z-[60]"
  return (
    <div className={`${wrap} print:hidden`} role="dialog" aria-modal={pos === "center"} onClick={pos === "center" ? (e) => e.target === e.currentTarget && close() : undefined}>
      <PopupCard
        content={open.content}
        onClose={close}
        onCta={() => void track(open.id, "click")}
        onLead={async (val) => (await track(open.id, "lead", val)).ok}
      />
    </div>
  )
}
