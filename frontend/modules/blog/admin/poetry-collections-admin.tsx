"use client"

/* Poetry books (poem collections) and highlights (story-like image or 16:9 video items).
   API: /api/v1/poetry/books, /api/v1/poetry/highlights. */

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { MediaPickerField } from "@/components/content/MediaPickerField"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

import { poetryApi, poetryError, type PoetryPoemRow } from "./poetry-api"

const fail = (e: unknown) => toast.error(poetryError(e))
const rows = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

type Book = {
  id?: number
  slug?: string
  title: string
  subtitle: string
  description: string
  cover: string
  publisher: string
  published_label: string
  purchase_url: string
  cta_label: string
  is_premium: boolean
  status: "draft" | "published"
  sort: number
  poem_ids: number[]
  poems_count?: number
}
const emptyBook = (): Book => ({ title: "", subtitle: "", description: "", cover: "", publisher: "", published_label: "", purchase_url: "", cta_label: "", is_premium: false, status: "published", sort: 0, poem_ids: [] })

export function PoetryBooksAdmin() {
  const t = useTranslations("poetry_admin")
  const [list, setList] = useState<Book[]>([])
  const [poems, setPoems] = useState<PoetryPoemRow[]>([])
  const [f, setF] = useState<Book | null>(null)
  const [pick, setPick] = useState("")

  const load = useCallback(() => {
    poetryApi.get("/v1/poetry/books").then((r) => setList(rows<Book>(r.data.data))).catch(fail)
  }, [])
  useEffect(load, [load])
  useEffect(() => {
    poetryApi.get("/v1/poetry/poems", { params: { status: "published" } }).then((r) => setPoems(rows<PoetryPoemRow>(r.data.data))).catch(() => undefined)
  }, [])

  async function open(id: number) {
    try {
      const r = await poetryApi.get(`/v1/poetry/books/${id}`)
      const d = r.data.data as Record<string, unknown>
      setF({ ...emptyBook(), ...(Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null)) as Partial<Book>) })
    } catch (e) {
      fail(e)
    }
  }

  async function save() {
    if (!f) return
    try {
      if (f.id) await poetryApi.put(`/v1/poetry/books/${f.id}`, f)
      else await poetryApi.post("/v1/poetry/books", f)
      toast.success(t("saved"))
      setF(null)
      load()
    } catch (e) {
      fail(e)
    }
  }

  async function remove(b: Book) {
    if (!b.id || !window.confirm(b.title)) return
    await poetryApi.delete(`/v1/poetry/books/${b.id}`).catch(fail)
    load()
  }

  const set = <K extends keyof Book>(k: K, v: Book[K]) => setF((p) => (p ? { ...p, [k]: v } : p))
  const title = (id: number) => poems.find((p) => p.id === id)?.title ?? `#${id}`

  return (
    <PageShell title={t("books_title")} description={t("books_subtitle")} actions={<Button onClick={() => setF(emptyBook())}>{t("new_book")}</Button>}>
      {f ? (
        <Card>
          <CardHeader><CardTitle>{f.id ? f.title : t("new_book")}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1"><Label>{t("book_title")}</Label><Input value={f.title} onChange={(e) => set("title", e.target.value)} /></div>
            <div className="grid gap-1"><Label>{t("book_subtitle")}</Label><Input value={f.subtitle} onChange={(e) => set("subtitle", e.target.value)} /></div>
            <div className="grid gap-1 md:col-span-2"><Label>{t("book_description")}</Label><Textarea rows={4} value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
            <MediaPickerField label={t("book_cover")} imageUrl={f.cover} accept="image" onPick={(m) => set("cover", m.url)} onClear={() => set("cover", "")} />
            <div className="grid content-start gap-3">
              <div className="grid gap-1"><Label>{t("book_publisher")}</Label><Input value={f.publisher} onChange={(e) => set("publisher", e.target.value)} /></div>
              <div className="grid gap-1"><Label>{t("book_published_label")}</Label><Input value={f.published_label} onChange={(e) => set("published_label", e.target.value)} /></div>
              <div className="grid gap-1"><Label>{t("book_cta_label")}</Label><Input value={f.cta_label} onChange={(e) => set("cta_label", e.target.value)} /></div>
              <div className="grid gap-1"><Label>{t("book_purchase_url")}</Label><Input dir="ltr" value={f.purchase_url} onChange={(e) => set("purchase_url", e.target.value)} /></div>
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label>{t("book_poems")}</Label>
              <div className="flex gap-2">
                <select className="h-9 flex-1 rounded-md border bg-transparent px-2" value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">{t("book_pick_poem")}</option>
                  {poems.filter((p) => !f.poem_ids.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
                <Button variant="outline" disabled={!pick} onClick={() => { set("poem_ids", [...f.poem_ids, Number(pick)]); setPick("") }}>{t("add")}</Button>
              </div>
              <ol className="grid gap-1 text-sm">
                {f.poem_ids.map((id, i) => (
                  <li key={id} className="flex items-center gap-2 rounded border px-2 py-1">
                    <span className="flex-1">{i + 1}. {title(id)}</span>
                    <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => { const n = [...f.poem_ids]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set("poem_ids", n) }}>↑</Button>
                    <Button size="sm" variant="ghost" onClick={() => set("poem_ids", f.poem_ids.filter((x) => x !== id))}>✕</Button>
                  </li>
                ))}
              </ol>
            </div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.status === "published"} onCheckedChange={(v) => set("status", v ? "published" : "draft")} />{t("status_published")}</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.is_premium} onCheckedChange={(v) => set("is_premium", v)} />{t("premium")}</label>
            <div className="flex gap-2 md:col-span-2">
              <Button disabled={!f.title} onClick={() => void save()}>{t("save")}</Button>
              <Button variant="outline" onClick={() => setF(null)}>{t("cancel")}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((b) => (
          <Card key={b.id}>
            <CardContent className="grid gap-2 pt-4">
              {b.cover ? <img src={b.cover} alt="" className="aspect-[3/4] w-full rounded object-cover" /> : null}
              <strong>{b.title}</strong>
              <span className="text-xs text-muted-foreground">{t("book_poems_count", { count: b.poems_count ?? 0 })}{b.is_premium ? ` · ${t("premium")}` : ""}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => b.id && void open(b.id)}>{t("edit")}</Button>
                <Button size="sm" variant="outline" onClick={() => void remove(b)}>{t("delete")}</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {list.length === 0 ? <p className="text-sm text-muted-foreground">{t("no_books")}</p> : null}
      </div>
    </PageShell>
  )
}

type Highlight = {
  id?: number
  title: string
  kind: "image" | "video"
  file_url: string
  external_url: string
  cover: string
  link_url: string
  link_label: string
  duration: string
  is_premium: boolean
  status: "draft" | "published"
  sort: number
}
const emptyHighlight = (): Highlight => ({ title: "", kind: "video", file_url: "", external_url: "", cover: "", link_url: "", link_label: "", duration: "", is_premium: false, status: "published", sort: 0 })

export function PoetryHighlightsAdmin() {
  const t = useTranslations("poetry_admin")
  const [list, setList] = useState<(Highlight & { url?: string | null })[]>([])
  const [f, setF] = useState<Highlight | null>(null)
  const load = useCallback(() => {
    poetryApi.get("/v1/poetry/highlights").then((r) => setList(rows(r.data.data))).catch(fail)
  }, [])
  useEffect(load, [load])
  const set = <K extends keyof Highlight>(k: K, v: Highlight[K]) => setF((p) => (p ? { ...p, [k]: v } : p))

  async function save() {
    if (!f) return
    try {
      if (f.id) await poetryApi.put(`/v1/poetry/highlights/${f.id}`, f)
      else await poetryApi.post("/v1/poetry/highlights", f)
      toast.success(t("saved"))
      setF(null)
      load()
    } catch (e) {
      fail(e)
    }
  }

  const edit = (h: Highlight & { url?: string | null }) =>
    setF({ ...emptyHighlight(), ...(Object.fromEntries(Object.entries(h).filter(([, v]) => v !== null)) as Partial<Highlight>), file_url: h.file_url ?? h.url ?? "" })

  return (
    <PageShell title={t("highlights_title")} description={t("highlights_subtitle")} actions={<Button onClick={() => setF(emptyHighlight())}>{t("new_highlight")}</Button>}>
      {f ? (
        <Card>
          <CardHeader><CardTitle>{f.id ? f.title : t("new_highlight")}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1"><Label>{t("highlight_title")}</Label><Input value={f.title} onChange={(e) => set("title", e.target.value)} /></div>
            <div className="grid gap-1">
              <Label>{t("highlight_kind")}</Label>
              <select className="h-9 rounded-md border bg-transparent px-2" value={f.kind} onChange={(e) => set("kind", e.target.value as Highlight["kind"])}>
                <option value="video">{t("highlight_kind_video")}</option>
                <option value="image">{t("highlight_kind_image")}</option>
              </select>
            </div>
            <MediaPickerField label={f.kind === "video" ? t("video_file") : t("highlight_image")} imageUrl={f.file_url} accept={f.kind === "video" ? "video" : "image"} onPick={(m) => set("file_url", m.url)} onClear={() => set("file_url", "")} />
            <MediaPickerField label={t("media_cover")} imageUrl={f.cover} accept="image" onPick={(m) => set("cover", m.url)} onClear={() => set("cover", "")} />
            <div className="grid gap-1"><Label>{t("highlight_external")}</Label><Input dir="ltr" value={f.external_url} onChange={(e) => set("external_url", e.target.value)} /></div>
            <div className="grid gap-1"><Label>{t("duration")}</Label><Input dir="ltr" placeholder="00:45" value={f.duration} onChange={(e) => set("duration", e.target.value)} /></div>
            <div className="grid gap-1"><Label>{t("highlight_link")}</Label><Input dir="ltr" value={f.link_url} onChange={(e) => set("link_url", e.target.value)} /></div>
            <div className="grid gap-1"><Label>{t("highlight_link_label")}</Label><Input value={f.link_label} onChange={(e) => set("link_label", e.target.value)} /></div>
            <div className="grid gap-1"><Label>{t("sort")}</Label><Input dir="ltr" type="number" min={0} value={f.sort} onChange={(e) => set("sort", Number(e.target.value) || 0)} /></div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm"><Switch checked={f.status === "published"} onCheckedChange={(v) => set("status", v ? "published" : "draft")} />{t("status_published")}</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={f.is_premium} onCheckedChange={(v) => set("is_premium", v)} />{t("premium")}</label>
            </div>
            <p className="text-xs text-muted-foreground md:col-span-2">{t("highlight_hint")}</p>
            <div className="flex gap-2 md:col-span-2">
              <Button disabled={!f.title} onClick={() => void save()}>{t("save")}</Button>
              <Button variant="outline" onClick={() => setF(null)}>{t("cancel")}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {list.map((h) => (
          <Card key={h.id}>
            <CardContent className="grid gap-2 pt-4">
              {h.cover ? <img src={h.cover} alt="" className="aspect-video w-full rounded object-cover" /> : <div className="aspect-video w-full rounded bg-muted" />}
              <strong>{h.title}</strong>
              <span className="text-xs text-muted-foreground">{h.kind === "video" ? t("highlight_kind_video") : t("highlight_kind_image")}{h.is_premium ? ` · ${t("premium")}` : ""}{h.status === "draft" ? ` · ${t("status_draft")}` : ""}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => edit(h)}>{t("edit")}</Button>
                <Button size="sm" variant="outline" onClick={() => { if (h.id && window.confirm(h.title)) void poetryApi.delete(`/v1/poetry/highlights/${h.id}`).then(load).catch(fail) }}>{t("delete")}</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {list.length === 0 ? <p className="text-sm text-muted-foreground">{t("no_highlights")}</p> : null}
      </div>
    </PageShell>
  )
}
