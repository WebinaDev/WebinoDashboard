"use client"

import { useTranslations } from "next-intl"

import type { AnalyticsRange } from "../AnalyticsPeriodFilter"
import { AnalyticsPanelHeader, AnalyticsQueryGate, DataTable, fmtInt, useAnalyticsLocale } from "../analytics-ui"
import type { ReferralCategory, ReferralsData } from "../types"
import { useAnalyticsQuery } from "../use-analytics-query"

const CATEGORIES: ReferralCategory[] = ["direct", "search", "social", "referral"]

export function AnalyticsReferralsPanel({ range }: { range: AnalyticsRange }) {
  const t = useTranslations("analytics")
  const lng = useAnalyticsLocale()
  const q = useAnalyticsQuery<ReferralsData>("referrals", range)
  const d = q.data

  const categoryLabel = (c: string) =>
    (CATEGORIES as string[]).includes(c) ? t(`ref.${c as ReferralCategory}`) : c || t("unknown")

  const byCategory = CATEGORIES.map((c) => ({ category: c, visits: Number(d?.by_category?.[c] ?? 0) }))
  const hasCategoryData = byCategory.some((r) => r.visits > 0)

  return (
    <div className="space-y-4">
      <AnalyticsPanelHeader range={range} source={d?.source} />
      <AnalyticsQueryGate query={q}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <DataTable
            title={t("refByCategory")}
            rows={hasCategoryData ? byCategory : []}
            rowKey={(r) => r.category}
            columns={[
              { key: "category", label: t("col.category"), cell: (r) => categoryLabel(r.category) },
              { key: "visits", label: t("col.visits"), cell: (r) => fmtInt(r.visits, lng) },
            ]}
          />
          <DataTable
            title={t("refSources")}
            rows={d?.items ?? []}
            rowKey={(r, i) => `${r.category}-${r.source}-${i}`}
            columns={[
              {
                key: "source",
                label: t("col.source"),
                cell: (r) => (
                  <span dir="ltr" className="font-mono text-xs">
                    {r.source || categoryLabel("direct")}
                  </span>
                ),
              },
              { key: "category", label: t("col.category"), cell: (r) => categoryLabel(r.category) },
              { key: "visits", label: t("col.visits"), cell: (r) => fmtInt(r.visits, lng) },
            ]}
          />
        </div>
      </AnalyticsQueryGate>
    </div>
  )
}
