"use client"

import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api, apiDownload, ApiError } from "@/lib/api"

const FIELD_TYPES = ["text", "textarea", "richtext", "image", "url", "number", "date", "bool", "select", "color", "email", "gallery", "file", "reference", "multi_reference"] as const
const SCHEMA_TYPES = ["Thing", "Article", "Person", "Place", "Event", "Organization", "Product", "Service", "Course", "Recipe", "FAQPage", "JobPosting"] as const
type FieldDef = { key: string; label: string; type: (typeof FIELD_TYPES)[number]; options?: string; collection?: string }
type CollectionSeo = { title_template?: string; description_field?: string; image_field?: string; schema_type?: string }
type ItemSeo = { title?: string; description?: string; image?: string; noindex?: boolean }
type Collection = { id: number; slug: string; name: string; fields: FieldDef[]; items_count?: number; seo?: CollectionSeo | null }
type Item = { id: number; slug: string; title: string; data: Record<string, string>; published: boolean; sort: number; seo?: ItemSeo | null }
type Paged = { data: Item[]; meta?: { total: number; page: number; per_page: number; pages: number } }

const EMPTY_ITEM: Omit<Item, "id"> = { slug: "", title: "", data: {}, published: true, sort: 0, seo: {} }
const PER_PAGE = 25

