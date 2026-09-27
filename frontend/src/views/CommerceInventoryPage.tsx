"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatInteger } from "@/lib/format"
import { normalizeUiLocale } from "@/lib/locale"
import { ScrollTable } from "@/components/ScrollTable"

type Low = {
  id: number
  name: string
  sku: string | null
  stock: number
  price_minor: number
  currency: string
}

type ShopProductsPayload = {
  low_stock_threshold?: number
}

export default function CommerceInventoryPage() {
  const t = useTranslations("phase2")
  const tCatalog = useTranslations("catalog")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const lng = normalizeUiLocale(locale)
  const [low, setLow] = useState<Low[]>([])
  const [outCount, setOutCount] = useState(0)
  const [threshold, setThreshold] = useState(10)
  const [thresholdDraft, setThresholdDraft] = useState(10)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const loadSummary = useCallback(() => {
    api<{
      low_stock_products: Low[]
      out_of_stock_count: number
      low_stock_threshold: number
    }>("/api/v1/inventory/summary")
      .then((r) => {
        setLow(r.low_stock_products)
        setOutCount(r.out_of_stock_count)
        setThreshold(r.low_stock_threshold)
        setThresholdDraft(r.low_stock_threshold)
      })
      .catch(() => {
        setLow([])
        setOutCount(0)
      })
  }, [])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  async function saveThreshold() {
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const current = await api<ShopProductsPayload>("/api/v1/settings/shop/products")
      await api("/api/v1/settings/shop/products", {
        method: "PUT",
        json: {
          payload: {
            ...current,
            low_stock_threshold: Number(thresholdDraft) || 0,
          },
        },
      })
      setThreshold(Number(thresholdDraft) || 0)
      setSaved(true)
      loadSummary()
    } catch (e) {
      setSaveError(getApiErrorMessage(e as Error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("inventory_title")}</h1>
      <div className="flex max-w-md flex-wrap items-end gap-3">
        <div className="grid flex-1 gap-2">
          <Label htmlFor="low-stock-threshold">{t("inventory_threshold")}</Label>
          <Input
            id="low-stock-threshold"
            type="number"
            min={0}
            value={thresholdDraft}
            onChange={(e) => setThresholdDraft(Number(e.target.value))}
          />
        </div>
        <Button type="button" disabled={saving || thresholdDraft === threshold} onClick={() => void saveThreshold()}>
          {saving ? tCommon("saving") : tCommon("save")}
        </Button>
        {saved ? <p className="text-sm text-green-600">{t("inventory_threshold_saved")}</p> : null}
        {saveError ? <p className="text-destructive text-sm">{saveError}</p> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-4">
          <div className="text-muted-foreground text-sm">{t("inventory_out_heading")}</div>
          <div className="text-2xl font-semibold">{formatInteger(outCount, lng)}</div>
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-lg font-medium">{t("inventory_low_heading")}</h2>
        <ScrollTable className="border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="p-3 text-start">{tCatalog("name")}</th>
                <th className="p-3 text-start">{tCatalog("sku")}</th>
                <th className="p-3 text-start">{tCatalog("stock")}</th>
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
                    <td className="p-3">
                      <Link href={`/dashboard/products/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="p-3 font-mono text-xs">{p.sku ?? "—"}</td>
                    <td className="p-3">{formatInteger(p.stock, lng)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ScrollTable>
      </div>
    </div>
  )
}
