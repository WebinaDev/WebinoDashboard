"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { formatInteger } from "@/lib/format"
import { normalizeUiLocale } from "@/lib/locale"

type CartRes = {
  data: {
    id: number
    items: {
      id: number
      quantity: number
      product: { id: number; name: string; price_minor: number }
    }[]
  }
}

export default function CartPage() {
  const t = useTranslations("cart")
  const locale = useLocale()
  const lng = normalizeUiLocale(locale)
  const [cart, setCart] = useState<CartRes["data"] | null>(null)

  function reload() {
    api<CartRes>("/api/v1/cart")
      .then((r) => setCart(r.data))
      .catch(() => setCart(null))
  }

  useEffect(() => {
    reload()
  }, [])

  async function remove(productId: number) {
    await api(`/api/v1/cart/items/${productId}`, { method: "DELETE" })
    reload()
  }

  const lines = cart?.items ?? []

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {lines.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="rounded-xl border">
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
                    {formatInteger(line.product.price_minor, lng)}
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
        </div>
      )}
    </div>
  )
}
