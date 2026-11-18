"use client"

import { useEffect, useState } from "react"

import { quietApi } from "@/builder/storefront/session"

type Widget = { provider: "bale" | "telegram"; url: string; greeting: string; position: "bottom-left" | "bottom-right" }

const LABEL: Record<Widget["provider"], string> = { bale: "بله", telegram: "تلگرام" }
const COLOR: Record<Widget["provider"], string> = { bale: "#00a99d", telegram: "#229ED9" }

/** Floating "chat on Bale/Telegram" button (bots site_widget add-on). Renders nothing unless enabled. */
export function BotSiteWidget() {
  const [items, setItems] = useState<Widget[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void quietApi<{ data?: Widget[] }>("/api/v1/public/bots/widget").then((res) => {
      if (res.ok) setItems(res.data.data ?? [])
    })
  }, [])

  if (!items.length) return null
  const side = items[0].position === "bottom-right" ? "right-4" : "left-4"
  const greeting = items.find((i) => i.greeting)?.greeting

  return (
    <div className={`fixed bottom-4 ${side} z-40 flex flex-col items-start gap-2 print:hidden`} dir="rtl">
      {open ? (
        <div className="w-64 rounded-xl border bg-white p-3 text-sm shadow-lg">
          {greeting ? <p className="mb-2 text-slate-700">{greeting}</p> : null}
          <div className="flex flex-col gap-2">
            {items.map((w) => (
              <a
                key={w.provider}
                href={w.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg px-3 py-2 text-center font-medium text-white"
                style={{ background: COLOR[w.provider] }}
              >
                گفتگو در {LABEL[w.provider]}
              </a>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        aria-label="گفتگو با ما"
        onClick={() => setOpen((v) => !v)}
        className="flex size-12 items-center justify-center rounded-full text-white shadow-lg"
        style={{ background: COLOR[items[0].provider] }}
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
          <path d="M12 3C6.5 3 2 6.9 2 11.7c0 2.6 1.3 4.9 3.4 6.5L4.6 22l4.2-2.1c1 .3 2.1.4 3.2.4 5.5 0 10-3.9 10-8.6S17.5 3 12 3z" />
        </svg>
      </button>
    </div>
  )
}
