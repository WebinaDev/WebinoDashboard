"use client"

import { ChevronLeft } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { parseRows, propStr } from "../props"
import type { WidgetNode } from "../types"
import { glassClass, glassStyle } from "./glass-tone"

type Cat = { slug: string; name: string }
type Item = { category: string; q: string; a: string }

function asList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>
    if (Array.isArray(o.data)) return o.data
    if (o.data && typeof o.data === "object") {
      const d = o.data as Record<string, unknown>
      if (Array.isArray(d.items)) return d.items
      if (Array.isArray(d.categories)) return d.categories
    }
    if (Array.isArray(o.items)) return o.items
  }
  return []
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

function mapCats(raw: unknown): Cat[] {
  return asList(raw).map((row) => {
    const r = (row || {}) as Record<string, unknown>
    const name = str(r.name_fa) || str(r.name) || str(r.title_fa) || str(r.title) || str(r.slug)
    const slug = str(r.slug) || str(r.id) || name
    return { slug, name }
  }).filter((c) => c.slug && c.name)
}

function mapItems(raw: unknown): Item[] {
  return asList(raw).map((row) => {
    const r = (row || {}) as Record<string, unknown>
    const cat = r.category && typeof r.category === "object"
      ? str((r.category as Record<string, unknown>).slug) || str((r.category as Record<string, unknown>).name_fa)
      : str(r.category) || str(r.category_slug) || str(r.category_name)
    const q = str(r.title_fa) || str(r.title) || str(r.question) || str(r.q)
    const a = str(r.body_fa) || str(r.body) || str(r.answer) || str(r.excerpt_fa) || str(r.a)
    return { category: cat, q, a }
  }).filter((it) => it.q)
}

function manualItems(p: Record<string, unknown>): { cats: Cat[]; items: Item[] } {
  const items = parseRows(p.items, ["category", "q", "a"]).filter((r) => r.q).map((r) => ({ category: r.category, q: r.q, a: r.a }))
  const named = propStr(p, "categories").split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
  const fromItems = [...new Set(items.map((it) => it.category).filter(Boolean))]
  const slugs = named.length ? named : fromItems
  return { cats: slugs.map((name) => ({ slug: name, name })), items }
}

export function FaqCategorizedWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const title = propStr(p, "title", "سؤالات متداول")
  const allLabel = propStr(p, "allLabel", "همه")
  const emptyText = propStr(p, "emptyText", "هنوز پرسشی ثبت نشده است.")
  const live = propStr(p, "source", "live") !== "manual"
  const seed = manualItems(p)
  const [cats, setCats] = useState<Cat[]>(live ? [] : seed.cats)
  const [items, setItems] = useState<Item[]>(live ? [] : seed.items)
  const [cur, setCur] = useState("")
  const [open, setOpen] = useState<number | null>(0)
  const [loading, setLoading] = useState(live)

  useEffect(() => {
    if (!live) { setCats(seed.cats); setItems(seed.items); return }
    let off = false
    setLoading(true)
    Promise.all([
      fetch("/api/v1/public/support/kb/categories", { credentials: "include", headers: { Accept: "application/json" } }).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/v1/public/support/kb?with_body=1", { credentials: "include", headers: { Accept: "application/json" } }).then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([c, k]) => {
      if (off) return
      const nextCats = mapCats(c)
      const nextItems = mapItems(k)
      setCats(nextCats.length ? nextCats : [...new Set(nextItems.map((it) => it.category).filter(Boolean))].map((name) => ({ slug: name, name })))
      setItems(nextItems)
    }).finally(() => { if (!off) setLoading(false) })
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, String(p.items ?? ""), String(p.categories ?? "")])

  const shown = useMemo(() => items.filter((it) => !cur || it.category === cur || it.category === cats.find((c) => c.slug === cur)?.name), [items, cur, cats])
  const json = useMemo(() => {
    if (!shown.length) return ""
    return JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: shown.map((it) => ({ "@type": "Question", name: it.q, acceptedAnswer: { "@type": "Answer", text: it.a } })),
    }).replace(/</g, "\\u003c")
  }, [shown])

  if (!items.length && !loading) {
    return <section className={glassClass(p)} style={glassStyle(p)} dir="rtl"><p className="wb-glass-muted text-sm">{emptyText}</p></section>
  }
  return (
    <section className={glassClass(p, "wb-faq-cat")} style={glassStyle(p)} dir="rtl">
      {title ? <h2 className="mb-4 text-xl font-extrabold">{title}</h2> : null}
      {cats.length ? (
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label={title || allLabel}>
          <button type="button" role="tab" aria-selected={!cur} className={`rounded-full px-3 py-1.5 text-sm font-bold ${!cur ? "wb-glass-cta bg-black/5" : "wb-glass-muted"}`} onClick={() => { setCur(""); setOpen(0) }}>{allLabel}</button>
          {cats.map((c) => (
            <button key={c.slug} type="button" role="tab" aria-selected={cur === c.slug} className={`rounded-full px-3 py-1.5 text-sm font-bold ${cur === c.slug ? "wb-glass-cta bg-black/5" : "wb-glass-muted"}`} onClick={() => { setCur(c.slug); setOpen(0) }}>{c.name}</button>
          ))}
        </div>
      ) : null}
      <div className="wb-glass-card divide-y overflow-hidden rounded-2xl">
        {loading && !items.length ? <p className="wb-glass-muted p-4 text-sm">در حال بارگذاری…</p> : null}
        {shown.map((it, i) => {
          const isOpen = open === i
          return (
            <div key={`${it.q}-${i}`}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)} className="flex w-full items-center justify-between gap-3 p-4 text-start text-sm font-bold">
                <span>{it.q}</span>
                <ChevronLeft size={16} className={`shrink-0 transition-transform ${isOpen ? "-rotate-90" : ""}`} aria-hidden />
              </button>
              {isOpen ? <div className="wb-glass-muted whitespace-pre-wrap px-4 pb-4 text-sm leading-7">{it.a || "ندارد"}</div> : null}
            </div>
          )
        })}
      </div>
      {json ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} /> : null}
    </section>
  )
}
