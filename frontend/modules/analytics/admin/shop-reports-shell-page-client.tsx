"use client"

import { useTranslations } from "next-intl"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { ShopReportPanel } from "./shop-reports-panels"

export default function ShopReportsShellPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("reports")
  const section = route.path.replace(/^reports\//, "") || "overview"

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {t(`sections.${section}` as never)}
        </h1>
        <p className="text-muted-foreground text-sm">{t("shopDescription")}</p>
      </div>
      <ShopReportPanel section={section} />
    </div>
  )
}
