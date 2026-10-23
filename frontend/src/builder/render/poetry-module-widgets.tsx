"use client"

/* Poetry module renderers. Poems come from داشبورد ← بازاریابی ← اشعار (Poetry module public API).
 * Couplet layout: each beyt is two hemistichs side by side on wide screens, stacked on mobile. */

import { useEffect, useMemo, useState } from "react"

import type { WidgetNode } from "../types"
import { useBuilderRuntime } from "./runtime"
import "./poetry-module-widgets.css"

type Term = { id: number; kind: string; slug: string; name: string; description?: string | null; image?: string | null }
type Card = { id: number; slug: string; title: string; excerpt?: string | null; occasion?: Term | null; figures: Term[]; styles: Term[]; style_label?: string | null; pen_name?: string | null; composed_label?: string | null; view_count: number; has_media?: boolean }
type Block = { type: "title" | "stanza" | "refrain"; layout?: "couplet" | "single"; repeat?: number; lines: string[]; note?: string | null; auto?: boolean }
type Poem = Card & { melody_credit?: string | null; flags?: Record<string, boolean>; sequence: Block[]; media: { id: number; url: string; kind: string; mime?: string }[]; external_links: { label?: string; url: string }[]; related: Card[] }

const api = (path: string) => `${(process.env.NEXT_PUBLIC_API_URL?.trim() ?? "").replace(/\/+$/, "").replace(/\/api$/, "")}/api/v1/public/poetry/${path}`
export const fa = (n: number | string) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])
const str = (p: Record<string, unknown>, k: string, f = "") => (typeof p[k] === "string" ? (p[k] as string) : f)
const bool = (p: Record<string, unknown>, k: string, f = true) => (typeof p[k] === "boolean" ? (p[k] as boolean) : f)
const num = (p: Record<string, unknown>, k: string, f: number) => (typeof p[k] === "number" && (p[k] as number) > 0 ? Math.min(50, p[k] as number) : f)

function useJson<T>(path: string | null): { data: T | null; meta: Record<string, number> | null; loading: boolean } {
  const pre = (useBuilderRuntime() as { prefetch?: Record<string, unknown> }).prefetch
  const key = path ? `/v1/public/poetry/${path}` : null
  const seeded = key && pre && key in pre ? { data: pre[key] as T, meta: (pre[`${key}::meta`] as Record<string, number>) ?? null } : null
  const [state, setState] = useState<{ data: T | null; meta: Record<string, number> | null; loading: boolean }>(() => (seeded ? { ...seeded, loading: false } : { data: null, meta: null, loading: !!path }))
  useEffect(() => {
    if (!path || seeded) return
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    fetch(api(path), { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : {}) as Promise<{ data?: unknown; meta?: Record<string, number> }>)
      .then((j) => !cancelled && setState({ data: (j.data ?? null) as T, meta: j.meta ?? null, loading: false }))
      .catch(() => !cancelled && setState({ data: null, meta: null, loading: false }))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])
  return seeded ? { ...seeded, loading: false } : state
}

function useQueryParam(name: string): string {
  const [v, setV] = useState("")
  useEffect(() => { setV(new URLSearchParams(window.location.search).get(name) ?? "") }, [name])
  return v
}

/** Pair lines into beyts (two hemistichs) for couplet layout. */
export function toBeyts(lines: string[]): string[][] {
  const out: string[][] = []
  for (let i = 0; i < lines.length; i += 2) out.push(lines.slice(i, i + 2))
  return out
}

/** Plain text of the performed sequence, used for copy. */
export function poemPlainText(p: Pick<Poem, "title" | "sequence" | "pen_name">): string {
  const parts = [p.title, ""]
  for (const b of p.sequence) {
    if (b.type === "title") continue
    parts.push(...b.lines)
    if ((b.repeat ?? 1) > 1) parts.push(`(${fa(b.repeat ?? 1)} بار)`)
    parts.push("")
  }
  if (p.pen_name) parts.push(p.pen_name)
  return parts.join("\n").trim()
}

const link = (base: string, key: string, slug: string) => `${base || "/"}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(slug)}`

