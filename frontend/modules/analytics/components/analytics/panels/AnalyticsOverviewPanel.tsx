"use client"

import { useTranslations } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"

import type { AnalyticsRange } from "../AnalyticsPeriodFilter"
import {
  AnalyticsPanelHeader,
  AnalyticsQueryGate,
  DailyTrafficChart,
  KpiCard,
  KpiGrid,
  fmtInt,
  useAnalyticsLocale,
} from "../analytics-ui"
import type { OverviewData } from "../types"
import { useAnalyticsQuery } from "../use-analytics-query"

export function AnalyticsOverviewPanel({ range }: { range: AnalyticsRange }) {
  const t = useTranslations("analytics")
  const lng = useAnalyticsLocale()
  const q = useAnalyticsQuery<OverviewData>("overview", range)
  const d = q.data

  return (
    <div className="space-y-4">
      <AnalyticsPanelHeader range={range} source={d?.source} />
      <AnalyticsQueryGate query={q} variant="overview">
        <KpiGrid className="lg:grid-cols-5">
          <KpiCard label={t("kpi.visitors")} value={fmtInt(d?.visitors, lng)} />
          <KpiCard label={t("kpi.views")} value={fmtInt(d?.views, lng)} />
          <KpiCard label={t("kpi.online")} value={fmtInt(d?.online, lng)} />
          <KpiCard label={t("kpi.commerceOrders")} value={fmtInt(d?.shop?.order_count, lng)} />
          <KpiCard
            label={t("kpi.commerceRevenue")}
            value={<MoneyDisplay amount={d?.shop?.revenue_minor ?? 0} currency={d?.shop?.currency} />}
          />
        </KpiGrid>
        <DailyTrafficChart title={t("chartTraffic")} data={d?.series ?? []} keys={["views", "visitors"]} />
      </AnalyticsQueryGate>
    </div>
  )
}
