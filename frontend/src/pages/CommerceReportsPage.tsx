"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { api } from "@/lib/api"
import { formatInteger } from "@/lib/format"

type Overview = {
  orders_paid: number
  orders_pending_payment: number
  orders_total: number
  conversion_rate_paid_over_total: number | null
  top_products: { product_id: number; name?: string | null; units_sold: number }[]
}

export default function CommerceReportsPage() {
  const { t, i18n } = useTranslation(["phase2"])
  const lng = i18n.language.startsWith("fa") ? "fa" : "en"
  const [data, setData] = useState<Overview | null>(null)

  useEffect(() => {
    api<{ data: Overview }>("/api/v1/reports/overview")
      .then((r) => setData(r.data))
      .catch(() => setData(null))
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("phase2:reports_title")}</h1>
      <p className="text-muted-foreground text-sm">{t("phase2:stub")}</p>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border p-4">
          <div className="text-muted-foreground text-sm">{t("phase2:reports_paid")}</div>
          <div className="text-2xl font-semibold">
            {data ? formatInteger(data.orders_paid, lng) : "—"}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-muted-foreground text-sm">{t("phase2:reports_pending")}</div>
          <div className="text-2xl font-semibold">
            {data ? formatInteger(data.orders_pending_payment, lng) : "—"}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-muted-foreground text-sm">Conversion</div>
          <div className="text-2xl font-semibold">
            {data?.conversion_rate_paid_over_total != null
              ? String(data.conversion_rate_paid_over_total)
              : "—"}
          </div>
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-lg font-medium">{t("phase2:reports_top")}</h2>
        <ul className="text-sm space-y-1">
          {(data?.top_products ?? []).map((r) => (
            <li key={r.product_id} className="flex justify-between rounded border px-3 py-2">
              <span>{r.name ?? `#${r.product_id}`}</span>
              <span className="font-mono">{formatInteger(r.units_sold, lng)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
