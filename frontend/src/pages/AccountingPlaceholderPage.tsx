"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { api } from "@/lib/api"

type Status = {
  licensed: boolean
  bundle_present: boolean
  source_configured: boolean
}

export default function AccountingPlaceholderPage() {
  const { t } = useTranslation(["nav", "modules", "common"])
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    let cancelled = false
    api<{ data: Status }>("/api/v1/accounting/status")
      .then((r) => {
        if (!cancelled) {
          setStatus(r.data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="rounded-xl border p-6">
      <h1 className="text-xl font-semibold">{t("nav:accounting")}</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
        {t("modules:accounting_hint")}
      </p>
      {status ? (
        <ul className="text-muted-foreground mt-4 max-w-xl list-inside list-disc text-sm">
          <li>
            {t("modules:accounting_row_license")}:{" "}
            {status.licensed ? t("common:yes") : t("common:no")}
          </li>
          <li>
            {t("modules:accounting_row_bundle")}:{" "}
            {status.bundle_present ? t("common:yes") : t("common:no")}
          </li>
          <li>
            {t("modules:accounting_row_source")}:{" "}
            {status.source_configured ? t("common:yes") : t("common:no")}
          </li>
        </ul>
      ) : (
        <p className="text-muted-foreground mt-4 text-sm">
          {t("common:loading")}
        </p>
      )}
    </div>
  )
}
