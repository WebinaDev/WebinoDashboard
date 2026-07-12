"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { api } from "@/lib/api"
import { formatInteger } from "@/lib/format"

type Low = {
  id: number
  name: string
  sku: string | null
  stock: number
  price_minor: number
  currency: string
}

export default function CommerceInventoryPage() {
  const { t, i18n } = useTranslation(["phase2"])
  const lng = i18n.language.startsWith("fa") ? "fa" : "en"
  const [low, setLow] = useState<Low[]>([])
  const [outCount, setOutCount] = useState(0)
  const [threshold, setThreshold] = useState(10)

  useEffect(() => {
    api<{
      data: { low_stock_products: Low[]; out_of_stock_count: number; low_stock_threshold: number }
    }>("/api/v1/inventory/summary")
      .then((r) => {
        setLow(r.data.low_stock_products)
        setOutCount(r.data.out_of_stock_count)
        setThreshold(r.data.low_stock_threshold)
      })
      .catch(() => {
        setLow([])
        setOutCount(0)
      })
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("phase2:inventory_title")}</h1>
      <p className="text-muted-foreground text-sm">
        {t("phase2:stub")} — threshold: {threshold}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-4">
          <div className="text-muted-foreground text-sm">{t("phase2:inventory_out_heading")}</div>
          <div className="text-2xl font-semibold">{formatInteger(outCount, lng)}</div>
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-lg font-medium">{t("phase2:inventory_low_heading")}</h2>
        <div className="rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="p-3 text-start">Name</th>
                <th className="p-3 text-start">SKU</th>
                <th className="p-3 text-start">Stock</th>
              </tr>
            </thead>
            <tbody>
              {low.length === 0 ? (
                <tr>
                  <td className="text-muted-foreground p-4" colSpan={3}>
                    —
                  </td>
                </tr>
              ) : (
                low.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="p-3">{p.name}</td>
                    <td className="p-3 font-mono text-xs">{p.sku ?? "—"}</td>
                    <td className="p-3">{formatInteger(p.stock, lng)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
