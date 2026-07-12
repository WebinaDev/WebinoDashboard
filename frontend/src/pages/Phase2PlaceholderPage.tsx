"use client"

import { useTranslation } from "react-i18next"

export default function Phase2PlaceholderPage({
  titleKey,
}: {
  titleKey: "inventory_title" | "reports_title" | "marketing_title" | "cms_title"
}) {
  const { t } = useTranslation(["phase2"])

  return (
    <div className="rounded-xl border p-6">
      <h1 className="text-xl font-semibold">{t(`phase2:${titleKey}`)}</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">{t("phase2:stub")}</p>
    </div>
  )
}
