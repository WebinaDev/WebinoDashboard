"use client"

import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api, ApiError } from "@/lib/api"

const FIELD_TYPES = ["text", "textarea", "richtext", "image", "url", "number", "date"] as const
type FieldDef = { key: string; label: string; type: (typeof FIELD_TYPES)[number] }
type Collection = { id: number; slug: string; name: string; fields: FieldDef[]; items_count?: number }
type Item = { id: number; slug: string; title: string; data: Record<string, string>; published: boolean; sort: number }

const EMPTY_ITEM: Omit<Item, "id"> = { slug: "", title: "", data: {}, published: true, sort: 0 }

/** CMS Collections: define a content type (fields) and manage its items; show them with the Loop Grid widget. */
export default function BuilderCollectionsPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("builder_collections")
  const [collections, setCollections] = useState<Collection[]>([])
  const [active, setActive] = useState<Collection | null>(null)
  const [draft, setDraft] = useState<{ name: string; slug: string; fields: FieldDef[] } | null>(null)
  const [items, setItems] = useState<Item[]>([])
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

  useEffect(() => {
    if (!active) return
    api<Item[]>(`/api/v1/builder/collections/${active.id}/items`).then(setItems).catch(() => setItems([]))
  }, [active])

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
      const body = { name: draft.name, slug: draft.slug, fields: draft.fields }
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
      const body = { title: editing.title, slug: editing.slug, data: editing.data, published: editing.published, sort: editing.sort }
      if (editing.id) await api(`/api/v1/builder/collections/${active.id}/items/${editing.id}`, { method: "PUT", json: body })
      else await api(`/api/v1/builder/collections/${active.id}/items`, { method: "POST", json: body })
      setEditing(null)
      setItems(await api<Item[]>(`/api/v1/builder/collections/${active.id}/items`))
      toast.success(t("saved"))
    })
  }

  return (
    <PageShell
      title={t("title")}
      description={t("subtitle")}
      actions={<Button onClick={() => { setActive(null); setDraft({ name: "", slug: "", fields: [{ key: "text", label: t("default_field"), type: "text" }] }) }}>{t("new_collection")}</Button>}
    >
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="grid content-start gap-2">
          {collections.map((c) => (
            <button key={c.id} type="button" className={`rounded-xl border px-3 py-2 text-start text-sm ${active?.id === c.id ? "border-primary bg-primary/5" : ""}`} onClick={() => { setDraft(null); setEditing(null); setActive(c) }}>
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
                </div>
              ))}
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setDraft({ ...draft, fields: [...draft.fields, { key: "", label: "", type: "text" }] })}>{t("add_field")}</Button>
                <Button type="button" size="sm" disabled={busy} onClick={saveCollection}>{t("save")}</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>{t("cancel")}</Button>
              </div>
              <p className="text-muted-foreground text-xs">{t("fields_hint")}</p>
            </div>
          ) : null}
          {active && !draft ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <strong>{active.name}</strong>
                <span className="text-muted-foreground text-xs" dir="ltr">{active.slug}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => setDraft({ name: active.name, slug: active.slug, fields: active.fields })}>{t("edit_fields")}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ ...EMPTY_ITEM, data: {} })}>{t("new_item")}</Button>
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
                      {field.type === "textarea" || field.type === "richtext" ? (
                        <textarea className="min-h-20 rounded-md border px-2 py-1" value={editing.data[field.key] ?? ""} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, [field.key]: e.target.value } })} />
                      ) : (
                        <input
                          className="h-9 rounded-md border px-2"
                          dir={field.type === "url" || field.type === "image" || field.type === "number" ? "ltr" : undefined}
                          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                          placeholder={field.type === "image" || field.type === "url" ? "https://… یا /…" : undefined}
                          value={editing.data[field.key] ?? ""}
                          onChange={(e) => setEditing({ ...editing, data: { ...editing.data, [field.key]: e.target.value } })}
                        />
                      )}
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })} />{t("published")}</label>
                  <label className="grid gap-1 text-xs">{t("sort")}<input type="number" className="h-9 w-28 rounded-md border px-2" value={editing.sort} onChange={(e) => setEditing({ ...editing, sort: Number(e.target.value) || 0 })} /></label>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={busy || !editing.title.trim()} onClick={saveItem}>{t("save")}</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>{t("cancel")}</Button>
                  </div>
                </div>
              ) : null}
              <table className="w-full text-xs">
                <thead><tr><th className="text-start">{t("item_title")}</th><th>{t("slug")}</th><th>{t("published")}</th><th /></tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="py-2">{item.title}</td>
                      <td className="text-center" dir="ltr">{item.slug}</td>
                      <td className="text-center">{item.published ? "✓" : "—"}</td>
                      <td className="flex justify-end gap-1 py-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ ...item })}>{t("edit")}</Button>
                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => {
                          if (!window.confirm(t("delete_item_confirm"))) return
                          void guard(async () => {
                            await api(`/api/v1/builder/collections/${active.id}/items/${item.id}`, { method: "DELETE" })
                            setItems(items.filter((row) => row.id !== item.id))
                          })
                        }}>{t("delete")}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
          {!active && !draft ? <p className="text-muted-foreground text-xs">{t("pick")}</p> : null}
        </section>
      </div>
    </PageShell>
  )
}
