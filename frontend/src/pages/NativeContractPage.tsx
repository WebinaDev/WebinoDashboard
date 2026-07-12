"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { api } from "@/lib/api"

export default function NativeContractPage() {
  const { t } = useTranslation(["phase3"])
  const [json, setJson] = useState<string>("")

  useEffect(() => {
    api<Record<string, unknown>>("/api/v1/contracts/mobile")
      .then((r) => setJson(JSON.stringify(r, null, 2)))
      .catch(() => setJson("{}"))
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("phase3:mobile_title")}</h1>
      <p className="text-muted-foreground text-sm">{t("phase3:mobile_hint")}</p>
      <pre className="bg-muted max-h-[480px] overflow-auto rounded-lg p-4 text-xs" dir="ltr">
        {json}
      </pre>
    </div>
  )
}
