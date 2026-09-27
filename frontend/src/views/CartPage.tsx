"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { formatInteger } from "@/lib/format"
import { normalizeUiLocale } from "@/lib/locale"
import { formatMoneyText, MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { ScrollTable } from "@/components/ScrollTable"

type CartPricing = {
  active: boolean
  purchase_type: string
  installment_months: number | null
  installment_monthly_minor: number | null
  available_types: string[]
  installment_plans: { months: number; interest: number }[]
  subtotal_minor: number
  lines: { id: number; unit_price_minor: number; line_total_minor: number }[]
}

type CartData = {
  id: number
  items: {
    id: number
    quantity: number
    product: { id: number; name: string; price_minor: number }
  }[]
  pricing?: CartPricing
}

const selectClass = "border-input bg-background h-9 rounded-md border px-3 text-sm"

export default function CartPage() {
  const t = useTranslations("cart")
  const tPricing = useTranslations("pricing_storefront")
  const tTypes = useTranslations("pricing_settings.types")
  const locale = useLocale()
  const lng = normalizeUiLocale(locale)
  const [cart, setCart] = useState<CartData | null>(null)

  function reload() {
    api<CartData>("/api/v1/cart")
      .then((r) => setCart(r))
      .catch(() => setCart(null))
  }

  useEffect(() => {
    reload()
  }, [])

  async function remove(productId: number) {
    await api(`/api/v1/cart/items/${productId}`, { method: "DELETE" })
    reload()
  }

  async function setType(purchase_type: string, installment_months?: number | null) {
    const r = await api<CartData>("/api/v1/cart/purchase-type", {
      method: "PUT",
      json: { purchase_type, installment_months: installment_months ?? null },
    })
    setCart(r)
  }

  const lines = cart?.items ?? []
  const pricing = cart?.pricing
  const unitFor = (lineId: number, fallback: number) =>
    pricing?.lines.find((l) => l.id === lineId)?.unit_price_minor ?? fallback
  const showTypes = pricing?.active && pricing.available_types.length > 1

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {lines.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          {showTypes && pricing ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
              <span className="font-medium">{tPricing("purchase_type")}</span>
              <select
                className={selectClass}
                value={pricing.purchase_type}
                onChange={(e) => void setType(e.target.value)}
              >
                {pricing.available_types.map((type) => (
                  <option key={type} value={type}>
                    {tTypes(type)}
                  </option>
                ))}
              </select>
              {pricing.purchase_type === "installment" && pricing.installment_plans.length ? (
                <select
                  className={selectClass}
                  value={pricing.installment_months ?? ""}
                  onChange={(e) => void setType("installment", Number(e.target.value))}
                >
                  {pricing.installment_plans.map((plan) => (
                    <option key={plan.months} value={plan.months}>
                      {tPricing("months", { months: plan.months })}
                    </option>
                  ))}
                </select>
              ) : null}
              {pricing.purchase_type === "wholesale" ? (
                <p className="text-muted-foreground w-full text-xs">{tPricing("wholesale_cart_notice")}</p>
              ) : null}
            </div>
          ) : null}
          <ScrollTable className="border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="p-3 text-start font-medium">{t("col_product")}</th>
                  <th className="p-3 text-start font-medium">{t("quantity")}</th>
                  <th className="p-3 text-start font-medium">{t("col_price")}</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-b last:border-0">
                    <td className="p-3">{line.product.name}</td>
                    <td className="p-3">{formatInteger(line.quantity, lng)}</td>
                    <td className="p-3">
                      <MoneyDisplay amount={unitFor(line.id, line.product.price_minor)} />
                    </td>
                    <td className="p-3 text-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void remove(line.product.id)}
                      >
                        {t("remove")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
          {pricing?.active ? (
            <div className="flex flex-wrap justify-end gap-4 text-sm">
              {pricing.purchase_type === "installment" && pricing.installment_monthly_minor ? (
                <span className="text-muted-foreground">
                  {tPricing("monthly", { amount: formatMoneyText(pricing.installment_monthly_minor, lng) })}
                </span>
              ) : null}
              <MoneyDisplay className="font-semibold" amount={pricing.subtotal_minor} />
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