/** CMS Collections: define a content type (fields) and manage its items; show them with the Loop Grid widget. */
export default function BuilderCollectionsPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("builder_collections")
  const [collections, setCollections] = useState<Collection[]>([])
  const [active, setActive] = useState<Collection | null>(null)
  const [draft, setDraft] = useState<{ name: string; slug: string; fields: FieldDef[]; seo: CollectionSeo } | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<number[]>([])
  const [editing, setEditing] = useState<(Omit<Item, "id"> & { id?: number }) | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setCollections(await api<Collection[]>("/api/v1/builder/collections"))
    } catch {
      toast.error(t("load_failed"))
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const loadItems = useCallback(async (collectionId: number, nextPage: number, search: string) => {
    const params = new URLSearchParams({ page: String(nextPage), per_page: String(PER_PAGE) })
    if (search.trim()) params.set("q", search.trim())
    const res = await api<Paged | Item[]>(`/api/v1/builder/collections/${collectionId}/items?${params}`)
    const rows = Array.isArray(res) ? res : res.data
    setItems(rows)
    setSelected([])
    if (!Array.isArray(res) && res.meta) {
      setPages(Math.max(1, res.meta.pages))
      setTotal(res.meta.total)
    } else {
      setPages(1)
      setTotal(rows.length)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => {
      loadItems(active.id, page, q).catch(() => setItems([]))
    }, q ? 300 : 0)
    return () => window.clearTimeout(timer)
  }, [active, page, q, loadItems])

  async function guard(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  function saveCollection() {
    if (!draft) return
    void guard(async () => {
      const body = { name: draft.name, slug: draft.slug, fields: draft.fields, seo: draft.seo }
      const row = active
        ? await api<Collection>(`/api/v1/builder/collections/${active.id}`, { method: "PUT", json: body })
        : await api<Collection>("/api/v1/builder/collections", { method: "POST", json: body })
      setDraft(null)
      setActive(row)
      await load()
      toast.success(t("saved"))
    })
  }

  function saveItem() {
    if (!active || !editing) return
    void guard(async () => {
      const body = { title: editing.title, slug: editing.slug, data: editing.data, published: editing.published, sort: editing.sort, seo: editing.seo ?? {} }
      if (editing.id) await api(`/api/v1/builder/collections/${active.id}/items/${editing.id}`, { method: "PUT", json: body })
      else await api(`/api/v1/builder/collections/${active.id}/items`, { method: "POST", json: body })
      setEditing(null)
      await loadItems(active.id, page, q)
      toast.success(t("saved"))
    })
  }

  function bulk(action: "publish" | "unpublish" | "delete") {
    if (!active || selected.length === 0) return
    if (action === "delete" && !window.confirm(t("bulk_delete_confirm", { count: selected.length }))) return
    void guard(async () => {
      await api(`/api/v1/builder/collections/${active.id}/items/bulk`, { method: "POST", json: { ids: selected, action } })
      await loadItems(active.id, page, q)
      await load()
      toast.success(t("saved"))
    })
  }

  function importCsv(file: File) {
    if (!active) return
    void guard(async () => {
      const form = new FormData()
      form.append("file", file)
      const res = await api<{ created: number; updated: number; skipped: number; truncated?: boolean }>(`/api/v1/builder/collections/${active.id}/import`, { method: "POST", body: form })
      toast.success(t("import_done", { created: res.created, updated: res.updated, skipped: res.skipped }))
      if (res.truncated) toast.warning(t("import_truncated"))
      setPage(1)
      await loadItems(active.id, 1, q)
      await load()
    })
  }

  const refCollections = collections.filter((c) => c.id !== active?.id || !draft)

  return (
    <PageShell
      title={t("title")}
      description={t("subtitle")}
      actions={<Button onClick={() => { setActive(null); setDraft({ name: "", slug: "", fields: [{ key: "text", label: t("default_field"), type: "text" }], seo: { schema_type: "Thing" } }) }}>{t("new_collection")}</Button>}
    >
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="grid content-start gap-2">
          {collections.map((c) => (
            <button key={c.id} type="button" className={`rounded-xl border px-3 py-2 text-start text-sm ${active?.id === c.id ? "border-primary bg-primary/5" : ""}`} onClick={() => { setDraft(null); setEditing(null); setPage(1); setQ(""); setActive(c) }}>
              {c.name} <span className="text-muted-foreground text-xs" dir="ltr">({c.slug} · {c.items_count ?? 0})</span>
            </button>
          ))}
          {collections.length === 0 ? <p className="text-muted-foreground text-xs">{t("empty")}</p> : null}
        </nav>
        <section className="grid content-start gap-4 rounded-2xl border p-4 text-sm">
          {draft ? (
            <div className="grid gap-2">
              <label className="grid gap-1 text-xs">{t("name")}<input className="h-9 rounded-md border px-2" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
              {!active ? <label className="grid gap-1 text-xs">{t("slug")}<input dir="ltr" className="h-9 rounded-md border px-2" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} /></label> : null}
              <div className="text-xs font-semibold">{t("fields")}</div>
              {draft.fields.map((field, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_120px_auto] gap-2">
                  <input aria-label={t("field_key")} dir="ltr" className="h-9 rounded-md border px-2 text-xs" value={field.key} placeholder="photo" onChange={(e) => { const fields = draft.fields.slice(); fields[index] = { ...field, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }; setDraft({ ...draft, fields }) }} />
                  <input aria-label={t("field_label")} className="h-9 rounded-md border px-2 text-xs" value={field.label} onChange={(e) => { const fields = draft.fields.slice(); fields[index] = { ...field, label: e.target.value }; setDraft({ ...draft, fields }) }} />
                  <select aria-label={t("field_type")} className="h-9 rounded-md border px-2 text-xs" value={field.type} onChange={(e) => { const fields = draft.fields.slice(); fields[index] = { ...field, type: e.target.value as FieldDef["type"] }; setDraft({ ...draft, fields }) }}>
                    {FIELD_TYPES.map((type) => <option key={type} value={type}>{t(`type_${type}`)}</option>)}
                  </select>
                  <Button type="button" size="sm" variant="outline" onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_, i) => i !== index) })}>{t("remove")}</Button>
                  {field.type === "select" ? (
                    <textarea aria-label={t("field_options")} placeholder={t("field_options_hint")} className="col-span-4 min-h-16 rounded-md border px-2 py-1 text-xs" value={field.options ?? ""} onChange={(e) => { const fields = draft.fields.slice(); fields[index] = { ...field, options: e.target.value }; setDraft({ ...draft, fields }) }} />
                  ) : null}
                  {field.type === "reference" || field.type === "multi_reference" ? (
                    <select aria-label={t("field_ref_collection")} className="col-span-4 h-9 rounded-md border px-2 text-xs" value={field.collection ?? ""} onChange={(e) => { const fields = draft.fields.slice(); fields[index] = { ...field, collection: e.target.value }; setDraft({ ...draft, fields }) }}>
                      <option value="">{t("field_ref_collection")}</option>
                      {refCollections.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
                    </select>
                  ) : null}
                </div>
              ))}
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setDraft({ ...draft, fields: [...draft.fields, { key: "", label: "", type: "text" }] })}>{t("add_field")}</Button>
                <Button type="button" size="sm" disabled={busy} onClick={saveCollection}>{t("save")}</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>{t("cancel")}</Button>
              </div>
              <p className="text-muted-foreground text-xs">{t("fields_hint")}</p>
              <fieldset className="grid gap-2 rounded-xl border p-3">
                <legend className="px-1 text-xs font-semibold">{t("seo")}</legend>
                <label className="grid gap-1 text-xs">{t("seo_title_template")}<input className="h-9 rounded-md border px-2" placeholder="{title} | {collection}" value={draft.seo.title_template ?? ""} onChange={(e) => setDraft({ ...draft, seo: { ...draft.seo, title_template: e.target.value } })} /></label>
                <label className="grid gap-1 text-xs">{t("seo_description_field")}
                  <select className="h-9 rounded-md border px-2" value={draft.seo.description_field ?? ""} onChange={(e) => setDraft({ ...draft, seo: { ...draft.seo, description_field: e.target.value } })}>
                    <option value="">{t("auto")}</option>
                    {draft.fields.filter((f) => ["text", "textarea", "richtext"].includes(f.type) && f.key).map((f) => <option key={f.key} value={f.key}>{f.label || f.key}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs">{t("seo_image_field")}
                  <select className="h-9 rounded-md border px-2" value={draft.seo.image_field ?? ""} onChange={(e) => setDraft({ ...draft, seo: { ...draft.seo, image_field: e.target.value } })}>
                    <option value="">{t("auto")}</option>
                    {draft.fields.filter((f) => f.type === "image" && f.key).map((f) => <option key={f.key} value={f.key}>{f.label || f.key}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs">{t("seo_schema_type")}
                  <select dir="ltr" className="h-9 rounded-md border px-2" value={draft.seo.schema_type ?? "Thing"} onChange={(e) => setDraft({ ...draft, seo: { ...draft.seo, schema_type: e.target.value } })}>
                    {SCHEMA_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
              </fieldset>
            </div>
          ) : null}
          {active && !draft ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <strong>{active.name}</strong>
                <span className="text-muted-foreground text-xs" dir="ltr">{active.slug}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => setDraft({ name: active.name, slug: active.slug, fields: active.fields, seo: active.seo ?? { schema_type: "Thing" } })}>{t("edit_fields")}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ ...EMPTY_ITEM, data: {}, seo: {} })}>{t("new_item")}</Button>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void guard(() => apiDownload(`/api/v1/builder/collections/${active.id}/export`, `${active.slug}.csv`))}>{t("export_csv")}</Button>
                <label className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs">
                  {t("import_csv")}
                  <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) importCsv(file) }} />
                </label>
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => {
                  if (!window.confirm(t("delete_collection_confirm"))) return
                  void guard(async () => {
                    await api(`/api/v1/builder/collections/${active.id}`, { method: "DELETE" })
                    setActive(null)
                    await load()
                  })
                }}>{t("delete")}</Button>
              </div>
              <p className="text-muted-foreground text-xs">{t("loop_hint", { slug: active.slug })}</p>
              {editing ? (
                <div className="grid gap-2 rounded-xl border p-3">
                  <label className="grid gap-1 text-xs">{t("item_title")}<input className="h-9 rounded-md border px-2" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
                  <label className="grid gap-1 text-xs">{t("slug")}<input dir="ltr" className="h-9 rounded-md border px-2" value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} /></label>
                  {active.fields.map((field) => (
                    <label key={field.key} className="grid gap-1 text-xs">
                      {field.label}
                      <FieldInput field={field} collections={collections} value={editing.data[field.key] ?? ""} onChange={(value) => setEditing({ ...editing, data: { ...editing.data, [field.key]: value } })} />
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })} />{t("published")}</label>
                  <details className="rounded-lg border p-2 text-xs">
                    <summary className="cursor-pointer font-semibold">{t("seo")}</summary>
                    <div className="mt-2 grid gap-2">
                      <label className="grid gap-1">{t("seo_title")}<input className="h-9 rounded-md border px-2" value={editing.seo?.title ?? ""} onChange={(e) => setEditing({ ...editing, seo: { ...editing.seo, title: e.target.value } })} /></label>
                      <label className="grid gap-1">{t("seo_description")}<textarea className="min-h-16 rounded-md border px-2 py-1" maxLength={300} value={editing.seo?.description ?? ""} onChange={(e) => setEditing({ ...editing, seo: { ...editing.seo, description: e.target.value } })} /></label>
                      <label className="grid gap-1">{t("seo_image")}<input dir="ltr" className="h-9 rounded-md border px-2" value={editing.seo?.image ?? ""} onChange={(e) => setEditing({ ...editing, seo: { ...editing.seo, image: e.target.value } })} /></label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(editing.seo?.noindex)} onChange={(e) => setEditing({ ...editing, seo: { ...editing.seo, noindex: e.target.checked } })} />{t("seo_noindex")}</label>
                    </div>
                  </details>
                  <label className="grid gap-1 text-xs">{t("sort")}<input type="number" className="h-9 w-28 rounded-md border px-2" value={editing.sort} onChange={(e) => setEditing({ ...editing, sort: Number(e.target.value) || 0 })} /></label>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={busy || !editing.title.trim()} onClick={saveItem}>{t("save")}</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>{t("cancel")}</Button>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <input type="search" aria-label={t("search")} placeholder={t("search")} className="h-9 w-56 rounded-md border px-2 text-xs" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
                {selected.length ? (
                  <>
                    <span className="text-xs">{t("selected_count", { count: selected.length })}</span>
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => bulk("publish")}>{t("bulk_publish")}</Button>
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => bulk("unpublish")}>{t("bulk_unpublish")}</Button>
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => bulk("delete")}>{t("delete")}</Button>
                  </>
                ) : null}
              </div>
              <table className="w-full text-xs">
                <thead><tr><th className="w-8"><input type="checkbox" aria-label={t("select_all")} checked={items.length > 0 && selected.length === items.length} onChange={(e) => setSelected(e.target.checked ? items.map((i) => i.id) : [])} /></th><th className="text-start">{t("item_title")}</th><th>{t("slug")}</th><th>{t("published")}</th><th /></tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td><input type="checkbox" aria-label={item.title} checked={selected.includes(item.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} /></td>
                      <td className="py-2">{item.title}</td>
                      <td className="text-center" dir="ltr">{item.slug}</td>
                      <td className="text-center">{item.published ? "✓" : "—"}</td>
                      <td className="flex justify-end gap-1 py-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ ...item })}>{t("edit")}</Button>
                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => {
                          if (!window.confirm(t("delete_item_confirm"))) return
                          void guard(async () => {
                            await api(`/api/v1/builder/collections/${active.id}/items/${item.id}`, { method: "DELETE" })
                            await loadItems(active.id, page, q)
                          })
                        }}>{t("delete")}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pages > 1 || total > 0 ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t("total_items", { count: total })}</span>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("prev")}</Button>
                    <span>{page} / {pages}</span>
                    <Button type="button" size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("next")}</Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          {!active && !draft ? <p className="text-muted-foreground text-xs">{t("pick")}</p> : null}
        </section>
      </div>
    </PageShell>
  )
}

