"use client"

import { useTranslation } from "react-i18next"

export default function UsersPage() {
  const { t } = useTranslation(["nav"])

  return (
    <div className="rounded-xl border bg-muted/30 p-6">
      <h1 className="text-xl font-semibold">{t("nav:rbac")}</h1>
      <p className="text-muted-foreground mt-2 text-sm">{t("nav:rbac_stub")}</p>
    </div>
  )
}
