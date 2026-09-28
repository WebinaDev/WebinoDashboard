"use client"

import type { ComponentType } from "react"
import { useTranslations } from "next-intl"
import type { ResolvedAdminRoute } from "@/kernel/types"

import { useAnalyticsRange, type AnalyticsRange } from "../components/analytics/AnalyticsPeriodFilter"
import { AnalyticsCommercePanel } from "../components/analytics/panels/AnalyticsCommercePanel"
import { AnalyticsComparePanel } from "../components/analytics/panels/AnalyticsComparePanel"
import { AnalyticsContentPanel } from "../components/analytics/panels/AnalyticsContentPanel"
import { AnalyticsDevicesPanel, AnalyticsGeoPanel } from "../components/analytics/panels/AnalyticsDimensionPanel"
import { AnalyticsMonthSummaryPanel } from "../components/analytics/panels/AnalyticsMonthSummaryPanel"
import { AnalyticsOnlinePanel } from "../components/analytics/panels/AnalyticsOnlinePanel"
import { AnalyticsOverviewPanel } from "../components/analytics/panels/AnalyticsOverviewPanel"
import { AnalyticsPagesPanel } from "../components/analytics/panels/AnalyticsPagesPanel"
import { AnalyticsReferralsPanel } from "../components/analytics/panels/AnalyticsReferralsPanel"
import { AnalyticsSeoPanel } from "../components/analytics/panels/AnalyticsSeoPanel"
import { AnalyticsSupportPanel } from "../components/analytics/panels/AnalyticsSupportPanel"
import { AnalyticsVisitorsPanel } from "../components/analytics/panels/AnalyticsVisitorsPanel"

const PANELS = {
  overview: AnalyticsOverviewPanel,
  visitors: AnalyticsVisitorsPanel,
  pages: AnalyticsPagesPanel,
  referrals: AnalyticsReferralsPanel,
  geo: AnalyticsGeoPanel,
  devices: AnalyticsDevicesPanel,
  online: AnalyticsOnlinePanel,
  commerce: AnalyticsCommercePanel,
  compare: AnalyticsComparePanel,
  seo: AnalyticsSeoPanel,
  support: AnalyticsSupportPanel,
  content: AnalyticsContentPanel,
  monthSummary: AnalyticsMonthSummaryPanel,
} satisfies Record<string, ComponentType<{ range: AnalyticsRange }>>

type SectionKey = keyof typeof PANELS

function toSectionKey(path: string): SectionKey {
  const raw = path.replace(/^analytics\/?/, "") || "overview"
  const key = raw === "month-summary" ? "monthSummary" : raw
  return key in PANELS ? (key as SectionKey) : "overview"
}

export default function AnalyticsShellPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("analytics")
  const range = useAnalyticsRange()
  const section = toSectionKey(route.path)
  const Panel = PANELS[section]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t(`sections.${section}`)}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>
      <Panel range={range} />
    </div>
  )
}