/** Value editor per field type; every value is stored as a string (lists: one per line, refs: slugs). */
function FieldInput({ field, collections, value, onChange }: { field: FieldDef; collections: Collection[]; value: string; onChange: (value: string) => void }) {
  const t = useTranslations("builder_collections")
  const [refs, setRefs] = useState<{ slug: string; title: string }[]>([])
  const refSlug = field.type === "reference" || field.type === "multi_reference" ? field.collection ?? "" : ""
  const refId = collections.find((c) => c.slug === refSlug)?.id
  useEffect(() => {
    if (!refId) return
    let cancel = false
    api<Paged | Item[]>(`/api/v1/builder/collections/${refId}/items?per_page=200`)
      .then((res) => { if (!cancel) setRefs(Array.isArray(res) ? res : res?.data ?? []) })
      .catch(() => { if (!cancel) setRefs([]) })
    return () => { cancel = true }
  }, [refId])
  if (field.type === "textarea" || field.type === "richtext" || field.type === "gallery") {
    return <textarea dir={field.type === "gallery" ? "ltr" : undefined} placeholder={field.type === "gallery" ? t("gallery_hint") : undefined} className="min-h-20 rounded-md border px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)} />
  }
  if (field.type === "bool") return <input type="checkbox" checked={value === "1"} onChange={(e) => onChange(e.target.checked ? "1" : "")} />
  if (field.type === "select") {
    const options = (field.options ?? "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => { const [v, l] = line.split("|"); return { value: v.trim(), label: (l ?? v).trim() } })
    return (
      <select className="h-9 rounded-md border px-2" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }
  if (field.type === "reference") {
    return (
      <select className="h-9 rounded-md border px-2" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {refs.map((r) => <option key={r.slug} value={r.slug}>{r.title}</option>)}
      </select>
    )
  }
  if (field.type === "multi_reference") {
    const chosen = value.split("\n").map((v) => v.trim()).filter(Boolean)
    return (
      <div className="flex max-h-40 flex-wrap gap-2 overflow-auto rounded-md border p-2">
        {refs.map((r) => (
          <label key={r.slug} className="flex items-center gap-1">
            <input type="checkbox" checked={chosen.includes(r.slug)} onChange={(e) => onChange((e.target.checked ? [...chosen, r.slug] : chosen.filter((s) => s !== r.slug)).join("\n"))} />
            {r.title}
          </label>
        ))}
        {refs.length === 0 ? <span className="text-muted-foreground">{t("no_refs")}</span> : null}
      </div>
    )
  }
  const ltr = ["url", "image", "number", "email", "file", "color"].includes(field.type)
  const type = field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "color" ? "color" : "text"
  return (
    <input
      className="h-9 rounded-md border px-2"
      dir={ltr ? "ltr" : undefined}
      type={type}
      placeholder={field.type === "image" || field.type === "url" || field.type === "file" ? "https://… یا /…" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
