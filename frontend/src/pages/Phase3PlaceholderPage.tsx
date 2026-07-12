"use client"

import { useTranslation } from "react-i18next"

export default function Phase3PlaceholderPage({
  titleKey,
}: {
  titleKey: "mobile_title" | "ai_title"
}) {
  const { t } = useTranslation(["phase3"])

  return (
    <div className="rounded-xl border p-6">
      <h1 className="text-xl font-semibold">{t(`phase3:${titleKey}`)}</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">{t("phase3:stub")}</p>
    </div>
  )
}
