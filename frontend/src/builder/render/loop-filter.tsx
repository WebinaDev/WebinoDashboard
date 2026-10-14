"use client"

import { useEffect, useId, useState } from "react"

import { LOOP_FILTER_EVENT, parseFilterOptions, type LoopFilterDetail } from "../loop-query"
import { propStr } from "../props"
import type { WidgetNode } from "../types"

type Option = { value: string; label: string }

/** Options from the data source: product categories, a collection select field, or a referenced collection's items. */
function useAutoOptions(source: string, target: string, collection: string, field: string, manual: Option[]): Option[] {
  const [options, setOptions] = useState<Option[]>(manual)
  useEffect(() => {
    if (manual.length) {
      setOptions(manual)
      return
    }
    let cancel = false
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    const headers = { "X-Tenant-Domain": window.location.host }
    const done = (rows: Option[]) => {
      if (!cancel) setOptions(rows.slice(0, 60))
    }
    if (target === "category" && source === "products") {
      void fetch(`${base}/api/v1/public/catalog?per_page=1`, { credentials: "include", headers })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => done((Array.isArray(json?.data?.categories) ? json.data.categories : []).map((c: { slug?: string; name?: string }) => ({ value: String(c.slug ?? ""), label: String(c.name ?? c.slug ?? "") })).filter((o: Option) => o.value)))
        .catch(() => done([]))
    } else if (target === "field" && collection && field) {
      void fetch(`${base}/api/v1/public/builder/collections/${encodeURIComponent(collection)}/items?limit=1`, { credentials: "include", headers })
        .then((res) => (res.ok ? res.json() : null))
        .then(async (json) => {
          const def = (json?.data?.collection?.fields ?? []).find((f: { key: string }) => f.key === field) as { type?: string; options?: string; collection?: string } | undefined
          if (def?.type === "select") return done(parseFilterOptions(def.options ?? ""))
          if ((def?.type === "reference" || def?.type === "multi_reference") && def.collection) {
            const refs = await fetch(`${base}/api/v1/public/builder/collections/${encodeURIComponent(def.collection)}/items?limit=48&sort=title`, { credentials: "include", headers }).then((res) => (res.ok ? res.json() : null))
            return done((refs?.data?.items ?? []).map((i: { slug: string; title: string }) => ({ value: i.slug, label: i.title })))
          }
          if (def?.type === "bool") return done([{ value: "1", label: "بله" }])
          done([])
        })
        .catch(() => done([]))
    } else done([])
    return () => {
      cancel = true
    }
  }, [collection, field, manual, source, target])
  return options
}

/** Loop Filter: buttons / dropdown / checkboxes / search feeding the Loop Grids of the same filter group. */
export function LoopFilterWidget({ widget, editing }: { widget: WidgetNode; editing: boolean }) {
  const group = propStr(widget.props, "filterGroup", "").trim()
  const kind = propStr(widget.props, "kind", "buttons")
  const target = propStr(widget.props, "target", "category")
  const source = propStr(widget.props, "source", "products")
  const field = propStr(widget.props, "field", "").trim()
  const collection = propStr(widget.props, "collection", "").trim()
  const label = propStr(widget.props, "label", "")
  const [manual] = useState(() => parseFilterOptions(propStr(widget.props, "options", "")))
  const options = useAutoOptions(source, target, collection, field, manual)
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const id = useId()

  const publish = (values: string[], q?: string) => {
    if (!group || editing) return
    const value = values.join("|")
    const state: LoopFilterDetail["state"] =
      kind === "search" ? { q: q ?? "" } : target === "category" ? { category: value } : /^[a-z][a-z0-9_]*$/.test(field) ? { filters: { [field]: value } } : {}
    window.dispatchEvent(new CustomEvent<LoopFilterDetail>(LOOP_FILTER_EVENT, { detail: { group, source, state } }))
  }
  const choose = (value: string) => {
    const next = kind === "checkbox" ? (selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]) : selected[0] === value ? [] : [value]
    setSelected(next)
    publish(next)
  }

  useEffect(() => {
    if (kind !== "search") return
    const timer = window.setTimeout(() => publish([], query), 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  if (!group && editing) return <p className="rounded-xl border border-dashed p-3 text-xs text-foreground/60">برای اتصال به لوپ، «گروه فیلتر» را در هر دو ویجت یکسان بنویسید.</p>
  if (kind === "search") {
    return (
      <div role="search" className="grid gap-1">
        {label ? <label htmlFor={id} className="text-sm font-bold">{label}</label> : null}
        <input id={id} type="search" className="h-10 rounded-xl border border-border bg-card px-3 text-sm" value={query} placeholder={propStr(widget.props, "placeholder", "جستجو…")} onChange={(event) => setQuery(event.target.value)} />
      </div>
    )
  }
  if (kind === "select") {
    return (
      <div className="grid gap-1">
        {label ? <label htmlFor={id} className="text-sm font-bold">{label}</label> : null}
        <select id={id} className="h-10 rounded-xl border border-border bg-card px-3 text-sm" value={selected[0] ?? ""} onChange={(event) => { const v = event.target.value; setSelected(v ? [v] : []); publish(v ? [v] : []) }}>
          <option value="">{propStr(widget.props, "allLabel", "همه")}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    )
  }
  if (kind === "checkbox") {
    return (
      <fieldset className="grid gap-1">
        {label ? <legend className="mb-1 text-sm font-bold">{label}</legend> : null}
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(o.value)} onChange={() => choose(o.value)} />
            {o.label}
          </label>
        ))}
      </fieldset>
    )
  }
  return (
    <div role="group" aria-label={label || undefined} className="flex flex-wrap gap-2">
      <button type="button" aria-pressed={selected.length === 0} className={`rounded-full border px-4 py-1.5 text-sm ${selected.length === 0 ? "bg-primary text-primary-foreground" : "bg-card"}`} onClick={() => { setSelected([]); publish([]) }}>
        {propStr(widget.props, "allLabel", "همه")}
      </button>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={selected.includes(o.value)} className={`rounded-full border px-4 py-1.5 text-sm ${selected.includes(o.value) ? "bg-primary text-primary-foreground" : "bg-card"}`} onClick={() => choose(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
