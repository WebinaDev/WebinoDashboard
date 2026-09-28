"use client"

import { useTranslations } from "next-intl"

import type { AnalyticsRange } from "../AnalyticsPeriodFilter"
import { AnalyticsPanelHeader, AnalyticsQueryGate, KpiCard, KpiGrid, fmtInt, useAnalyticsLocale } from "../analytics-ui"
import type { OnlineData } from "../types"
import { useAnalyticsQuery } from "../use-analytics-query"
import { OnlineVisitorsTable } from "./OnlineVisitorsTable"

export function AnalyticsOnlinePanel({ range }: { range: AnalyticsRange }) {
  const t = useTranslations("analytics")
  const lng = useAnalyticsLocale()
  const q = useAnalyticsQuery<OnlineData>("online", range, undefined, { refetchInterval: 30_000 })
  const d = q.data

  return (
    <div className="space-y-4">
      <AnalyticsPanelHeader range={range} source={d?.source} showPeriod={false}>
        <p className="text-muted-foreground text-sm">{t("onlineAutoRefresh")}</p>
      </AnalyticsPanelHeader>
      <AnalyticsQueryGate query={q}>
        <KpiGrid>
          <KpiCard
            label={t("kpi.online")}
            value={fmtInt(d?.count, lng)}
            extra={
              d?.timeout ? (
                <p className="text-muted-foreground text-xs">
                  {t("onlineTimeoutHint", { minutes: fmtInt(d.timeout, lng) })}
                </p>
              ) : null
            }
          />
        </KpiGrid>
        <OnlineVisitorsTable title={t("onlineNow")} rows={d?.visitors ?? []} />
      </AnalyticsQueryGate>
    </div>
  )
}
