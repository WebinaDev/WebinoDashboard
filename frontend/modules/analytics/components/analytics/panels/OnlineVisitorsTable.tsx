"use client"

import { useTranslations } from "next-intl"

import { DataTable, fmtDateTime, fmtInt, shortHash, useAnalyticsLocale } from "../analytics-ui"
import type { OnlineVisitor } from "../types"

export function OnlineVisitorsTable({ title, rows }: { title?: string; rows: OnlineVisitor[] }) {
  const t = useTranslations("analytics")
  const lng = useAnalyticsLocale()
  return (
    <DataTable
      title={title}
      rows={rows}
      rowKey={(r) => r.visitor_hash}
      columns={[
        {
          key: "visitor",
          label: t("col.visitor"),
          cell: (r) => (
            <span className="font-mono text-xs" dir="ltr" title={r.visitor_hash}>
              {shortHash(r.visitor_hash)}
            </span>
          ),
        },
        { key: "country", label: t("col.country"), cell: (r) => r.country || t("unknown") },
        { key: "hits", label: t("col.hits"), cell: (r) => fmtInt(r.hits, lng) },
        { key: "lastSeen", label: t("col.lastSeen"), cell: (r) => fmtDateTime(r.last_seen, lng) },
      ]}
    />
  )
}
