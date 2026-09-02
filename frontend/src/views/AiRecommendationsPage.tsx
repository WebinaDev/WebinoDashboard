"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"

export default function AiRecommendationsPage() {
  const t = useTranslations("phase3")
  const [ids, setIds] = useState<number[]>([])
  const [pending, setPending] = useState(false)

  async function run() {
    setPending(true)
    try {
      const r = await api<{ data: { recommended_product_ids: number[] } }>("/api/v1/ai/recommendations", {
        method: "POST",
        json: { product_ids: [] },
      })
      setIds(r.data.recommended_product_ids)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("ai_title")}</h1>
      <Button type="button" disabled={pending} onClick={() => void run()}>
        {t("ai_run")}
      </Button>
      <p className="text-sm">
        {t("ai_ids")}:{" "}
        <span className="font-mono text-xs" dir="ltr">
          {ids.join(", ") || "—"}
        </span>
      </p>
    </div>
  )
}
