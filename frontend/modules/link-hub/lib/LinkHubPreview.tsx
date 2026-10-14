"use client"

import { Monitor, Smartphone } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { LinkHubView, type PublicBlock, type PublicPage } from "./LinkHubView"
import { DAY_KEYS, type LinkHubBlock, type LinkHubProfile, type LinkHubTheme } from "./types"

const DESKTOP_WIDTH = 1280
const MOBILE_WIDTH = 390

function safe(url: unknown): string | null {
  const u = typeof url === "string" ? url.trim() : ""
  if (!u || u === "#") return null
  if (u.startsWith("/") && !u.startsWith("//")) return u
  return /^(https?|tel|mailto|sms):/i.test(u) ? u : null
}

/** Client-side mirror of the server presenter so the preview matches the live page. */
function previewBlocks(blocks: LinkHubBlock[]): PublicBlock[] {
  const out: PublicBlock[] = []
  blocks.forEach((b, i) => {
    if (!b.is_visible) return
    const p = b.payload ?? {}
    const id = b.id ?? -(i + 1)
    switch (b.type) {
      case "cta":
        if (!safe(p.url) || !p.label) return
        break
      case "section":
        if (!p.title) return
        break
      case "image":
        if (!safe(p.url)) return
        break
      case "gallery":
        if (!Array.isArray(p.images) || p.images.length === 0) return
        break
      case "map": {
        const lat = Number(p.lat)
        const lng = Number(p.lng)
        if (p.lat === null || p.lng === null || p.lat === "" || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return
        break
      }
      case "hours": {
        const raw = Array.isArray(p.days) ? (p.days as Array<Record<string, unknown>>) : []
        const byDay = new Map(raw.map((d) => [String(d.day), d]))
        const days = DAY_KEYS.map((day) => {
          const d = byDay.get(day)
          const closed = Boolean(d?.closed)
          const open = typeof d?.open === "string" && /^\d{2}:\d{2}$/.test(d.open) ? d.open : null
          const close = typeof d?.close === "string" && /^\d{2}:\d{2}$/.test(d.close) ? d.close : null
          const known = Boolean(d) && (closed || (open !== null && close !== null && open !== close))
          return { day, open: known && !closed ? open : null, close: known && !closed ? close : null, closed: known && closed, known }
        })
        out.push({ id, type: b.type, payload: { ...p, days, timezone: "Asia/Tehran" } })
        return
      }
    }
    out.push({ id, type: b.type, payload: p })
  })
  return out
}

export function LinkHubPreview({ profile, blocks, theme }: { profile: LinkHubProfile; blocks: LinkHubBlock[]; theme: LinkHubTheme }) {
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile")
  const frame = useRef<HTMLDivElement>(null)
  const [frameWidth, setFrameWidth] = useState(400)

  useEffect(() => {
    if (!frame.current) return
    const ro = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width))
    ro.observe(frame.current)
    return () => ro.disconnect()
  }, [])

  const page: PublicPage = useMemo(
    () => ({
      profile: { title: profile.title || "بدون عنوان", avatar_url: profile.avatar_url, bio: profile.bio, theme_json: theme },
      blocks: previewBlocks(blocks),
    }),
    [profile.title, profile.avatar_url, profile.bio, theme, blocks],
  )

  const width = device === "desktop" ? DESKTOP_WIDTH : MOBILE_WIDTH
  const scale = Math.min(1, frameWidth / width)
  const height = device === "desktop" ? 820 : 760

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1" role="radiogroup" aria-label="اندازهٔ پیش‌نمایش">
          {(
            [
              ["mobile", "موبایل", Smartphone],
              ["desktop", "دسکتاپ", Monitor],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={device === key}
              onClick={() => setDevice(key)}
              className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${device === key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              <Icon size={14} aria-hidden /> {label}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground text-xs">پیش‌نمایش زنده، پیش از ذخیره</span>
      </div>
      <div ref={frame} className="w-full">
        <div
          className="mx-auto overflow-hidden rounded-[1.5rem] border bg-slate-100 shadow-inner"
          style={{ width: width * scale, height: height * scale }}
        >
          <div
            className="lh-preview-canvas overflow-y-auto"
            style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}
            dir="ltr"
          >
            <LinkHubView page={page} handlers={{ preview: true }} />
          </div>
        </div>
      </div>
    </div>
  )
}
