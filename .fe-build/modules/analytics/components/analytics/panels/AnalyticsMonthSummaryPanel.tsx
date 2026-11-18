"use client"

import { useTranslations } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { ChangePctBadge } from "@/components/home/ChangePctBadge"
import { cn } from "@/lib/utils"

import type { AnalyticsRange } from "../AnalyticsPeriodFilter"
import {
  AnalyticsPanelHeader,
  AnalyticsQueryGate,
  DataTable,
  KpiCard,
  KpiGrid,
  fmtDay,
  fmtDecimal,
  fmtInt,
  fmtPct,
  useAnalyticsLocale,
} from "../analytics-ui"
import type { MonthSummaryData, SummaryKey } from "../types"
import { useAnalyticsQuery } from "../use-analytics-query"

const KPI_KEYS = {
  revenue: "revenue",
  order_count: "orders",
  visitors: "visitors",
  conversion: "conversion",
} as const satisfies Record<SummaryKey, string>

function statusClass(status: MonthSummaryData["status"]): string {
  if (status === "growth") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
  if (status === "decline") return "bg-rose-500/15 text-rose-700 dark:text-rose-400"
  return "bg-muted text-muted-foreground"
}

function HighlightCard({
  title,
  highlight,
  emptyText,
  tone,
}: {
  title: string
  highlight: MonthSummaryData["top_achievement"]
  emptyText: string
  tone: "up" | "down"
}) {
  const t = useTranslations("analytics")
  const lng = useAnalyticsLocale()
  return (
    <div className="border-border/60 space-y-1 rounded-lg border p-4">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</p>
      {highlight ? (
        <>
          <p className="text-base font-medium">
            {highlight.key in KPI_KEYS ? t(`monthSummary.kpi.${KPI_KEYS[highlight.key]}`) : highlight.key}
          </p>
          <p
            className={cn(
              "text-sm tabular-nums",
              tone === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            )}
          >
            {fmtPct(highlight.change_pct, lng, true)}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{emptyText}</p>
      )}
    </div>
  )
}

export function AnalyticsMonthSummaryPanel({ range }: { range: AnalyticsRange }) {
  const t = useTranslations("analytics")
  const lng = useAnalyticsLocale()
  const q = useAnalyticsQuery<MonthSummaryData>("month-summary", range)
  const d = q.data
  const status = d?.status ?? "stable"

  return (
    <div className="space-y-4">
      <AnalyticsPanelHeader range={range} source={d?.source} />
      <AnalyticsQueryGate query={q} variant="overview">
        {d?.from_day ? (
          <p className="text-muted-foreground text-sm">
            {t("rangeSpan", { from: fmtDay(d.from_day, lng), to: fmtDay(d.to_day, lng) })}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <span className={cn("inline-flex items-center rounded-md px-2.5 py-1 text-sm font-medium", statusClass(status))}>
            {t(`monthSummary.status.${status}`)}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground text-sm">{t("monthSummary.score")}</span>
            <span className="text-2xl font-semibold tabular-nums">
              {t("monthSummary.scoreValue", { score: fmtDecimal(d?.score ?? 0, lng) })}
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <HighlightCard
            title={t("monthSummary.achievement")}
            highlight={d?.top_achievement ?? null}
            emptyText={t("monthSummary.noAchievement")}
            tone="up"
          />
          <HighlightCard
            title={t("monthSummary.challenge")}
            highlight={d?.top_challenge ?? null}
            emptyText={t("monthSummary.noChallenge")}
            tone="down"
          />
        </div>

        <KpiGrid className="lg:grid-cols-5">
          <KpiCard label={t("kpi.visitors")} value={fmtInt(d?.traffic?.visitors, lng)} />
          <KpiCard label={t("kpi.views")} value={fmtInt(d?.traffic?.views, lng)} />
          <KpiCard label={t("sessions")} value={fmtInt(d?.traffic?.sessions, lng)} />
          <KpiCard label={t("kpi.orders")} value={fmtInt(d?.commerce?.order_count, lng)} />
          <KpiCard
            label={t("kpi.revenue")}
            value={<MoneyDisplay amount={d?.commerce?.revenue_minor ?? 0} currency={d?.commerce?.currency} />}
          />
        </KpiGrid>

        <DataTable
          title={t("monthSummary.deltas")}
          rows={d?.deltas ?? []}
          rowKey={(r) => r.key}
          columns={[
            {
              key: "metric",
              label: t("compare.metric"),
              cell: (r) => (r.key in KPI_KEYS ? t(`monthSummary.kpi.${KPI_KEYS[r.key]}`) : r.key),
            },
            { key: "change", label: t("compare.change"), cell: (r) => <ChangePctBadge value={r.change_pct} /> },
            {
              key: "weight",
              label: t("monthSummary.weight"),
              cell: (r) => fmtPct(r.weight <= 1 ? r.weight * 100 : r.weight, lng),
            },
          ]}
        />
      </AnalyticsQueryGate>
    </div>
  )
}
