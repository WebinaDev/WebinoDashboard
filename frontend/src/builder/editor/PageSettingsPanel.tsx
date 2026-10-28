"use client"

import { abVerdict } from "@webina/ui/builder"
import { CalendarClock, Copy, FlaskConical, Globe2, Search, X } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { toLocalInput } from "../props"
import type { BuilderDocument } from "../types"

export type PageSettings = {
  id: number
  slug: string
  status: string
  published: boolean
  has_published: boolean
  seo: SeoFields
  lang: string | null
  translations: { id: number; title: string; slug: string; lang: string | null }[]
  publish_at: string | null
  unpublish_at: string | null
  abilities: { edit: boolean; publish: boolean; design: boolean }
}

type SeoFields = {
  seo_title?: string
  seo_description?: string
  seo_keyword?: string
  noindex?: boolean
  canonical?: string
  seo_og_title?: string
  seo_og_image?: string
  schema_type?: string
  breadcrumb?: boolean
}

const LANGS = ["fa", "en", "ar", "tr", "ku", "az"] as const
const SCHEMA_TYPES = ["WebPage", "AboutPage", "ContactPage", "FAQPage", "CollectionPage", "Article"] as const
type Tab = "seo" | "lang" | "publish" | "ab"

type AbResult = {
  id: number
  variant_page_id: number
  split: number
  status: "running" | "paused"
  views_a: number
  views_b: number
  conversions_a: number
  conversions_b: number
  rate_a: number
  rate_b: number
  z: number
  significant: boolean
}

