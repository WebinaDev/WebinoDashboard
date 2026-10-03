"use client"

import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { Button } from "@/components/ui/button"
import type { ResolvedSiteRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { toLocaleDigits } from "@/lib/locale"

type PayMode = "cash" | "installment"

type Gateway = {
  id: string
  label: string
  cash_enabled?: boolean
  installment_enabled?: boolean
  fee_percent?: number
  fee_payer?: string
  fee_minor?: number
  base_minor?: number
  charge_minor?: number
}

type PayPayload = {
  id: number
  number?: string | null
  status: string
  total_minor: number
  subtotal_minor?: number
  discount_minor?: number
  shipping_minor?: number
  tax_minor?: number
  customer_name?: string | null
  gateways: Gateway[]
  items?: Array<{ product_name?: string; quantity?: number; unit_price_minor?: number }>
}

const ONLINE = new Set(["zarinpal", "digipay", "snapppay", "torobpay", "bale_pay", "basalam_pay"])

export default function OrderPayPageClient({
  route,
  searchParams,
}: {
  route: ResolvedSiteRoute
  searchParams: Record<string, string | undefined>
}) {
  const t = useTranslations("order_pay")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const [mode, setMode] = useState<PayMode>("cash")
  const orderId = route.params?.orderId
  const token = searchParams.token ?? ""

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-order-pay", orderId, token],
    enabled: Boolean(orderId && token),
    queryFn: () =>
      api<PayPayload>(
        `/api/v1/public/orders/${orderId}/pay?token=${encodeURIComponent(token)}`,
      ),
  })

  const pay = useMutation({
    mutationFn: (provider: string) =>
      api<{ redirect_url?: string | null }>(
        `/api/v1/public/orders/${orderId}/pay/intent?token=${encodeURIComponent(token)}`,
        { method: "POST", json: { provider, token, mode } },
      ),
    onSuccess: (res) => {
      const url = res.redirect_url
      if (url?.startsWith("http")) {
        window.location.assign(url)
      }
    },
  })

  if (!orderId || !token) {
    return <p className="text-destructive text-sm p-6">{t("invalid_link")}</p>
  }

  if (isLoading) {
    return <p className="text-muted-foreground text-sm p-6">{tCommon("loading")}</p>
  }

  if (error || !data) {
    return <p className="text-destructive text-sm p-6">{t("invalid_link")}</p>
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-6" dir="auto">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {data.number ? (
        <p className="text-muted-foreground text-sm">
          {data.number}
          {data.customer_name ? ` · ${data.customer_name}` : ""}
        </p>
      ) : null}
      {data.items && data.items.length > 0 ? (
        <ul className="space-y-2 rounded-md border p-3 text-sm">
          {data.items.map((it, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>
                {it.product_name} × {it.quantity}
              </span>
              <MoneyDisplay amount={(it.unit_price_minor ?? 0) * (it.quantity ?? 1)} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="rounded-md border p-3 text-sm space-y-1">
        {typeof data.discount_minor === "number" && data.discount_minor > 0 ? (
          <div className="flex justify-between">
            <span>{t("discount")}</span>
            <MoneyDisplay amount={data.discount_minor} />
          </div>
        ) : null}
        {typeof data.shipping_minor === "number" && data.shipping_minor > 0 ? (
          <div className="flex justify-between">
            <span>{t("shipping")}</span>
            <MoneyDisplay amount={data.shipping_minor} />
          </div>
        ) : null}
        {typeof data.tax_minor === "number" && data.tax_minor > 0 ? (
          <div className="flex justify-between">
            <span>{t("tax")}</span>
            <MoneyDisplay amount={data.tax_minor} />
          </div>
        ) : null}
        <div className="flex justify-between font-semibold">
          <span>{t("total")}</span>
          <MoneyDisplay amount={data.total_minor} />
        </div>
      </div>
      {pay.error ? (
        <p className="text-destructive text-sm">{getApiErrorMessage(pay.error as Error)}</p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant={mode === "cash" ? "default" : "outline"} onClick={() => setMode("cash")}>
          {t("mode_cash")}
        </Button>
        <Button
          type="button"
          variant={mode === "installment" ? "default" : "outline"}
          onClick={() => setMode("installment")}
        >
          {t("mode_installment")}
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {data.gateways
          .filter((g) => {
            if (!ONLINE.has(g.id)) return mode === "cash"
            if (mode === "installment") return g.installment_enabled !== false && g.installment_enabled === true
            return g.cash_enabled !== false && (g.cash_enabled === true || g.cash_enabled === undefined)
          })
          .map((g) => (
          <div key={g.id} className="rounded-md border p-3">
            {ONLINE.has(g.id) && (g.fee_percent ?? 0) > 0 ? (
              <div className="text-muted-foreground mb-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>{t("base")}</span>
                  <MoneyDisplay amount={g.base_minor ?? data.total_minor} />
                </div>
                <div className="flex justify-between">
                  <span>{t("fee_line", { percent: toLocaleDigits(g.fee_percent ?? 0, locale) })}</span>
                  <MoneyDisplay amount={g.fee_minor ?? 0} />
                </div>
                <div className="flex justify-between font-medium">
                  <span>{t("total_due")}</span>
                  <MoneyDisplay amount={g.charge_minor ?? data.total_minor} />
                </div>
              </div>
            ) : null}
            <Button
              variant="secondary"
              disabled={pay.isPending}
              onClick={() => {
                if (ONLINE.has(g.id)) {
                  pay.mutate(g.id)
                }
              }}
            >
              {ONLINE.has(g.id) ? t("pay_with", { gateway: g.label }) : t("offline_gateway")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
