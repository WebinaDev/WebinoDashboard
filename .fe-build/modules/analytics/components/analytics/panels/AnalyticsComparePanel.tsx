"use client"

import { useTranslations } from "next-intl"

import { ChangePctBadge } from "@/components/home/ChangePctBadge"
import { formatNumber } from "@/lib/locale"

import type { AnalyticsRange } from "../AnalyticsPeriodFilter"
import {
  AnalyticsPanelHeader,
  AnalyticsQueryGate,
  DataTable,
  fmtDay,
  fmtDuration,
  fmtPct,
  useAnalyticsLocale,
  type AnalyticsLocale,
} from "../analytics-ui"
import type { CompareData, CompareKey } from "../types"
import { useAnalyticsQuery } from "../use-analytics-query"

const LABEL_KEYS = {
  visitors: "visitors",
  views: "views",
  avg_duration_ms: "avgDuration",
  bounce_rate_pct: "bounce",
  top_sources: "topSources",
  top_pages: "topPages",
  site_conversion_pct: "siteConversion",
} as const satisfies Record<CompareKey, string>

function formatCell(key: CompareKey, v: number | string | null, lng: AnalyticsLocale): string {
  if (v === null || v === undefined || v === "") return "—"
  if (typeof v === "string") return v
  if (key === "avg_duration_ms") return fmtDuration(v, lng)
  if (key.endsWith("_pct")) return fmtPct(v, lng)
  return formatNumber(v, lng)
}

export function AnalyticsComparePanel({ range }: { range: AnalyticsRange }) {
  const t = useTranslations("analytics")
  const lng = useAnalyticsLocale()
  const q = useAnalyticsQuery<CompareData>("compare", range)
  const d = q.data

  const span = (p?: { from_day: string; to_day: string }) =>
    p ? t("rangeSpan", { from: fmtDay(p.from_day, lng), to: fmtDay(p.to_day, lng) }) : "—"
  const currentLabel = t("compare.current")
  const previousLabel = t("compare.previous")

  return (
    <div className="space-y-4">
      <AnalyticsPanelHeader range={range} source={d?.source} />
      <AnalyticsQueryGate query={q}>
        <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="text-foreground font-medium">{currentLabel}:</span> {span(d?.current)}
          </span>
          <span>
            <span className="text-foreground font-medium">{previousLabel}:</span> {span(d?.previous)}
          </span>
        </div>
        {d && !d.sessions_available ? (
          <p className="text-muted-foreground text-xs">{t("compare.sessionNote")}</p>
        ) : null}
        <DataTable
          rows={d?.rows ?? []}
          rowKey={(r) => r.key}
          columns={[
            {
              key: "metric",
              label: t("compare.metric"),
              cell: (r) => (r.key in LABEL_KEYS ? t(`compare.${LABEL_KEYS[r.key]}`) : r.key),
            },
            {
              key: "current",
              label: currentLabel,
              cell: (r) => <span className="tabular-nums">{formatCell(r.key, r.current, lng)}</span>,
            },
            {
              key: "previous",
              label: previousLabel,
              cell: (r) => <span className="tabular-nums">{formatCell(r.key, r.previous, lng)}</span>,
            },
            {
              key: "change",
              label: t("compare.change"),
              cell: (r) =>
                typeof r.current === "string" || (r.previous === null && r.change_pct === null) ? (
                  "—"
                ) : (
                  <ChangePctBadge value={r.change_pct} />
                ),
            },
          ]}
        />
      </AnalyticsQueryGate>
    </div>
  )
}
