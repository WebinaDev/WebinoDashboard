"use client"

import { History, RotateCcw, X } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { Suspense, useEffect, useMemo, useState } from "react"
import { diffDocuments } from "@webina/ui/builder"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { formatDate } from "@/lib/locale"
import type { BuilderGlobals } from "../globals"
import { migrateDocument } from "../migrate"
import { DocumentView } from "../render/DocumentView"
import { isDocument } from "../tree"
import type { BuilderDocument } from "../types"

export type RevisionTarget = { type: "page" | "template" | "post"; id: number }

const fa = (n: number) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])

type Row = { id: number; reason: string; size: number; user_name?: string | null; created_at?: string; updated_at?: string }

/** Server-side revision history: list, preview (read-only render) and restore into the draft. */
export function RevisionsPanel({
  target,
  globals,
  current,
  onClose,
  onRestored,
}: {
  target: RevisionTarget
  globals: BuilderGlobals
  /** Current draft; when set, the preview shows what restoring would change. */
  current?: BuilderDocument
  onClose: () => void
  onRestored: (doc: BuilderDocument) => void
}) {
  const t = useTranslations("builder")
  const locale = useLocale()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [preview, setPreview] = useState<{ id: number; doc: BuilderDocument } | null>(null)
  const [busy, setBusy] = useState(false)
  const diff = useMemo(() => (preview && current ? diffDocuments(preview.doc, current) : null), [preview, current])

  useEffect(() => {
    let cancel = false
    api<Row[]>(`/api/v1/builder/revisions?target=${target.type}&id=${target.id}`)
      .then((res) => {
        if (!cancel) setRows(Array.isArray(res) ? res : [])
      })
      .catch(() => {
        if (!cancel) setRows([])
      })
    return () => {
      cancel = true
    }
  }, [target.id, target.type])

  async function open(id: number) {
    const res = await api<{ document: unknown }>(`/api/v1/builder/revisions/${id}`).catch(() => null)
    if (res && isDocument(res.document)) setPreview({ id, doc: migrateDocument(res.document) })
    else toast.error(t("load_failed"))
  }

  async function restore(id: number) {
    setBusy(true)
    try {
      const res = await api<{ document: unknown }>(`/api/v1/builder/revisions/${id}/restore`, { method: "POST" })
      if (isDocument(res.document)) {
        onRestored(migrateDocument(res.document))
        toast.success(t("revision_restored"))
        onClose()
      }
    } catch {
      toast.error(t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40" role="dialog" aria-modal="true" aria-label={t("revisions")}>
      <aside className="flex w-80 shrink-0 flex-col bg-card text-foreground">
        <div className="flex items-center justify-between border-b p-3 text-sm font-bold">
          <span className="flex items-center gap-1.5"><History className="size-4" aria-hidden />{t("revisions")}</span>
          <button type="button" aria-label={t("close")} onClick={onClose}><X className="size-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2 text-xs">
          {rows === null ? <p className="p-3 text-foreground/60">{t("loading")}</p> : null}
          {rows?.length === 0 ? <p className="p-3 text-foreground/60">{t("revisions_empty")}</p> : null}
          {rows?.map((row) => (
            <div key={row.id} className={`mb-1 rounded-lg border p-2 ${preview?.id === row.id ? "border-primary" : "border-border"}`}>
              <button type="button" className="w-full text-start" onClick={() => void open(row.id)}>
                <span className="font-bold">{t(row.reason === "restore" ? "revision_restore_reason" : (`revision_${row.reason}` as "revision_save"))}</span>
                <span className="block text-foreground/60">
                  {row.updated_at || row.created_at ? formatDate((row.updated_at || row.created_at) as string, locale, { dateStyle: "medium", timeStyle: "short" }) : ""}
                  {row.user_name ? ` · ${row.user_name}` : ""}
                </span>
              </button>
              <Button type="button" size="sm" variant="outline" className="mt-1 h-7 w-full gap-1 text-xs" disabled={busy} onClick={() => void restore(row.id)}>
                <RotateCcw className="size-3" aria-hidden />
                {t("revision_restore")}
              </Button>
            </div>
          ))}
        </div>
      </aside>
      <div className="min-w-0 flex-1 overflow-auto bg-border p-6" onClick={onClose}>
        {preview ? (
          <>
          {diff ? (
            <p className="mx-auto mb-3 max-w-6xl rounded-xl bg-card/90 px-3 py-2 text-xs text-foreground" dir="rtl" onClick={(event) => event.stopPropagation()}>
              {diff.added + diff.removed + diff.changed === 0
                ? "این نسخه با پیش‌نویس فعلی یکسان است."
                : `بازگردانی این نسخه: ${fa(diff.added)} بخش برمی‌گردد، ${fa(diff.removed)} بخش حذف می‌شود، ${fa(diff.changed)} بخش تغییر می‌کند.`}
            </p>
          ) : null}
          <div className="pointer-events-none mx-auto max-w-6xl overflow-hidden rounded-2xl bg-muted shadow-xl" onClick={(event) => event.stopPropagation()}>
            <Suspense fallback={null}>
              <DocumentView document={preview.doc} mode="edit" globals={globals} />
            </Suspense>
          </div>
          </>
        ) : (
          <p className="grid h-full place-items-center text-sm text-white">{t("revision_pick")}</p>
        )}
      </div>
    </div>
  )
}
