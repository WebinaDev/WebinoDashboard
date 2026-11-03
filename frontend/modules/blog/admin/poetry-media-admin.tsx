"use client"

/* Shared audio/video library admin for poetry (kind-filtered). */

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { MediaPickerField } from "@/components/content/MediaPickerField"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  emptyPoetryMedia,
  poetryApi,
  poetryError,
  type PoetryMediaForm,
  type PoetryMediaRow,
  type PoetryPoemRow,
  type PoetryTerm,
} from "./poetry-api"

export function PoetryMediaAdmin({ kind }: { kind: "audio" | "video" }) {
  const t = useTranslations("poetry_admin")
  const tCommon = useTranslations("common")
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [rows, setRows] = useState<PoetryMediaRow[] | null | "error">(null)
  const [terms, setTerms] = useState<PoetryTerm[]>([])
  const [poems, setPoems] = useState<PoetryPoemRow[]>([])
  const [q, setQ] = useState("")
  const [appliedQ, setAppliedQ] = useState("")
  const [f, setF] = useState<PoetryMediaForm | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    poetryApi
      .get("/v1/poetry/media", { params: { kind, q: appliedQ || undefined, per_page: 100 } })
      .then((r) => setRows(Array.isArray(r.data.data) ? r.data.data : []))
      .catch((e) => {
        setRows("error")
        toast.error(poetryError(e))
      })
  }, [kind, appliedQ])

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
    })

  const title = kind === "audio" ? t("audio_title") : t("video_title")
  const subtitle = kind === "audio" ? t("audio_subtitle") : t("video_subtitle")
  const fileAccept = kind === "audio" ? "audio" : "video"

  if (f) {
    return (
      <PageShell
        title={f.id ? t("edit_media") : kind === "audio" ? t("new_audio") : t("new_video")}
        description={subtitle}
        actions={
          <Button type="button" variant="outline" onClick={() => setF(null)}>
            {tCommon("cancel")}
          </Button>
        }
      >
        <div className="grid max-w-3xl gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label>{t("title")}</Label>
            <Input value={f.title} onChange={(e) => set("title", e.target.value)} required />
          </div>
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
          <div className="space-y-1">
            <Label>{t("media_external")}</Label>
            <Input
              dir="ltr"
              placeholder={t("external_url_ph")}
              value={f.external_url}
              onChange={(e) => set("external_url", e.target.value)}
            />
            <p className="text-muted-foreground text-xs">{t("external_url_hint")}</p>
          </div>
          <MediaPickerField
            label={t("media_cover")}
            imageUrl={f.cover}
            accept="image"
            onPick={(item) => set("cover", item.url)}
            onClear={() => set("cover", "")}
          />
          <div className="space-y-1">
            <Label>{t("occasion")}</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
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
          </div>
          <div className="space-y-1">
            <Label>{t("related_poem")}</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={f.poem_id ?? ""}
              onChange={(e) => set("poem_id", e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t("no_related_poem")}</option>
              {poems.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t("reciter")}</Label>
            <Input value={f.reciter} onChange={(e) => set("reciter", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("duration")}</Label>
            <Input dir="ltr" placeholder="04:32" value={f.duration} onChange={(e) => set("duration", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("sort")}</Label>
            <Input
              type="number"
              min={0}
              value={f.sort}
              onChange={(e) => set("sort", Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("status")}</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={f.status}
              onChange={(e) => set("status", e.target.value as PoetryMediaForm["status"])}
            >
              <option value="published">{t("status_published")}</option>
              <option value="draft">{t("status_draft")}</option>
            </select>
          </div>
          <div className="flex gap-2 md:col-span-2">
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? tCommon("saving") : tCommon("save")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setF(null)}>
              {tCommon("cancel")}
            </Button>
          </div>
        </div>
        {confirmDialog}
      </PageShell>
    )
  }

  return (
    <PageShell
      title={title}
      description={subtitle}
      actions={
        <Button type="button" onClick={() => setF(emptyPoetryMedia(kind))}>
          {kind === "audio" ? t("new_audio") : t("new_video")}
        </Button>
      }
    >
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setAppliedQ(q.trim())
        }}
      >
        <Input
          className="max-w-sm"
          placeholder={t("search_media_ph")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" variant="outline">
          {t("search")}
        </Button>
      </form>

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
          {appliedQ ? t("empty_search") : kind === "audio" ? t("empty_audio") : t("empty_video")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b text-right">
                <th className="p-3 font-medium">{t("col_title")}</th>
                <th className="p-3 font-medium">{t("media_source")}</th>
                <th className="p-3 font-medium">{t("related_poem")}</th>
                <th className="p-3 font-medium">{t("status")}</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="p-3">{r.title}</td>
                  <td className="p-3">{r.url ? t("source_file") : r.external_url ? t("source_link") : "—"}</td>
                  <td className="p-3">{r.poem?.title ?? "—"}</td>
                  <td className="p-3">{r.status === "published" ? t("status_published") : t("status_draft")}</td>
                  <td className="space-x-1 space-x-reverse p-3 text-left">
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
      {confirmDialog}
    </PageShell>
  )
}
