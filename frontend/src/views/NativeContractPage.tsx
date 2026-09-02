"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { api } from "@/lib/api"

export default function NativeContractPage() {
  const t = useTranslations("phase3")
  const [json, setJson] = useState<string>("")

  useEffect(() => {
    api<Record<string, unknown>>("/api/v1/contracts/mobile")
      .then((r) => setJson(JSON.stringify(r, null, 2)))
      .catch(() => setJson("{}"))
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("mobile_title")}</h1>
      <p className="text-muted-foreground text-sm">{t("mobile_hint")}</p>
      <pre className="bg-muted max-h-[480px] overflow-auto rounded-lg p-4 text-xs" dir="ltr">
        {json}
      </pre>
    </div>
  )
}
