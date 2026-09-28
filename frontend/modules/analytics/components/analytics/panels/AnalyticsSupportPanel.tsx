"use client"

import { useTranslations } from "next-intl"

import type { AnalyticsRange } from "../AnalyticsPeriodFilter"
import {
  AnalyticsPanelHeader,
  AnalyticsQueryGate,
  DataTable,
  KpiCard,
  KpiGrid,
  fmtDecimal,
  fmtInt,
  useAnalyticsLocale,
} from "../analytics-ui"
import type { SupportData } from "../types"
import { useAnalyticsQuery } from "../use-analytics-query"

export function AnalyticsSupportPanel({ range }: { range: AnalyticsRange }) {
  const t = useTranslations("analytics")
  const lng = useAnalyticsLocale()
  const q = useAnalyticsQuery<SupportData>("support", range)
  const d = q.data

  return (
    <div className="space-y-4">
      <AnalyticsPanelHeader range={range} source={d?.source} />
      <AnalyticsQueryGate query={q} variant="overview">
        <KpiGrid>
          <KpiCard label={t("support.tickets")} value={fmtInt(d?.tickets_created, lng)} />
          <KpiCard label={t("support.replies")} value={fmtInt(d?.staff_replies, lng)} />
          <KpiCard
            label={t("support.csat")}
            value={
              d?.csat_avg === null || d?.csat_avg === undefined
                ? "—"
                : t("support.csatValue", { value: fmtDecimal(d.csat_avg, lng) })
            }
          />
          <KpiCard label={t("support.csatCount")} value={fmtInt(d?.csat_count, lng)} />
        </KpiGrid>
        <DataTable
          title={t("support.frequent")}
          rows={d?.frequent ?? []}
          rowKey={(r, i) => `${r.subject}-${i}`}
          columns={[
            { key: "subject", label: t("col.subject"), cell: (r) => r.subject || t("unknown") },
            { key: "count", label: t("col.count"), cell: (r) => fmtInt(r.count, lng) },
          ]}
        />
      </AnalyticsQueryGate>
    </div>
  )
}
