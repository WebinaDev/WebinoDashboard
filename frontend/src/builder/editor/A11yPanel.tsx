"use client"

import { AlertTriangle, CircleX, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

import { auditDocument } from "../a11y"
import type { BuilderDocument } from "../types"

/** Accessibility audit of the current draft; clicking an issue selects the element. */
export function A11yPanel({ doc, onSelect, onClose }: { doc: BuilderDocument; onSelect: (id: string) => void; onClose: () => void }) {
  const t = useTranslations("builder")
  const issues = useMemo(() => auditDocument(doc), [doc])
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={t("a11y_audit")}>
      <aside className="flex w-96 max-w-full flex-col bg-white text-[#0C2D63]">
        <div className="flex items-center justify-between border-b p-3 text-sm font-bold">
          <span>{t("a11y_audit")}</span>
          <button type="button" aria-label={t("close")} onClick={onClose}><X className="size-4" /></button>
        </div>
        <div className="grid gap-2 overflow-auto p-3 text-xs">
          {issues.length === 0 ? <p>{t("a11y_clean")}</p> : null}
          {issues.map((issue, index) => (
            <button
              key={`${issue.id}-${issue.code}-${index}`}
              type="button"
              disabled={!issue.id}
              className="flex items-start gap-2 rounded-lg border p-2 text-start hover:bg-[#f7f9fc] disabled:cursor-default"
              onClick={() => issue.id && onSelect(issue.id)}
            >
              {issue.severity === "error" ? <CircleX className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />}
              <span>
                {t(`a11y_${issue.code}`)}
                {issue.detail ? <span className="ms-1 text-[#0C2D63]/60" dir="ltr">({issue.detail})</span> : null}
              </span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  )
}
