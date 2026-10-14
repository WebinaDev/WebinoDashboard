"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"

type Slide = { media_url: string; media_type: "image" | "video"; duration?: number | null }
type StoryRow = {
  id?: number
  title: string
  media_url: string
  media_type: "image" | "video"
  slides: Slide[]
  link_url?: string | null
  product_id?: number | null
  sort_order?: number | null
  is_active: boolean
}

const EMPTY: StoryRow = { title: "", media_url: "", media_type: "image", slides: [], is_active: true }

async function upload(file: File): Promise<{ url: string; media_type: "image" | "video" }> {
  const form = new FormData()
  form.append("file", file)
  const res = await api<{ data: { url: string; media_type: "image" | "video" } }>("/api/v1/shop/product-stories/upload", { method: "POST", body: form })
  return res.data
}

function MediaField({ label, url, type, onChange }: { label: string; url: string; type: "image" | "video"; onChange: (url: string, type: "image" | "video") => void }) {
  const t = useTranslations("settings_hub")
  const [busy, setBusy] = useState(false)
  return (
    <div className="grid gap-1">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input dir="ltr" className="max-w-sm" value={url} placeholder="https://…" onChange={(e) => onChange(e.target.value, /\.(mp4|webm)(\?|$)/i.test(e.target.value) ? "video" : type)} />
        <select className="h-9 rounded-md border px-2 text-sm" value={type} onChange={(e) => onChange(url, e.target.value === "video" ? "video" : "image")}>
          <option value="image">{t("shop_stories.image")}</option>
          <option value="video">{t("shop_stories.video")}</option>
        </select>
        <label className="cursor-pointer text-xs text-primary underline">
          {busy ? t("loading") : t("shop_stories.upload")}
          <input
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setBusy(true)
              try {
                const res = await upload(file)
                onChange(res.url, res.media_type)
              } finally {
                setBusy(false)
              }
            }}
          />
        </label>
      </div>
    </div>
  )
}

export function ShopStoriesSettingsPanel() {
  const t = useTranslations("settings_hub")
  const [rows, setRows] = useState<StoryRow[] | null>(null)
  const [editing, setEditing] = useState<StoryRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await api<{ data: { items: StoryRow[] } }>("/api/v1/shop/product-stories").catch(() => null)
    setRows((res?.data?.items ?? []).map((r) => ({ ...r, slides: Array.isArray(r.slides) ? r.slides : [] })))
  }

  useEffect(() => {
    void load()
  }, [])

  async function save() {
    if (!editing) return
    setError(null)
    const json = {
      ...editing,
      slides: editing.slides.filter((s) => s.media_url.trim()),
      link_url: editing.link_url || null,
      product_id: editing.product_id || null,
    }
    try {
      if (editing.id) await api(`/api/v1/shop/product-stories/${editing.id}`, { method: "PATCH", json })
      else await api("/api/v1/shop/product-stories", { method: "POST", json })
      setEditing(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function remove(id: number) {
    await api(`/api/v1/shop/product-stories/${id}`, { method: "DELETE" })
    await load()
  }

  if (!rows) return <p className="text-muted-foreground text-sm">{t("loading")}</p>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("shop_stories.title")}</CardTitle>
          <Button size="sm" onClick={() => setEditing({ ...EMPTY, slides: [] })}>{t("shop_stories.add")}</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 ? <p className="text-muted-foreground text-sm">{t("shop_stories.empty")}</p> : null}
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <div className="text-sm">
                <strong>{r.title}</strong>
                <span className="text-muted-foreground ms-2 text-xs">
                  {t("shop_stories.frames", { count: 1 + r.slides.length })}
                  {r.is_active ? "" : ` · ${t("shop_stories.inactive")}`}
                </span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing({ ...r, slides: [...r.slides] })}>{t("shop_stories.edit")}</Button>
                <Button size="sm" variant="outline" onClick={() => r.id && void remove(r.id)}>{t("shop_stories.delete")}</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing.id ? t("shop_stories.edit") : t("shop_stories.add")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-1">
              <Label>{t("shop_stories.story_title")}</Label>
              <Input className="max-w-sm" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </div>
            <MediaField label={t("shop_stories.cover")} url={editing.media_url} type={editing.media_type} onChange={(media_url, media_type) => setEditing({ ...editing, media_url, media_type })} />
            {editing.slides.map((slide, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-2">
                <MediaField
                  label={t("shop_stories.slide", { n: i + 2 })}
                  url={slide.media_url}
                  type={slide.media_type}
                  onChange={(media_url, media_type) => setEditing({ ...editing, slides: editing.slides.map((s, j) => (j === i ? { ...s, media_url, media_type } : s)) })}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Label>{t("shop_stories.duration")}</Label>
                  <Input type="number" min={2} max={60} className="w-24" value={slide.duration ?? ""} onChange={(e) => setEditing({ ...editing, slides: editing.slides.map((s, j) => (j === i ? { ...s, duration: e.target.value ? Number(e.target.value) : null } : s)) })} />
                  <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => { const next = [...editing.slides]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setEditing({ ...editing, slides: next }) }}>↑</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...editing, slides: editing.slides.filter((_, j) => j !== i) })}>{t("shop_stories.delete")}</Button>
                </div>
              </div>
            ))}
            <div>
              <Button size="sm" variant="outline" disabled={editing.slides.length >= 10} onClick={() => setEditing({ ...editing, slides: [...editing.slides, { media_url: "", media_type: "image" }] })}>
                {t("shop_stories.add_slide")}
              </Button>
            </div>
            <div className="grid gap-1">
              <Label>{t("shop_stories.link")}</Label>
              <Input dir="ltr" className="max-w-sm" value={editing.link_url ?? ""} onChange={(e) => setEditing({ ...editing, link_url: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>{t("shop_stories.sort")}</Label>
              <Input type="number" className="w-24" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })} />
            </div>
            <div className="flex max-w-sm items-center justify-between">
              <Label>{t("shop_stories.active")}</Label>
              <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
            </div>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <div className="flex gap-2">
              <Button size="sm" disabled={!editing.title.trim() || !editing.media_url.trim()} onClick={() => void save()}>{t("shop_stories.save")}</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>{t("shop_stories.cancel")}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