function toIso(local: string | null | undefined): string | null {
  if (!local) return null
  const date = new Date(local)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Builder page settings: SEO (with search snippet preview), language/translations and publishing controls. */
export function PageSettingsPanel({
  pageId,
  title,
  onClose,
  onDiscarded,
}: {
  pageId: number
  title: string
  onClose: () => void
  onDiscarded: (doc: BuilderDocument) => void
}) {
  const t = useTranslations("builder")
  const locale = useLocale()
  const [tab, setTab] = useState<Tab>("seo")
  const [data, setData] = useState<PageSettings | null>(null)
  const [seo, setSeo] = useState<SeoFields>({})
  const [lang, setLang] = useState<string>("")
  const [translationOf, setTranslationOf] = useState<string>("")
  const [publishAt, setPublishAt] = useState<string>("")
  const [unpublishAt, setUnpublishAt] = useState<string>("")
  const [busy, setBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState("")
  const [pages, setPages] = useState<{ id: number; title: string }[]>([])
  const [ab, setAb] = useState<AbResult | null>(null)
  const [abVariant, setAbVariant] = useState("")
  const [abSplit, setAbSplit] = useState(50)

  useEffect(() => {
    api<AbResult | null>(`/api/v1/builder/pages/${pageId}/ab`)
      .then((row) => {
        if (!row || !row.id) return
        setAb(row)
        setAbVariant(String(row.variant_page_id))
        setAbSplit(row.split)
      })
      .catch(() => undefined)
  }, [pageId])

  async function saveAb(status: "running" | "paused", reset = false) {
    if (!abVariant) return
    const row = await run(
      () => api<AbResult>(`/api/v1/builder/pages/${pageId}/ab`, { method: "PUT", json: { variant_page_id: Number(abVariant), split: abSplit, status, reset } }),
      t("saved"),
    )
    if (row) setAb(row)
  }

  async function stopAb() {
    if (!window.confirm(t("ab_stop_confirm"))) return
    const ok = await run(() => api(`/api/v1/builder/pages/${pageId}/ab`, { method: "DELETE" }), t("ab_stopped"))
    if (ok !== null) setAb(null)
  }

  useEffect(() => {
    api<{ pages?: { id: number; title: string }[] }>("/api/v1/builder")
      .then((row) => setPages(row.pages ?? []))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let cancel = false
    api<PageSettings>(`/api/v1/builder/pages/${pageId}/settings`)
      .then((row) => {
        if (cancel) return
        setData(row)
        setSeo(row.seo ?? {})
        setLang(row.lang ?? "")
        setPublishAt(row.publish_at ? toLocalInput(row.publish_at) : "")
        setUnpublishAt(row.unpublish_at ? toLocalInput(row.unpublish_at) : "")
      })
      .catch(() => toast.error(t("settings_load_failed")))
    return () => {
      cancel = true
    }
  }, [pageId, t])

  async function run<T>(fn: () => Promise<T>, ok: string): Promise<T | null> {
    setBusy(true)
    try {
      const out = await fn()
      toast.success(ok)
      return out
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t("save_failed"))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function saveMeta() {
    const row = await run(
      () => api<PageSettings>(`/api/v1/builder/pages/${pageId}/settings`, {
        method: "PUT",
        json: { seo, lang: lang || null, ...(translationOf ? { translation_of: Number(translationOf) } : {}) },
      }),
      t("saved"),
    )
    if (row) setData(row)
  }

  async function saveSchedule() {
    const row = await run(
      () => api<PageSettings>(`/api/v1/builder/pages/${pageId}/schedule`, { method: "PUT", json: { publish_at: toIso(publishAt), unpublish_at: toIso(unpublishAt) } }),
      t("schedule_saved"),
    )
    if (row) setData(row)
  }

  async function unpublish() {
    if (!window.confirm(t("unpublish_confirm"))) return
    const row = await run(() => api<PageSettings>(`/api/v1/builder/pages/${pageId}/unpublish`, { method: "POST" }), t("unpublished"))
    if (row) setData(row)
  }

  async function discard() {
    if (!window.confirm(t("discard_confirm"))) return
    const row = await run(() => api<PageSettings & { document: BuilderDocument }>(`/api/v1/builder/pages/${pageId}/discard`, { method: "POST" }), t("discarded"))
    if (row?.document) onDiscarded(row.document)
  }

  async function previewLink() {
    const row = await run(() => api<{ token: string }>(`/api/v1/builder/pages/${pageId}/preview-token`, { method: "POST" }), t("preview_link_ready"))
    if (!row) return
    const url = `${window.location.origin}/preview/${row.token}`
    setPreviewUrl(url)
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* clipboard may be blocked; the link is shown below */
    }
  }

  const snippetTitle = seo.seo_title || title
  const snippetDesc = seo.seo_description || t("seo_desc_missing")
  const descLen = (seo.seo_description ?? "").length
  const canPublish = data?.abilities.publish !== false

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={t("page_settings")}>
      <aside className="flex w-[420px] max-w-full flex-col bg-white text-[#0C2D63]">
        <div className="flex items-center justify-between border-b p-3 text-sm font-bold">
          <span>{t("page_settings")}</span>
          <button type="button" aria-label={t("close")} onClick={onClose}><X className="size-4" /></button>
        </div>
        <div className="flex gap-1 border-b p-2 text-xs font-semibold">
          {([["seo", Search], ["lang", Globe2], ["publish", CalendarClock], ["ab", FlaskConical]] as const).map(([id, Icon]) => (
            <button key={id} type="button" className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 ${tab === id ? "bg-[#f7f9fc] text-[#E16BA6]" : ""}`} onClick={() => setTab(id)}>
              <Icon className="size-3.5" aria-hidden />
              {t(`tab_${id}`)}
            </button>
          ))}
        </div>
        {!data ? <p className="p-4 text-xs">{t("loading")}</p> : null}
        {data && tab === "seo" ? (
          <div className="grid gap-2 overflow-auto p-3 text-xs">
            <div className="rounded-xl border p-3" aria-label={t("seo_snippet")}>
              <div className="truncate text-[13px] text-[#1a0dab]">{snippetTitle}</div>
              <div className="truncate text-[11px] text-[#006621]" dir="ltr">{`…/pages/${data.slug}`}</div>
              <div className="line-clamp-2 text-[11px] text-[#545454]">{snippetDesc}</div>
            </div>
            <label className="grid gap-1">{t("seo_title")} <span className="text-[10px] text-[#0C2D63]/50">{(seo.seo_title ?? "").length}/60</span>
              <input className="h-9 rounded-md border px-2" maxLength={120} value={seo.seo_title ?? ""} onChange={(e) => setSeo({ ...seo, seo_title: e.target.value })} />
            </label>
            <label className="grid gap-1">{t("seo_description")} <span className={`text-[10px] ${descLen > 160 ? "text-red-600" : "text-[#0C2D63]/50"}`}>{descLen}/160</span>
              <textarea className="min-h-20 rounded-md border px-2 py-1" maxLength={320} value={seo.seo_description ?? ""} onChange={(e) => setSeo({ ...seo, seo_description: e.target.value })} />
            </label>
            <label className="grid gap-1">{t("seo_keyword")}
              <input className="h-9 rounded-md border px-2" value={seo.seo_keyword ?? ""} onChange={(e) => setSeo({ ...seo, seo_keyword: e.target.value })} />
            </label>
            <label className="grid gap-1">{t("seo_og_title")}
              <input className="h-9 rounded-md border px-2" value={seo.seo_og_title ?? ""} onChange={(e) => setSeo({ ...seo, seo_og_title: e.target.value })} />
            </label>
            <label className="grid gap-1">{t("seo_og_image")}
              <input className="h-9 rounded-md border px-2" dir="ltr" placeholder="https://…" value={seo.seo_og_image ?? ""} onChange={(e) => setSeo({ ...seo, seo_og_image: e.target.value })} />
            </label>
            <label className="grid gap-1">{t("seo_canonical")}
              <input className="h-9 rounded-md border px-2" dir="ltr" placeholder="https://…" value={seo.canonical ?? ""} onChange={(e) => setSeo({ ...seo, canonical: e.target.value })} />
            </label>
            <label className="grid gap-1">{t("seo_schema")}
              <select className="h-9 rounded-md border px-2" value={seo.schema_type ?? "WebPage"} onChange={(e) => setSeo({ ...seo, schema_type: e.target.value })}>
                {SCHEMA_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="flex items-center justify-between">{t("seo_noindex")}<input type="checkbox" checked={seo.noindex === true} onChange={(e) => setSeo({ ...seo, noindex: e.target.checked })} /></label>
            <label className="flex items-center justify-between">{t("seo_breadcrumb")}<input type="checkbox" checked={seo.breadcrumb !== false} onChange={(e) => setSeo({ ...seo, breadcrumb: e.target.checked })} /></label>
            <p className="text-[10px] text-[#0C2D63]/60">{t("seo_slug_hint")}</p>
            <Button type="button" disabled={busy} onClick={() => void saveMeta()}>{t("save")}</Button>
          </div>
        ) : null}
        {data && tab === "lang" ? (
          <div className="grid gap-2 overflow-auto p-3 text-xs">
            <label className="grid gap-1">{t("page_language")}
              <select className="h-9 rounded-md border px-2" value={lang} onChange={(e) => setLang(e.target.value)}>
                <option value="">—</option>
                {LANGS.map((code) => <option key={code} value={code}>{t(`lang_${code}`)}</option>)}
              </select>
            </label>
            <label className="grid gap-1">{t("translation_of")}
              <select className="h-9 rounded-md border px-2" value={translationOf} onChange={(e) => setTranslationOf(e.target.value)}>
                <option value="">—</option>
                {pages.filter((p) => p.id !== pageId).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </label>
            <div className="grid gap-1">
              <div className="font-semibold">{t("translations")}</div>
              {data.translations.length ? data.translations.map((tr) => (
                <a key={tr.id} className="text-[#E16BA6] underline" href={`/dashboard/builder/${tr.id}`} target="_blank" rel="noopener noreferrer">{tr.title} ({tr.lang ?? "—"})</a>
              )) : <span className="text-[#0C2D63]/60">{t("no_translations")}</span>}
            </div>
            <p className="text-[10px] text-[#0C2D63]/60">{t("hreflang_hint")}</p>
            <Button type="button" disabled={busy} onClick={() => void saveMeta()}>{t("save")}</Button>
          </div>
        ) : null}
        {data && tab === "publish" ? (
          <div className="grid gap-3 overflow-auto p-3 text-xs">
            <div>{t("status")}: <b>{data.published ? t("status_published") : t("status_draft")}</b></div>
            <label className="grid gap-1">{t("publish_at")}
              <LocaleDatePicker locale={locale} withTime value={publishAt || null} onChange={(v) => setPublishAt(v ?? "")} aria-label={t("publish_at")} />
            </label>
            <label className="grid gap-1">{t("unpublish_at")}
              <LocaleDatePicker locale={locale} withTime value={unpublishAt || null} onChange={(v) => setUnpublishAt(v ?? "")} aria-label={t("unpublish_at")} />
            </label>
            <p className="text-[10px] text-[#0C2D63]/60">{t("schedule_hint")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy || !canPublish} onClick={() => void saveSchedule()}>{t("save_schedule")}</Button>
              <Button type="button" variant="outline" disabled={busy || !canPublish} onClick={() => { setPublishAt(""); setUnpublishAt("") }}>{t("clear_schedule")}</Button>
            </div>
            <hr />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy || !data.published || !canPublish} onClick={() => void unpublish()}>{t("unpublish")}</Button>
              <Button type="button" variant="outline" disabled={busy || !data.has_published} onClick={() => void discard()}>{t("discard_draft")}</Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void previewLink()}><Copy className="size-3.5" aria-hidden />{t("preview_link")}</Button>
            </div>
            {previewUrl ? <input readOnly dir="ltr" className="h-9 rounded-md border px-2 text-[11px]" value={previewUrl} onFocus={(e) => e.currentTarget.select()} aria-label={t("preview_link")} /> : null}
            <p className="text-[10px] text-[#0C2D63]/60">{t("preview_link_hint")}</p>
            {!canPublish ? <p className="text-[10px] text-red-600">{t("no_publish_permission")}</p> : null}
          </div>
        ) : null}
        {data && tab === "ab" ? (
          <div className="grid gap-3 overflow-auto p-3 text-xs">
            <p className="text-[10px] text-[#0C2D63]/60">{t("ab_hint")}</p>
            <label className="grid gap-1">{t("ab_variant")}
              <select className="h-9 rounded-md border px-2" value={abVariant} onChange={(e) => setAbVariant(e.target.value)}>
                <option value="">—</option>
                {pages.filter((p) => p.id !== pageId).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </label>
            <label className="grid gap-1">{t("ab_split", { pct: abSplit })}
              <input type="range" min={5} max={95} step={5} value={abSplit} onChange={(e) => setAbSplit(Number(e.target.value))} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy || !abVariant || !canPublish} onClick={() => void saveAb("running")}>{ab ? t("save") : t("ab_start")}</Button>
              {ab ? <Button type="button" variant="outline" disabled={busy || !canPublish} onClick={() => void saveAb(ab.status === "running" ? "paused" : "running")}>{ab.status === "running" ? t("ab_pause") : t("ab_resume")}</Button> : null}
              {ab ? <Button type="button" variant="outline" disabled={busy || !canPublish} onClick={() => void saveAb(ab.status, true)}>{t("ab_reset")}</Button> : null}
              {ab ? <Button type="button" variant="outline" disabled={busy || !canPublish} onClick={() => void stopAb()}>{t("ab_stop")}</Button> : null}
            </div>
            {ab ? (
              <table className="w-full text-center">
                <thead><tr><th /><th>{t("ab_views")}</th><th>{t("ab_conversions")}</th><th>{t("ab_rate")}</th></tr></thead>
                <tbody>
                  <tr className="border-t"><td className="py-1 text-start">A</td><td>{ab.views_a}</td><td>{ab.conversions_a}</td><td>{ab.rate_a}٪</td></tr>
                  <tr className="border-t"><td className="py-1 text-start">B</td><td>{ab.views_b}</td><td>{ab.conversions_b}</td><td>{ab.rate_b}٪</td></tr>
                </tbody>
              </table>
            ) : null}
            {ab ? <p className={ab.significant ? "font-semibold text-green-700" : "text-[#0C2D63]/60"}>{ab.significant ? t("ab_significant", { winner: ab.z > 0 ? "B" : "A" }) : t("ab_not_significant")}</p> : null}
            {ab ? <AbLift ab={ab} /> : null}
            <p className="text-[10px] text-[#0C2D63]/60">{t("ab_goal_hint")}</p>
          </div>
        ) : null}
      </aside>
    </div>
  )
}

/** Phase 10: conversion rates and lift of B over A (same z-test as the backend, via @webina/ui). */
function AbLift({ ab }: { ab: { views_a: number; views_b: number; conversions_a: number; conversions_b: number } }) {
  const v = abVerdict({ viewsA: ab.views_a, conversionsA: ab.conversions_a, viewsB: ab.views_b, conversionsB: ab.conversions_b })
  const pct = (n: number) => `${(n * 100).toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪`
  return (
    <p className="text-xs text-[#0C2D63]/70" dir="rtl">
      نرخ تبدیل A: {pct(v.rateA)} · B: {pct(v.rateB)}{v.rateA > 0 ? ` · تغییر: ${v.lift >= 0 ? "+" : ""}${pct(v.lift)}` : ""}
      {v.winner ? ` · برنده: نسخهٔ ${v.winner}` : " · هنوز برنده‌ای مشخص نیست"}
    </p>
  )
}
