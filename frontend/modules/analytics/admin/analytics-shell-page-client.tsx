"use client"

import { useTranslations } from "next-intl"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { AnalyticsSectionPanel } from "./analytics-panels"

export default function AnalyticsShellPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("analytics")
  const section = route.path.replace(/^analytics\//, "") || "overview"
  const sectionKey = section === "month-summary" ? "monthSummary" : section

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {t(`sections.${sectionKey}` as never)}
        </h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>
      <AnalyticsSectionPanel section={section} />
    </div>
  )
}
