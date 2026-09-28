"use client"

import { useTranslations } from "next-intl"

import { Card, CardContent } from "@/components/ui/card"

import type { AnalyticsRange } from "../AnalyticsPeriodFilter"
import {
  AnalyticsPanelHeader,
  AnalyticsQueryGate,
  KpiCard,
  KpiGrid,
  fmtDecimal,
  fmtInt,
  fmtPct,
  useAnalyticsLocale,
} from "../analytics-ui"
import type { SeoData } from "../types"
import { useAnalyticsQuery } from "../use-analytics-query"

export function AnalyticsSeoPanel({ range }: { range: AnalyticsRange }) {
  const t = useTranslations("analytics")
  const lng = useAnalyticsLocale()
  const q = useAnalyticsQuery<SeoData>("seo", range)
  const d = q.data

  return (
    <div className="space-y-4">
      <AnalyticsPanelHeader range={range} source={d?.source} />
      <AnalyticsQueryGate query={q} variant="overview">
        <KpiGrid className="lg:grid-cols-5">
          <KpiCard
            label={t("seo.keywords")}
            value={fmtInt(d?.keywords_in_use, lng)}
            extra={
              d?.keywords_ai_month ? (
                <p className="text-muted-foreground text-xs">
                  {t("seo.keywordsAiMonth", { count: fmtInt(d.keywords_ai_month, lng) })}
                </p>
              ) : null
            }
          />
          <KpiCard label={t("seo.optimizedPages")} value={fmtInt(d?.optimized_pages, lng)} />
          <KpiCard label={t("seo.internalLinks")} value={fmtDecimal(d?.internal_links_avg, lng)} />
          <KpiCard label={t("seo.externalLinks")} value={fmtDecimal(d?.external_links_avg, lng)} />
          <KpiCard
            label={t("seo.noindexShare")}
            value={fmtPct(d?.noindex_pct, lng)}
            extra={
              d?.publish_count ? (
                <p className="text-muted-foreground text-xs">
                  {t("seo.noindexOf", {
                    count: fmtInt(d.noindex_count, lng),
                    total: fmtInt(d.publish_count, lng),
                  })}
                </p>
              ) : null
            }
          />
        </KpiGrid>
        {!d?.gsc_connected ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="border-dashed shadow-sm">
              <CardContent className="space-y-2 pt-6">
                <p className="text-sm font-medium">{t("seo.gscMissing")}</p>
                <p className="text-muted-foreground text-sm">{t("seo.rankPlaceholder")}</p>
              </CardContent>
            </Card>
            <Card className="border-dashed shadow-sm">
              <CardContent className="space-y-2 pt-6">
                <p className="text-sm font-medium">{t("seo.gscMissing")}</p>
                <p className="text-muted-foreground text-sm">{t("seo.indexPlaceholder")}</p>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </AnalyticsQueryGate>
    </div>
  )
}
