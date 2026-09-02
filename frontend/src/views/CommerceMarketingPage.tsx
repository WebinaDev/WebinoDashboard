"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { api } from "@/lib/api"

type Campaign = { id: number; name: string; status: string }

export default function CommerceMarketingPage() {
  const t = useTranslations("phase2")
  const [rows, setRows] = useState<Campaign[]>([])

  useEffect(() => {
    api<{ data: Campaign[] }>("/api/v1/marketing/campaigns")
      .then((r) => setRows(r.data))
      .catch(() => setRows([]))
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("marketing_title")}</h1>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("marketing_empty")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id} className="flex justify-between rounded-lg border px-3 py-2 text-sm">
              <span>{c.name}</span>
              <span className="text-muted-foreground font-mono text-xs">{c.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
