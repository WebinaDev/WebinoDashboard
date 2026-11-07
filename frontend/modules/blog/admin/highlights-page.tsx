"use client"

import { ChevronDown, ChevronUp, Plus, Sparkles, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { MediaPickerField } from "@/components/content/MediaPickerField"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"

import "./poetry-admin.css"

type Frame = { media_url: string; media_type: "image" | "video"; duration?: number | null }

type StoryRow = {
  id?: number
  title: string
  media_url: string
  media_type: "image" | "video"
  slides: Frame[]
  link_url?: string | null
  sort_order?: number | null
  is_active: boolean
}

const EMPTY: StoryRow = {
  title: "",
  media_url: "",
  media_type: "image",
  slides: [],
  link_url: "",
  sort_order: 0,
  is_active: true,
}

function mediaTypeFromPick(url: string, mime?: string | null): "image" | "video" {
  if (mime?.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url)) return "video"
  return "image"
}

function framesOf(row: StoryRow): Frame[] {
  return [{ media_url: row.media_url, media_type: row.media_type }, ...(Array.isArray(row.slides) ? row.slides : [])]
}

function rowFromFrames(row: StoryRow, frames: Frame[]): StoryRow {
  const [cover, ...rest] = frames
  return {
    ...row,
    media_url: cover?.media_url ?? "",
    media_type: cover?.media_type ?? "image",
    slides: rest.filter((frame) => frame.media_url.trim()),
  }
}

