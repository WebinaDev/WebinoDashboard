"use client"

import { LayoutTemplate, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import { importPayload } from "../ops"
import type { BuilderDocument } from "../types"

type Item = { id: number; kind: "section" | "page" | "widget"; title: string; category?: string | null }

/** "My templates": saved sections/pages, inserted with fresh ids after the current selection. */
export function LibraryPanel({ onInsert, refreshKey }: { onInsert: (doc: BuilderDocument, kind: Item["kind"]) => void; refreshKey: number }) {
  const t = useTranslations("builder")
  const [items, setItems] = useState<Item[] | null>(null)
  const load = useCallback(() => {
    api<Item[]>("/api/v1/builder/library").then((rows) => setItems(Array.isArray(rows) ? rows : [])).catch(() => setItems([]))
  }, [])
  useEffect(() => {
    load()
  }, [load, refreshKey])

  async function insert(item: Item) {
    const row = await api<{ document: unknown }>(`/api/v1/builder/library/${item.id}`).catch(() => null)
    const doc = row ? importPayload(JSON.stringify(row.document)) : null
    if (!doc) {
      toast.error(t("load_failed"))
      return
    }
    onInsert(doc, item.kind)
  }

  async function remove(item: Item) {
    if (!window.confirm(t("library_delete_confirm"))) return
    await api(`/api/v1/builder/library/${item.id}`, { method: "DELETE" }).catch(() => null)
    load()
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3 text-xs">
      <p className="mb-2 text-[11px] leading-5 text-foreground/60">{t("library_hint")}</p>
      {items === null ? <p>{t("loading")}</p> : null}
      {items?.length === 0 ? <p className="text-foreground/60">{t("library_empty")}</p> : null}
      {(["section", "page", "widget"] as const).map((kind) => {
        const rows = items?.filter((item) => item.kind === kind) ?? []
        if (!rows.length) return null
        return (
          <div key={kind} className="mb-3">
            <div className="mb-1 font-bold text-foreground/60">{t(`library_kind_${kind}`)}</div>
            {rows.map((item) => (
              <div key={item.id} className="mb-1 flex items-center gap-1 rounded-lg border border-border bg-card p-1.5">
                <LayoutTemplate className="size-3.5 shrink-0 text-foreground/50" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <button type="button" aria-label={t("library_insert")} title={t("library_insert")} onClick={() => void insert(item)} className="grid size-6 place-items-center rounded hover:bg-muted"><Plus className="size-3.5" /></button>
                <button type="button" aria-label={t("delete")} title={t("delete")} onClick={() => void remove(item)} className="grid size-6 place-items-center rounded text-red-500 hover:bg-red-50"><Trash2 className="size-3.5" /></button>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
