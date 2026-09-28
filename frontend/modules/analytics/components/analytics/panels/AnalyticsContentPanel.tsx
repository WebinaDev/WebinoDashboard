"use client"

import { useTranslations } from "next-intl"

import type { AnalyticsRange } from "../AnalyticsPeriodFilter"
import { AnalyticsPanelHeader, AnalyticsQueryGate, KpiCard, KpiGrid, fmtInt, useAnalyticsLocale } from "../analytics-ui"
import type { ContentData } from "../types"
import { useAnalyticsQuery } from "../use-analytics-query"

export function AnalyticsContentPanel({ range }: { range: AnalyticsRange }) {
  const t = useTranslations("analytics")
  const lng = useAnalyticsLocale()
  const q = useAnalyticsQuery<ContentData>("content", range)
  const d = q.data

  return (
    <div className="space-y-4">
      <AnalyticsPanelHeader range={range} source={d?.source} />
      <AnalyticsQueryGate query={q} variant="overview">
        <KpiGrid>
          <KpiCard label={t("content.productsCreated")} value={fmtInt(d?.products_created, lng)} />
          <KpiCard label={t("content.productsUpdated")} value={fmtInt(d?.products_updated, lng)} />
          <KpiCard label={t("content.postsPublished")} value={fmtInt(d?.posts_published, lng)} />
          <KpiCard label={t("content.pagesPublished")} value={fmtInt(d?.pages_published, lng)} />
          <KpiCard label={t("content.aiProducts")} value={fmtInt(d?.ai_products, lng)} />
          <KpiCard label={t("content.aiBlog")} value={fmtInt(d?.ai_posts, lng)} />
          <KpiCard label={t("content.aiPages")} value={fmtInt(d?.ai_pages, lng)} />
        </KpiGrid>
      </AnalyticsQueryGate>
    </div>
  )
}
