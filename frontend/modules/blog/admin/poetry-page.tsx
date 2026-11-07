"use client"

/* شعر و ادبیات — poems list/editor + Telegram paste importer. Audio/video/categories are separate routes. */

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import type { ResolvedAdminRoute } from "@/kernel/types"

import { PoemEditor } from "./poem-editor"
import { poetryApi, poetryError } from "./poetry-api"
import {
  emptyPoem,
  poemFromApi,
  type PoemForm,
  type PoemListRow,
  type PoetryTerm,
} from "./poetry-types"

import "./poetry-admin.css"

const box = "poem-list-shell p-4"
const inp = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
const btn = "rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50"
const primary = "rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"

export default function PoetryAdminPage(props: { route?: ResolvedAdminRoute; flag?: "is_short" | "is_premium" }) {
  const t = useTranslations("poetry_admin")
  const flag = props.flag
  const [tab, setTab] = useState<"poems" | "import">("poems")
  const [terms, setTerms] = useState<PoetryTerm[]>([])
  const [editing, setEditing] = useState<PoemForm | null>(null)

  const loadTerms = useCallback(
    () =>
      poetryApi
        .get("/v1/poetry/terms")
        .then((r) => setTerms(Array.isArray(r.data.data) ? r.data.data : []))
        .catch((e) => toast.error(poetryError(e))),
    [],
  )
  useEffect(() => {
    void loadTerms()
  }, [loadTerms])

  return (
    <PageShell
      eyebrow={editing ? t("eyebrow") : undefined}
      title={editing ? (editing.id ? t("edit_poem") : t("new_poem")) : flag === "is_short" ? t("short_page_title") : t("page_title")}
      description={editing ? undefined : flag === "is_short" ? t("short_poems_subtitle") : t("poems_subtitle")}
      actions={
        editing || flag ? null : (
          <div className="flex gap-1">
            {(["poems", "import"] as const).map((x) => (
              <Button
                key={x}
                type="button"
                size="sm"
                variant={tab === x ? "default" : "outline"}
                onClick={() => {
                  setTab(x)
                  setEditing(null)
                }}
              >
                {x === "poems" ? t("tab_poems") : t("tab_import")}
              </Button>
            ))}
          </div>
        )
      }
    >
      <div className="space-y-4">
        {editing ? (
          <PoemEditor
            initial={editing}
            terms={terms}
            onDone={() => {
              setEditing(null)
              setTab("poems")
            }}
            onError={(m) => toast.error(m)}
            save={async (body) => {
              const payload = flag === "is_short" ? { ...body, flags: { ...body.flags, is_short: true } } : body
              if (payload.id) await poetryApi.put(`/v1/poetry/poems/${payload.id}`, payload)
              else await poetryApi.post("/v1/poetry/poems", payload)
            }}
          />
        ) : tab === "poems" || flag ? (
          <PoemList
            flag={flag}
            onEdit={(id) =>
              poetryApi
                .get(`/v1/poetry/poems/${id}`)
                .then((r) => setEditing(poemFromApi(r.data.data as Record<string, unknown>)))
                .catch((e) => toast.error(poetryError(e)))
            }
            onNew={() => setEditing({ ...emptyPoem(), flags: flag === "is_short" ? { is_short: true } : {} })}
            onError={(m) => toast.error(m)}
          />
        ) : (
          <Importer onReview={(f) => setEditing(f)} onError={(m) => toast.error(m)} />
        )}
      </div>
    </PageShell>
  )
}

function PoemList({
  onEdit,
  onNew,
  onError,
  flag,
}: {
  onEdit: (id: number) => void
  onNew: () => void
  onError: (m: string) => void
  flag?: "is_short" | "is_premium"
}) {
  const t = useTranslations("poetry_admin")
  const [rows, setRows] = useState<PoemListRow[] | null | "error">(null)
  const [q, setQ] = useState("")
  const load = useCallback(
    () =>
      poetryApi
        .get("/v1/poetry/poems", { params: { q: q || undefined, per_page: 50, flag: flag || undefined } })
        .then((r) => setRows(Array.isArray(r.data.data) ? r.data.data : []))
        .catch((e) => {
          setRows("error")
          onError(poetryError(e))
        }),
    [q, onError, flag],
  )
  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [load])
  const del = (id: number) => {
    if (window.confirm(t("confirm_delete_poem"))) {
      poetryApi
        .delete(`/v1/poetry/poems/${id}`)
        .then(load)
        .catch((e) => onError(poetryError(e)))
    }
  }
  return (
    <div className={box}>
      <div className="mb-3 flex gap-2">
        <input className={inp} placeholder={t("search_poems_ph")} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className={primary} onClick={onNew}>
          {t("new_poem")}
        </button>
      </div>
      {rows === null ? (
        <p className="text-muted-foreground py-6 text-center text-sm">{t("loading")}</p>
      ) : rows === "error" ? (
        <p className="text-destructive py-6 text-center text-sm">
          {t("load_poems_failed")}{" "}
          <button type="button" className={btn} onClick={load}>
            {t("retry")}
          </button>
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">{q ? t("no_poems_search") : t("no_poems")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-right">
              <th className="p-2">{t("col_title")}</th>
              <th>{t("occasion")}</th>
              <th>{t("status")}</th>
              <th>{t("col_views")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{r.title}</span>
                    {r.flags?.is_premium ? (
                      <span className="poem-badge" data-tone="premium">
                        {t("access_premium")}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td>{r.occasion?.name ?? "—"}</td>
                <td>{r.status === "published" ? t("status_published") : t("status_draft")}</td>
                <td>{r.view_count.toLocaleString("fa-IR")}</td>
                <td className="space-x-1 space-x-reverse text-left">
                  <button type="button" className={btn} onClick={() => onEdit(r.id)}>
                    {t("edit")}
                  </button>
                  <button type="button" className={btn} onClick={() => del(r.id)}>
                    {t("delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Importer({ onReview, onError }: { onReview: (f: PoemForm) => void; onError: (m: string) => void }) {
  const t = useTranslations("poetry_admin")
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const parse = async () => {
    setBusy(true)
    try {
      const d = (await poetryApi.post("/v1/poetry/import/parse", { text })).data.data
      setWarnings(d.warnings ?? [])
      onReview({
        ...emptyPoem(),
        title: d.title ?? "",
        pen_name: d.pen_name ?? "",
        composed_label: d.composed_label ?? "",
        melody_credit: d.melody_credit ?? "",
        style_label: d.style_label ?? "",
        flags: d.flags ?? {},
        stanzas: d.stanzas ?? [],
      })
    } catch (e) {
      onError(poetryError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={`${box} space-y-3`}>
      <p className="text-muted-foreground text-sm">{t("import_hint")}</p>
      <textarea className={`${inp} leading-8`} rows={14} value={text} onChange={(e) => setText(e.target.value)} />
      {warnings.length ? (
        <ul className="list-disc ps-5 text-sm text-amber-600">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}
      <button type="button" className={primary} disabled={busy || !text.trim()} onClick={() => void parse()}>
        {busy ? t("import_parsing") : t("import_parse")}
      </button>
    </div>
  )
}
