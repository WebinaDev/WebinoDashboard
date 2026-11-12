"use client"

/* Shared audio/video library admin for poetry (kind-filtered) — full list + detail editor. */

import { ChevronDown, Music2, Video } from "lucide-react"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { MediaPickerField } from "@/components/content/MediaPickerField"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import {
  emptyPoetryMedia,
  poetryApi,
  poetryError,
  type PoetryMediaForm,
  type PoetryMediaRow,
  type PoetryPoemRow,
  type PoetryTerm,
} from "./poetry-api"

import "./poetry-admin.css"

function SidePanel({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="poem-side__panel" data-open={open}>
      <CollapsibleTrigger asChild>
        <button type="button" className="poem-side__trigger">
          <span>{title}</span>
          <ChevronDown aria-hidden />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="poem-side__body">{children}</CollapsibleContent>
    </Collapsible>
  )
}

export function PoetryMediaAdmin({ kind }: { kind: "audio" | "video" }) {
  const t = useTranslations("poetry_admin")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const dir = locale === "fa" ? "rtl" : "ltr"
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [rows, setRows] = useState<PoetryMediaRow[] | null | "error">(null)
  const [terms, setTerms] = useState<PoetryTerm[]>([])
  const [poems, setPoems] = useState<PoetryPoemRow[]>([])
  const [q, setQ] = useState("")
  const [appliedQ, setAppliedQ] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all")
  const [poemFilter, setPoemFilter] = useState<number | "">("")
  const [poemSearch, setPoemSearch] = useState("")
  const [f, setF] = useState<PoetryMediaForm | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    poetryApi
      .get("/v1/poetry/media", {
        params: {
          kind,
          q: appliedQ || undefined,
          status: statusFilter === "all" ? undefined : statusFilter,
          poem_id: poemFilter || undefined,
          per_page: 100,
        },
      })
      .then((r) => setRows(Array.isArray(r.data.data) ? r.data.data : []))
      .catch((e) => {
        setRows("error")
        toast.error(poetryError(e))
      })
  }, [kind, appliedQ, statusFilter, poemFilter])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    poetryApi
      .get("/v1/poetry/terms")
      .then((r) => setTerms(Array.isArray(r.data.data) ? r.data.data : []))
      .catch(() => setTerms([]))
    poetryApi
      .get("/v1/poetry/poems", { params: { per_page: 100 } })
      .then((r) => setPoems(Array.isArray(r.data.data) ? r.data.data : []))
      .catch(() => setPoems([]))
  }, [])

  const set = <K extends keyof PoetryMediaForm>(k: K, v: PoetryMediaForm[K]) =>
    setF((p) => (p ? { ...p, [k]: v } : p))

  const filteredPoems = useMemo(() => {
    const needle = poemSearch.trim().toLowerCase()
    if (!needle) return poems
    return poems.filter((p) => p.title.toLowerCase().includes(needle))
  }, [poems, poemSearch])

  const stats = useMemo(() => {
    const list = Array.isArray(rows) ? rows : []
    return {
      total: list.length,
      published: list.filter((r) => r.status === "published").length,
      draft: list.filter((r) => r.status === "draft").length,
      linked: list.filter((r) => r.poem_id).length,
    }
  }, [rows])

  const save = async () => {
    if (!f) return
    if (!f.title.trim()) {
      toast.error(t("media_title_required"))
      return
    }
    if (!f.media_id && !f.file_url.trim() && !f.external_url.trim()) {
      toast.error(t("media_source_required"))
      return
    }
    setBusy(true)
    try {
      if (f.id) await poetryApi.put(`/v1/poetry/media/${f.id}`, f)
      else await poetryApi.post("/v1/poetry/media", f)
      toast.success(tCommon("saved"))
      setF(null)
      void load()
    } catch (e) {
      toast.error(poetryError(e))
    } finally {
      setBusy(false)
    }
  }

  const del = (row: PoetryMediaRow) => {
    confirm({
      description: row.title,
      onConfirm: async () => {
        await poetryApi.delete(`/v1/poetry/media/${row.id}`)
        toast.success(t("deleted"))
        void load()
      },
    })
  }

  const edit = (r: PoetryMediaRow) =>
    setF({
      id: r.id,
      title: r.title,
      kind: r.kind,
      media_id: r.media_id,
      file_url: r.file_url ?? (r.media_id ? (r.url ?? "") : ""),
      external_url: r.external_url ?? "",
      cover: r.cover ?? "",
      occasion_id: r.occasion_id,
      poem_id: r.poem_id,
      reciter: r.reciter ?? "",
      duration: r.duration ?? "",
      sort: r.sort ?? 0,
      status: r.status,
      is_premium: !!r.is_premium,
    })

  const pageTitle = kind === "audio" ? t("audio_title") : t("video_title")
  const subtitle = kind === "audio" ? t("audio_subtitle") : t("video_subtitle")
  const fileAccept = kind === "audio" ? "audio" : "video"
  const KindIcon = kind === "audio" ? Music2 : Video
  const playUrl = f?.file_url || ""
  const isPublished = f?.status === "published"

  if (f) {
    return (
      <PageShell
        eyebrow={t("eyebrow_media")}
        title={f.id ? t("edit_media") : kind === "audio" ? t("new_audio") : t("new_video")}
        description={subtitle}
        actions={
          <div className="poem-toolbar">
            <div className="poem-toolbar__status" role="group" aria-label={t("status")}>
              <button type="button" data-on={!isPublished} onClick={() => set("status", "draft")}>
                {t("status_draft")}
              </button>
              <button type="button" data-on={!!isPublished} onClick={() => set("status", "published")}>
                {t("status_published")}
              </button>
            </div>
            <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
              {busy ? tCommon("saving") : isPublished ? t("publish_save") : tCommon("save")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setF(null)}>
              {tCommon("cancel")}
            </Button>
          </div>
        }
      >
        <div className="poem-desk" dir={dir}>
          <div className="poem-desk__layout poem-desk__layout--media">
            <section className="poem-manuscript space-y-4" aria-label={t("media_main")}>
              <label className="poem-field">
                <span>{t("title")}</span>
                <input
                  className="poem-title-input"
                  style={{ fontSize: "clamp(1.35rem, 2.4vw, 1.85rem)", minHeight: "1.8em" }}
                  value={f.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder={kind === "audio" ? t("audio_title_ph") : t("video_title_ph")}
                />
              </label>

              <div className="poem-manuscript__rule" aria-hidden />

              <MediaPickerField
                label={kind === "audio" ? t("audio_file") : t("video_file")}
                imageUrl={f.file_url}
                accept={fileAccept}
                onPick={(item) =>
                  setF((p) =>
                    p
                      ? {
                          ...p,
                          media_id: item.id,
                          file_url: item.url,
                          kind: item.mime?.startsWith("video/")
                            ? "video"
                            : item.mime?.startsWith("audio/")
                              ? "audio"
                              : p.kind,
                        }
                      : p,
                  )
                }
                onClear={() => setF((p) => (p ? { ...p, media_id: null, file_url: "" } : p))}
              />

              {(playUrl || f.external_url) && (
                <div className="poem-media-preview">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    {t("media_preview")}
                  </p>
                  {playUrl && kind === "audio" ? <audio src={playUrl} controls preload="metadata" /> : null}
                  {playUrl && kind === "video" ? (
                    <video src={playUrl} controls playsInline preload="metadata" />
                  ) : null}
                  {!playUrl && f.external_url ? (
                    <a
                      className="text-primary text-sm underline-offset-2 hover:underline"
                      href={f.external_url}
                      target="_blank"
                      rel="noreferrer"
                      dir="ltr"
                    >
                      {f.external_url}
                    </a>
                  ) : null}
                </div>
              )}

              <label className="poem-field">
                <span>{t("media_external")}</span>
                <input
                  dir="ltr"
                  placeholder={t("external_url_ph")}
                  value={f.external_url}
                  onChange={(e) => set("external_url", e.target.value)}
                />
                <span className="text-muted-foreground text-xs">{t("external_url_hint")}</span>
              </label>

              <MediaPickerField
                label={t("media_cover")}
                imageUrl={f.cover}
                accept="image"
                onPick={(item) => set("cover", item.url)}
                onClear={() => set("cover", "")}
              />
            </section>

            <aside className="poem-side" aria-label={t("media_meta")}>
              <SidePanel title={t("panel_media_link")} defaultOpen>
                <label className="poem-field">
                  <span>{t("related_poem")}</span>
                  <Input
                    value={poemSearch}
                    onChange={(e) => setPoemSearch(e.target.value)}
                    placeholder={t("search_poems_ph")}
                    className="mb-1"
                  />
                  <select
                    value={f.poem_id ?? ""}
                    onChange={(e) => set("poem_id", e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">{t("no_related_poem")}</option>
                    {filteredPoems.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="poem-field">
                  <span>{t("occasion")}</span>
                  <select
                    value={f.occasion_id ?? ""}
                    onChange={(e) => set("occasion_id", e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">—</option>
                    {terms
                      .filter((x) => x.kind === "occasion")
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </label>
              </SidePanel>

              <SidePanel title={t("panel_media_details")} defaultOpen>
                <label className="poem-field">
                  <span>{t("reciter")}</span>
                  <input value={f.reciter} onChange={(e) => set("reciter", e.target.value)} />
                </label>
                <label className="poem-field">
                  <span>{t("duration")}</span>
                  <input
                    dir="ltr"
                    placeholder="04:32"
                    value={f.duration}
                    onChange={(e) => set("duration", e.target.value)}
                  />
                </label>
                <label className="poem-field">
                  <span>{t("sort")}</span>
                  <input
                    type="number"
                    min={0}
                    value={f.sort}
                    onChange={(e) => set("sort", Number(e.target.value) || 0)}
                  />
                </label>
                <label className="poem-check">
                  <input type="checkbox" checked={f.is_premium} onChange={(e) => set("is_premium", e.target.checked)} />
                  {t("premium")}
                </label>
                <p className="poem-hint">{t("premium_hint")}</p>
              </SidePanel>
            </aside>
          </div>
        </div>
        {confirmDialog}
      </PageShell>
    )
  }

  return (
    <PageShell
      title={pageTitle}
      description={subtitle}
      actions={
        <Button type="button" onClick={() => setF(emptyPoetryMedia(kind))}>
          <KindIcon className="size-4" />
          {kind === "audio" ? t("new_audio") : t("new_video")}
        </Button>
      }
    >
      <div className="poem-desk" dir={dir}>
        <ListStatsStrip
          className="mb-4"
          items={[
            { id: "total", label: t("stat_total"), value: stats.total },
            { id: "published", label: t("status_published"), value: stats.published },
            { id: "draft", label: t("status_draft"), value: stats.draft },
            { id: "linked", label: t("stat_linked_poems"), value: stats.linked },
          ]}
        />

        <div className="poem-filter-bar">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setAppliedQ(q.trim())
            }}
          >
            <Input
              className="min-w-[12rem] max-w-sm"
              placeholder={t("search_media_ph")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button type="submit" variant="outline">
              {t("search")}
            </Button>
          </form>
          <div className="poem-chips" role="group" aria-label={t("status")}>
            {(["all", "published", "draft"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className="poem-chip"
                data-on={statusFilter === s}
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? t("filter_all") : s === "published" ? t("status_published") : t("status_draft")}
              </button>
            ))}
          </div>
          <select
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            value={poemFilter}
            onChange={(e) => setPoemFilter(e.target.value ? Number(e.target.value) : "")}
            aria-label={t("related_poem")}
          >
            <option value="">{t("filter_any_poem")}</option>
            {poems.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        <p className="text-muted-foreground mb-3 text-sm">{t("media_list_hint")}</p>

        {rows === null ? (
          <p className="text-muted-foreground py-8 text-center text-sm">{t("loading")}</p>
        ) : rows === "error" ? (
          <p className="text-destructive py-8 text-center text-sm">
            {t("load_media_failed")}{" "}
            <Button type="button" variant="outline" size="sm" onClick={load}>
              {t("retry")}
            </Button>
          </p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {appliedQ || statusFilter !== "all" || poemFilter
              ? t("empty_search")
              : kind === "audio"
                ? t("empty_audio")
                : t("empty_video")}
          </p>
        ) : (
          <div className="poem-list-shell overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>{t("col_title")}</th>
                  <th>{t("media_source")}</th>
                  <th>{t("reciter")}</th>
                  <th>{t("related_poem")}</th>
                  <th>{t("duration")}</th>
                  <th>{t("sort")}</th>
                  <th>{t("status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        {r.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.cover} alt="" className="poem-media-thumb" />
                        ) : (
                          <span className="poem-media-thumb poem-media-thumb--placeholder">
                            <KindIcon className="size-4" />
                          </span>
                        )}
                        <span className="font-medium">{r.title}</span>
                      </div>
                    </td>
                    <td>
                      {r.url || r.file_url ? t("source_file") : r.external_url ? t("source_link") : "—"}
                    </td>
                    <td>{r.reciter || "—"}</td>
                    <td>{r.poem?.title ?? "—"}</td>
                    <td dir="ltr">{r.duration || "—"}</td>
                    <td>{r.sort}</td>
                    <td>
                      <span className="poem-badge" data-tone={r.status === "published" ? "ok" : undefined}>
                        {r.status === "published" ? t("status_published") : t("status_draft")}
                      </span>
                    </td>
                    <td className="space-x-1 space-x-reverse whitespace-nowrap text-left">
                      <Button type="button" size="sm" variant="outline" onClick={() => edit(r)}>
                        {t("edit")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => del(r)}>
                        {t("delete")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {confirmDialog}
    </PageShell>
  )
}