function PoemCards({ items, detailHref }: { items: Card[]; detailHref: string }) {
  if (!items.length) return <p className="wbx-pm-empty">شعری یافت نشد.</p>
  return (
    <ul className="wbx-pm-cards">
      {items.map((c) => (
        <li key={c.id}>
          <a href={link(detailHref, "poem", c.slug)} className="wbx-pm-card">
            <strong>{c.title}</strong>
            {c.excerpt ? <span className="wbx-pm-excerpt">{c.excerpt}</span> : null}
            <span className="wbx-pm-tags">
              {c.occasion ? <em>{c.occasion.name}</em> : null}
              {c.figures.slice(0, 2).map((f) => <em key={f.id}>{f.name}</em>)}
              {c.style_label || c.styles[0]?.name ? <em>{c.style_label || c.styles[0]?.name}</em> : null}
              <small>{fa(c.view_count)} بازدید</small>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

function Pager({ page, last, onPage }: { page: number; last: number; onPage: (n: number) => void }) {
  if (last <= 1) return null
  return (
    <nav className="wbx-pm-pager" aria-label="صفحه‌بندی">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>قبلی</button>
      <span>{fa(page)} از {fa(last)}</span>
      <button type="button" disabled={page >= last} onClick={() => onPage(page + 1)}>بعدی</button>
    </nav>
  )
}

export function PoemDetailWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const qp = useQueryParam("poem")
  const slug = str(p, "slug") || qp
  const { data: poem, loading } = useJson<Poem>(slug ? `poems/${encodeURIComponent(slug)}` : null)
  const [copied, setCopied] = useState(false)
  if (!slug) return <div className="wbx-pm wbx-pm-empty" dir="rtl">شعری انتخاب نشده است.</div>
  if (loading) return <div className="wbx-pm wbx-pm-empty" dir="rtl">در حال بارگذاری…</div>
  if (!poem) return <div className="wbx-pm wbx-pm-empty" dir="rtl">شعر یافت نشد.</div>
  const copy = async () => {
    try { await navigator.clipboard.writeText(poemPlainText(poem)); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* clipboard blocked */ }
  }
  const flags = poem.flags ?? {}
  return (
    <article className="wbx-pm wbx-pm-detail" dir="rtl">
      <header className="wbx-pm-head">
        <h1>{poem.title}</h1>
        {bool(p, "showMeta") ? (
          <div className="wbx-pm-meta">
            {poem.style_label || poem.styles[0]?.name ? <span>{poem.style_label || poem.styles[0]?.name}</span> : null}
            {poem.occasion ? <span>{poem.occasion.name}</span> : null}
            {poem.figures.map((f) => <span key={f.id}>{f.name}</span>)}
            {poem.melody_credit ? <span>{poem.melody_credit}</span> : null}
            {flags.is_new ? <span className="wbx-pm-flag">جدید</span> : null}
            {flags.not_performed ? <span className="wbx-pm-flag">خوانده نشده</span> : null}
            {flags.rewritten ? <span className="wbx-pm-flag">بازنویسی</span> : null}
          </div>
        ) : null}
      </header>
      {bool(p, "showTools") ? (
        <div className="wbx-pm-tools" role="toolbar">
          <button type="button" onClick={copy}>{copied ? "کپی شد ✓" : "کپی متن"}</button>
          <button type="button" onClick={() => window.print()}>چاپ</button>
          <a href={api(`poems/${encodeURIComponent(poem.slug)}/text`)} download>دانلود متن</a>
        </div>
      ) : null}
      <div className="wbx-pm-body">
        {poem.sequence.filter((b) => b.type !== "title").map((b, i) => (
          <section key={i} className={`wbx-pm-block wbx-pm-${b.type}${b.auto ? " is-auto" : ""}`}>
            {b.layout === "single"
              ? b.lines.map((l, j) => <p key={j} className="wbx-pm-line">{l}</p>)
              : toBeyts(b.lines).map((beyt, j) => (
                  <div key={j} className="wbx-pm-beyt">
                    {beyt.map((m, k) => <p key={k} className="wbx-pm-misra">{m}</p>)}
                  </div>
                ))}
            {(b.repeat ?? 1) > 1 ? <span className="wbx-pm-repeat">×{fa(b.repeat ?? 1)}</span> : null}
          </section>
        ))}
      </div>
      {poem.pen_name || poem.composed_label ? (
        <footer className="wbx-pm-sign">{[poem.pen_name, poem.composed_label].filter(Boolean).join(" — ")}</footer>
      ) : null}
      {poem.media.length || poem.external_links.length ? (
        <div className="wbx-pm-media">
          {poem.media.map((m) => m.kind === "video" ? <video key={m.id} src={m.url} controls preload="none" /> : m.kind === "audio" ? <audio key={m.id} src={m.url} controls preload="none" /> : <a key={m.id} href={m.url}>دریافت فایل</a>)}
          {poem.external_links.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noopener noreferrer">{l.label || "مشاهده اجرا"}</a>)}
        </div>
      ) : null}
      {bool(p, "showRelated") && poem.related?.length ? (
        <aside className="wbx-pm-related">
          <h2>اشعار مرتبط</h2>
          <PoemCards items={poem.related} detailHref={typeof window !== "undefined" ? window.location.pathname : "/poem"} />
        </aside>
      ) : null}
    </article>
  )
}

export function PoetryFigureWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const qp = useQueryParam("figure")
  const slug = str(p, "slug") || qp
  const [page, setPage] = useState(1)
  const { data, meta } = useJson<{ figure: Term; poems: Card[] }>(slug ? `figures/${encodeURIComponent(slug)}?page=${page}&per_page=${num(p, "perPage", 12)}` : null)
  if (!slug) return <div className="wbx-pm wbx-pm-empty" dir="rtl">شخصیتی انتخاب نشده است.</div>
  if (!data) return <div className="wbx-pm wbx-pm-empty" dir="rtl">در حال بارگذاری…</div>
  return (
    <section className="wbx-pm wbx-pm-figure" dir="rtl">
      <header className="wbx-pm-figure-head">
        {data.figure.image ? <img src={data.figure.image} alt={data.figure.name} /> : null}
        <div>
          <h1>{data.figure.name}</h1>
          {data.figure.description ? <p>{data.figure.description}</p> : null}
          <small>{fa(meta?.total ?? data.poems.length)} شعر</small>
        </div>
      </header>
      <PoemCards items={data.poems} detailHref={str(p, "detailHref", "/poem")} />
      <Pager page={page} last={meta?.last_page ?? 1} onPage={setPage} />
    </section>
  )
}

export function PoemSearchWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const [q, setQ] = useState("")
  const [debounced, setDebounced] = useState("")
  const [f, setF] = useState({ occasion: "", figure: "", style: "" })
  const [page, setPage] = useState(1)
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 350); return () => clearTimeout(t) }, [q])
  useEffect(() => setPage(1), [debounced, f])
  const { data: terms } = useJson<Term[]>(bool(p, "showFilters") ? "terms" : null)
  const path = useMemo(() => {
    const s = new URLSearchParams({ page: String(page), per_page: String(num(p, "perPage", 12)) })
    if (debounced) s.set("q", debounced)
    Object.entries(f).forEach(([k, v]) => v && s.set(k, v))
    return `poems?${s.toString()}`
  }, [debounced, f, page, p])
  const { data, meta, loading } = useJson<Card[]>(path)
  const of = (kind: string) => (terms ?? []).filter((t) => t.kind === kind)
  return (
    <section className="wbx-pm wbx-pm-search" dir="rtl">
      {str(p, "title") ? <h2>{str(p, "title")}</h2> : null}
      <div className="wbx-pm-filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در عنوان و مصراع‌ها…" aria-label="جستجو" />
        {bool(p, "showFilters") ? (["occasion", "figure", "style"] as const).map((k) => (
          <select key={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-label={k}>
            <option value="">{{ occasion: "همه مناسبت‌ها", figure: "همه شخصیت‌ها", style: "همه سبک‌ها" }[k]}</option>
            {of(k).map((t) => <option key={t.id} value={t.slug}>{t.name}</option>)}
          </select>
        )) : null}
      </div>
      {loading && !data ? <p className="wbx-pm-empty">در حال بارگذاری…</p> : <PoemCards items={data ?? []} detailHref={str(p, "detailHref", "/poem")} />}
      <Pager page={page} last={meta?.last_page ?? 1} onPage={setPage} />
    </section>
  )
}
