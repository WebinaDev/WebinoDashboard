"use client"

import { useEffect, useMemo, useState } from "react"

import {
  archiveFiltersFromSearch,
  archiveFiltersToSearch,
  LOOP_FILTER_EVENT,
  parseFilterOptions,
  type ArchiveFilters,
  type LoopFilterDetail,
} from "../loop-query"
import { propBool, propStr } from "../props"
import type { WidgetNode } from "../types"

type Option = { value: string; label: string }

const SORTS: Option[] = [
  { value: "", label: "پیش‌فرض" },
  { value: "newest", label: "جدیدترین" },
  { value: "price_asc", label: "ارزان‌ترین" },
  { value: "price_desc", label: "گران‌ترین" },
  { value: "popular", label: "محبوب‌ترین" },
  { value: "best_selling", label: "پرفروش‌ترین" },
]

/** Toggle one slug inside a comma list. */
function toggle(list: string | undefined, value: string): string {
  const set = new Set((list ?? "").split(",").filter(Boolean))
  if (set.has(value)) set.delete(value)
  else set.add(value)
  return [...set].join(",")
}

/**
 * Advanced archive filters (فیلتر پیشرفته آرشیو): category, price range, tags, attribute terms, in-stock, on-sale, sort.
 * Feeds the product Loop Grids of the same filter group and keeps the URL query in sync (shareable links).
 */
export function ArchiveFiltersWidget({ widget, editing }: { widget: WidgetNode; editing: boolean }) {
  const p = widget.props
  const group = propStr(p, "filterGroup", "").trim()
  const syncUrl = propBool(p, "syncUrl", true)
  const showCategory = propBool(p, "showCategory", true)
  const tagOptions = useMemo(() => parseFilterOptions(propStr(p, "tags", "")), [p])
  const attrOptions = useMemo(() => parseFilterOptions(propStr(p, "attributes", "")).filter((o) => o.value.includes(":")), [p])
  const [categories, setCategories] = useState<Option[]>([])
  const [category, setCategory] = useState("")
  const [q, setQ] = useState("")
  const [archive, setArchive] = useState<ArchiveFilters>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!showCategory) return
    let cancel = false
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    void fetch(`${base}/api/v1/public/catalog?per_page=1`, { credentials: "include", headers: { "X-Tenant-Domain": window.location.host } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancel) return
        const rows = Array.isArray(json?.data?.categories) ? json.data.categories : []
        setCategories(rows.map((c: { slug?: string; name?: string }) => ({ value: String(c.slug ?? ""), label: String(c.name ?? c.slug ?? "") })).filter((o: Option) => o.value).slice(0, 80))
      })
      .catch(() => undefined)
    return () => {
      cancel = true
    }
  }, [showCategory])

  useEffect(() => {
    if (!editing && syncUrl) {
      const initial = archiveFiltersFromSearch(window.location.search, group)
      setCategory(initial.category ?? "")
      setQ(initial.q ?? "")
      setArchive(initial.archive)
    }
    setReady(true)
  }, [editing, group, syncUrl])

  useEffect(() => {
    if (!ready || editing || !group) return
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent<LoopFilterDetail>(LOOP_FILTER_EVENT, { detail: { group, source: "products", state: { category, q, archive } } }))
      if (syncUrl) {
        const search = archiveFiltersToSearch(window.location.search, { category, q, archive }, group)
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`)
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [archive, category, editing, group, q, ready, syncUrl])

  if (!group && editing) return <p className="rounded-xl border border-dashed p-3 text-xs text-foreground/60">«گروه فیلتر» را در این ویجت و ویجت لوپ (منبع محصولات) یکسان بنویسید.</p>
  const set = (patch: Partial<ArchiveFilters>) => setArchive((cur) => ({ ...cur, ...patch }))
  const price = (v: string) => (v ? Math.max(0, Number(v.replace(/[^\d]/g, "")) || 0) || undefined : undefined)
  const active = Boolean(category || q || Object.values(archive).some(Boolean))
  const box = "grid gap-2 border-b border-border pb-3"
  const title = propStr(p, "title", "فیلترها")
  return (
    <aside dir="rtl" aria-label={title} className="grid gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <strong>{title}</strong>
        {active ? (
          <button type="button" className="text-xs text-primary underline" onClick={() => { setCategory(""); setQ(""); setArchive({}) }}>
            حذف همه
          </button>
        ) : null}
      </div>
      {propBool(p, "showSearch", true) ? (
        <input type="search" aria-label="جستجو" className="h-10 rounded-xl border border-border bg-background px-3" placeholder="جستجو در محصولات…" value={q} onChange={(e) => setQ(e.target.value)} />
      ) : null}
      {propBool(p, "showSort", true) ? (
        <label className={box}>
          مرتب‌سازی
          <select className="h-10 rounded-xl border border-border bg-background px-3" value={archive.sort ?? ""} onChange={(e) => set({ sort: e.target.value || undefined })}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      ) : null}
      {showCategory ? (
        <label className={box}>
          دسته‌بندی
          <select className="h-10 rounded-xl border border-border bg-background px-3" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">همه</option>
            {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
      ) : null}
      {propBool(p, "showPrice", true) ? (
        <fieldset className={box}>
          <legend className="mb-1">بازه قیمت ({propStr(p, "currencyLabel", "تومان")})</legend>
          <div className="flex gap-2">
            <input aria-label="از قیمت" inputMode="numeric" dir="ltr" className="h-10 w-full rounded-xl border border-border bg-background px-3" placeholder="از" value={archive.minPrice ?? ""} onChange={(e) => set({ minPrice: price(e.target.value) })} />
            <input aria-label="تا قیمت" inputMode="numeric" dir="ltr" className="h-10 w-full rounded-xl border border-border bg-background px-3" placeholder="تا" value={archive.maxPrice ?? ""} onChange={(e) => set({ maxPrice: price(e.target.value) })} />
          </div>
        </fieldset>
      ) : null}
      {tagOptions.length ? (
        <fieldset className={box}>
          <legend className="mb-1">برچسب‌ها</legend>
          {tagOptions.map((o) => (
            <label key={o.value} className="flex items-center gap-2">
              <input type="checkbox" checked={(archive.tag ?? "").split(",").includes(o.value)} onChange={() => set({ tag: toggle(archive.tag, o.value) || undefined })} />
              {o.label}
            </label>
          ))}
        </fieldset>
      ) : null}
      {attrOptions.length ? (
        <fieldset className={box}>
          <legend className="mb-1">ویژگی‌ها</legend>
          {attrOptions.map((o) => (
            <label key={o.value} className="flex items-center gap-2">
              <input type="checkbox" checked={(archive.attr ?? "").split(",").includes(o.value)} onChange={() => set({ attr: toggle(archive.attr, o.value) || undefined })} />
              {o.label}
            </label>
          ))}
        </fieldset>
      ) : null}
      {propBool(p, "showStock", true) ? (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={Boolean(archive.inStock)} onChange={(e) => set({ inStock: e.target.checked || undefined })} />
          فقط کالاهای موجود
        </label>
      ) : null}
      {propBool(p, "showOnSale", true) ? (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={Boolean(archive.onSale)} onChange={(e) => set({ onSale: e.target.checked || undefined })} />
          فقط تخفیف‌دار
        </label>
      ) : null}
    </aside>
  )
}
