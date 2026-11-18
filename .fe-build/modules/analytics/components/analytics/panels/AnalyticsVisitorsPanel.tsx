"use client"

import { useTranslations } from "next-intl"

import type { AnalyticsRange } from "../AnalyticsPeriodFilter"
import {
  AnalyticsPanelHeader,
  AnalyticsQueryGate,
  DailyTrafficChart,
  DataTable,
  KpiCard,
  KpiGrid,
  fmtDateTime,
  fmtDuration,
  fmtInt,
  fmtPct,
  shortHash,
  useAnalyticsLocale,
} from "../analytics-ui"
import type { VisitorsData } from "../types"
import { useAnalyticsQuery } from "../use-analytics-query"
import { OnlineVisitorsTable } from "./OnlineVisitorsTable"

export function AnalyticsVisitorsPanel({ range }: { range: AnalyticsRange }) {
  const t = useTranslations("analytics")
  const lng = useAnalyticsLocale()
  const q = useAnalyticsQuery<VisitorsData>("visitors", range, undefined, { refetchInterval: 60_000 })
  const d = q.data

  return (
    <div className="space-y-4">
      <AnalyticsPanelHeader range={range} source={d?.source} />
      <AnalyticsQueryGate query={q} variant="overview">
        <KpiGrid className="lg:grid-cols-5">
          <KpiCard label={t("kpi.visitors")} value={fmtInt(d?.visitors, lng)} />
          <KpiCard label={t("sessions")} value={fmtInt(d?.sessions, lng)} />
          <KpiCard label={t("bounceRate")} value={fmtPct(d?.bounce_rate, lng)} />
          <KpiCard label={t("avgDuration")} value={fmtDuration(d?.avg_duration_ms, lng)} />
          <KpiCard label={t("kpi.online")} value={fmtInt(d?.online, lng)} />
        </KpiGrid>
        <DailyTrafficChart title={t("chartVisitors")} data={d?.series ?? []} keys={["visitors"]} />
        <div className="grid gap-4 xl:grid-cols-2">
          <DataTable
            title={t("kpi.topVisitors")}
            rows={d?.top_visitors ?? []}
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
              { key: "hits", label: t("col.hits"), cell: (r) => fmtInt(r.hits, lng) },
              { key: "country", label: t("col.country"), cell: (r) => r.country || t("unknown") },
              { key: "lastSeen", label: t("col.lastSeen"), cell: (r) => fmtDateTime(r.last_seen, lng) },
            ]}
          />
          <OnlineVisitorsTable title={t("onlineNow")} rows={d?.online_list ?? []} />
        </div>
      </AnalyticsQueryGate>
    </div>
  )
}