export default function HighlightsPage(_props: { route?: ResolvedAdminRoute }) {
  const t = useTranslations("highlights_admin")
  const locale = useLocale()
  const dir = locale === "fa" ? "rtl" : "ltr"
  const { confirm, dialog } = useConfirm()
  const [rows, setRows] = useState<StoryRow[] | null>(null)
  const [editing, setEditing] = useState<StoryRow | null>(null)
  const [frames, setFrames] = useState<Frame[]>([])
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all")
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<{ data: { items: StoryRow[] } }>("/api/v1/shop/product-stories")
      .then((res) =>
        setRows(
          (res.data?.items ?? []).map((row) => ({
            ...row,
            slides: Array.isArray(row.slides) ? row.slides : [],
          })),
        ),
      )
      .catch((e) => {
        setRows([])
        toast.error(e instanceof Error ? e.message : String(e))
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const stats = useMemo(() => {
    const list = rows ?? []
    return {
      total: list.length,
      active: list.filter((row) => row.is_active).length,
      inactive: list.filter((row) => !row.is_active).length,
    }
  }, [rows])

  const visible = useMemo(() => {
    const query = q.trim()
    return (rows ?? []).filter((row) => {
      if (filter === "active" && !row.is_active) return false
      if (filter === "inactive" && row.is_active) return false
      if (!query) return true
      return row.title.includes(query) || (row.link_url ?? "").includes(query)
    })
  }, [rows, filter, q])

  function openNew() {
    setEditing({ ...EMPTY })
    setFrames([{ media_url: "", media_type: "image" }])
  }

  function openEdit(row: StoryRow) {
    setEditing({ ...row, slides: [...row.slides] })
    setFrames(framesOf(row).map((frame) => ({ ...frame })))
  }

  async function save() {
    if (!editing) return
    const next = rowFromFrames(editing, frames)
    if (!next.title.trim() || !next.media_url.trim()) return
    setBusy(true)
    const json = {
      ...next,
      link_url: next.link_url?.trim() || null,
      sort_order: Number(next.sort_order) || 0,
    }
    try {
      if (next.id) await api(`/api/v1/shop/product-stories/${next.id}`, { method: "PATCH", json })
      else await api("/api/v1/shop/product-stories", { method: "POST", json })
      toast.success(t("saved"))
      setEditing(null)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function remove(row: StoryRow) {
    if (!row.id) return
    confirm({
      title: t("confirm_delete"),
      description: row.title,
      onConfirm: async () => {
        await api(`/api/v1/shop/product-stories/${row.id}`, { method: "DELETE" })
        toast.success(t("deleted"))
        load()
      },
    })
  }

  if (editing) {
    return (
      <PageShell
        eyebrow={t("eyebrow")}
        title={editing.id ? t("edit") : t("add")}
        description={t("editor_hint")}
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={() => void save()} disabled={busy || !editing.title.trim() || !frames[0]?.media_url.trim()}>
              {t("save")}
            </Button>
          </div>
        }
      >
        <div className="poem-desk" dir={dir}>
          <div className="poem-desk__layout poem-desk__layout--media">
            <section className="poem-manuscript space-y-4">
              <label className="poem-field">
                <span>{t("story_title")}</span>
                <input
                  className="poem-title-input"
                  style={{ fontSize: "clamp(1.35rem, 2.4vw, 1.85rem)", minHeight: "1.8em" }}
                  value={editing.title}
                  placeholder={t("title_ph")}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </label>
              <div className="poem-manuscript__rule" aria-hidden />
              <div className="space-y-3">
                {frames.map((frame, index) => (
                  <div key={index} className="rounded-xl border border-border bg-background/40 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{index === 0 ? t("cover") : t("slide", { n: index + 1 })}</p>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={index === 0}
                          onClick={() => {
                            const next = [...frames]
                            ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
                            setFrames(next)
                          }}
                          aria-label={t("move_up")}
                        >
                          <ChevronUp className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={index === frames.length - 1}
                          onClick={() => {
                            const next = [...frames]
                            ;[next[index + 1], next[index]] = [next[index], next[index + 1]]
                            setFrames(next)
                          }}
                          aria-label={t("move_down")}
                        >
                          <ChevronDown className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={frames.length === 1}
                          onClick={() => setFrames(frames.filter((_, i) => i !== index))}
                          aria-label={t("delete")}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <MediaPickerField
                      label={t("media")}
                      imageUrl={frame.media_url}
                      accept="all"
                      mime={frame.media_type === "video" ? "video/mp4" : undefined}
                      onPick={(item) =>
                        setFrames(
                          frames.map((itemFrame, i) =>
                            i === index
                              ? { ...itemFrame, media_url: item.url, media_type: mediaTypeFromPick(item.url, item.mime) }
                              : itemFrame,
                          ),
                        )
                      }
                      onClear={() =>
                        setFrames(frames.map((itemFrame, i) => (i === index ? { ...itemFrame, media_url: "", media_type: "image" } : itemFrame)))
                      }
                    />
                    {index > 0 && frame.media_type === "image" ? (
                      <label className="poem-field mt-3">
                        <span>{t("duration")}</span>
                        <input
                          dir="ltr"
                          type="number"
                          min={2}
                          max={60}
                          value={frame.duration ?? ""}
                          onChange={(e) =>
                            setFrames(
                              frames.map((itemFrame, i) =>
                                i === index ? { ...itemFrame, duration: e.target.value ? Number(e.target.value) : null } : itemFrame,
                              ),
                            )
                          }
                        />
                      </label>
                    ) : null}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={frames.length >= 11}
                onClick={() => setFrames([...frames, { media_url: "", media_type: "image" }])}
              >
                <Plus className="size-4" />
                {t("add_slide")}
              </Button>
            </section>
            <aside className="poem-side">
              <div className="poem-side__panel" data-open="true">
                <p className="poem-side__trigger">{t("panel_link")}</p>
                <div className="poem-side__body space-y-3">
                  <label className="poem-field">
                    <span>{t("link")}</span>
                    <input
                      dir="ltr"
                      placeholder="/poems/sample"
                      value={editing.link_url ?? ""}
                      onChange={(e) => setEditing({ ...editing, link_url: e.target.value })}
                    />
                    <span className="text-muted-foreground text-xs">{t("link_hint")}</span>
                  </label>
                  <label className="poem-field">
                    <span>{t("sort")}</span>
                    <input
                      dir="ltr"
                      type="number"
                      min={0}
                      value={editing.sort_order ?? 0}
                      onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm">{t("active")}</span>
                    <Switch checked={editing.is_active} onCheckedChange={(value) => setEditing({ ...editing, is_active: value })} />
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      title={t("title")}
      description={t("description")}
      actions={
        <Button type="button" onClick={openNew}>
          <Sparkles className="size-4" />
          {t("add")}
        </Button>
      }
    >
      <div className="poem-desk" dir={dir}>
        <ListStatsStrip
          className="mb-4"
          items={[
            { id: "total", label: t("stat_total"), value: stats.total },
            { id: "active", label: t("stat_active"), value: stats.active },
            { id: "inactive", label: t("stat_inactive"), value: stats.inactive },
          ]}
        />
        <div className="poem-filter-bar">
          <input className="border-input bg-background h-9 min-w-[12rem] max-w-sm rounded-md border px-3 text-sm" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="poem-chips" role="group">
            {(["all", "active", "inactive"] as const).map((key) => (
              <button key={key} type="button" className="poem-chip" data-on={filter === key} onClick={() => setFilter(key)}>
                {t(`filter_${key}`)}
              </button>
            ))}
          </div>
        </div>
        {rows === null ? (
          <p className="text-muted-foreground py-10 text-center text-sm">{t("loading")}</p>
        ) : visible.length === 0 ? (
          <div className="poem-list-shell px-6 py-14 text-center">
            <Sparkles className="text-muted-foreground mx-auto mb-3 size-6" />
            <p className="font-medium">{t("empty_title")}</p>
            <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">{t("empty")}</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((row) => {
              const count = 1 + row.slides.filter((slide) => slide.media_url).length
              return (
                <article key={row.id} className="poem-list-shell overflow-hidden">
                  <button type="button" className="block w-full text-start" onClick={() => openEdit(row)}>
                    <div className="bg-muted aspect-[16/10] overflow-hidden">
                      {row.media_url && row.media_type === "video" ? (
                        <video src={row.media_url} className="size-full object-cover" muted playsInline />
                      ) : row.media_url ? (
                        <img src={row.media_url} alt="" className="size-full object-cover" />
                      ) : null}
                    </div>
                    <div className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="text-sm font-semibold leading-6">{row.title}</h2>
                        <span className="poem-badge shrink-0" data-tone={row.is_active ? "ok" : undefined}>
                          {row.is_active ? t("stat_active") : t("stat_inactive")}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {t("frames", { count })}
                        {row.link_url ? ` · ${row.link_url}` : ""}
                      </p>
                    </div>
                  </button>
                  <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => openEdit(row)}>
                      {t("edit")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => remove(row)}>
                      {t("delete")}
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
      {dialog}
    </PageShell>
  )
}
