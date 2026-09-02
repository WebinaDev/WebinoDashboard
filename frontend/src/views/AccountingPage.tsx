"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { api } from "@/lib/api"

type Status = {
  licensed: boolean
  bundle_present: boolean
  source_configured: boolean
}

export default function AccountingPage() {
  const tNav = useTranslations("nav")
  const tModules = useTranslations("modules")
  const tCommon = useTranslations("common")
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
      <h1 className="text-xl font-semibold">{tNav("accounting")}</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
        {tModules("accounting_hint")}
      </p>
      {status ? (
        <ul className="text-muted-foreground mt-4 max-w-xl list-inside list-disc text-sm">
          <li>
            {tModules("accounting_row_license")}:{" "}
            {status.licensed ? tCommon("yes") : tCommon("no")}
          </li>
          <li>
            {tModules("accounting_row_bundle")}:{" "}
            {status.bundle_present ? tCommon("yes") : tCommon("no")}
          </li>
          <li>
            {tModules("accounting_row_source")}:{" "}
            {status.source_configured ? tCommon("yes") : tCommon("no")}
          </li>
        </ul>
      ) : (
        <p className="text-muted-foreground mt-4 text-sm">{tCommon("em_dash")}</p>
      )}
    </div>
  )
}
