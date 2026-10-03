"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { trackAnalyticsEvent } from "@/lib/analytics-track"
import { api } from "@/lib/api"
import { toLocaleDigits } from "@/lib/locale"

type Provider = "zarinpal" | "digipay" | "snapppay" | "torobpay"
type PayMode = "cash" | "installment"

type CheckoutGateway = {
  id: Provider
  title: string
  cash_enabled: boolean
  installment_enabled: boolean
  fee_percent: number
  fee_payer: string
  quote?: { fee_percent: number; fee_payer: string; fee_minor: number; base_minor: number; charge_minor: number }
}

type CartPricing = { active: boolean; purchase_type: string; allowed_gateways: string[] }

export default function CheckoutPage() {
  const t = useTranslations("checkout")
  const tPricing = useTranslations("pricing_storefront")
  const tTypes = useTranslations("pricing_settings.types")
  const locale = useLocale()
  const [pricing, setPricing] = useState<CartPricing | null>(null)
  const [gateways, setGateways] = useState<CheckoutGateway[]>([])
  const [mode, setMode] = useState<PayMode>("cash")
  const searchParams = useSearchParams()
  const [orderId, setOrderId] = useState<number | null>(null)
  const [intentUrl, setIntentUrl] = useState<string | null>(null)
  const [paymentFlash, setPaymentFlash] = useState<string | null>(null)
  const [shippingAddress, setShippingAddress] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerNote, setCustomerNote] = useState("")

  useEffect(() => {
    trackAnalyticsEvent("checkout_start")
  }, [])

  useEffect(() => {
    api<{ pricing?: CartPricing }>("/api/v1/cart")
      .then((c) => {
        setPricing(c.pricing ?? null)
        if (c.pricing?.purchase_type === "installment") setMode("installment")
      })
      .catch(() => setPricing(null))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (orderId) params.set("order_id", String(orderId))
    api<{ gateways?: CheckoutGateway[] }>(`/api/v1/payments/checkout-options?${params.toString()}`)
      .then((res) => setGateways(res.gateways ?? []))
      .catch(() => setGateways([]))
  }, [orderId])

  const allowed = gateways.filter((gateway) => {
    if (pricing?.active && pricing.allowed_gateways.length && !pricing.allowed_gateways.includes(gateway.id)) {
      return false
    }
    return mode === "installment" ? gateway.installment_enabled : gateway.cash_enabled
  })

  useEffect(() => {
    const p = searchParams?.get("payment")
    if (p === "success" || p === "failed") {
      setPaymentFlash(p)
    }
  }, [searchParams])

  async function checkout() {
    const order = await api<{ id: number }>("/api/v1/checkout", {
      method: "POST",
      json: {
        shipping_address: shippingAddress || null,
        customer_phone: customerPhone || null,
        customer_note: customerNote || null,
      },
    })
    setOrderId(order.id)
    setIntentUrl(null)
  }

  async function pay(provider: Provider) {
    if (!orderId) {
      return
    }
    const intent = await api<{ redirect_url: string | null }>(
      "/api/v1/payments/intent",
      {
        method: "POST",
        json: { order_id: orderId, provider, mode },
      }
    )
    const url = intent.redirect_url
    if (url?.startsWith("http")) {
      window.location.assign(url)
      return
    }
    setIntentUrl(url ?? null)
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {paymentFlash === "success" ? (
        <p className="text-sm text-green-600 dark:text-green-400">
          {t("payment_ok")}
        </p>
      ) : null}
      {paymentFlash === "failed" ? (
        <p className="text-destructive text-sm">{t("payment_failed")}</p>
      ) : null}
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="ship">{t("shipping_address")}</Label>
          <Input
            id="ship"
            value={shippingAddress}
            onChange={(e) => setShippingAddress(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">{t("customer_phone")}</Label>
          <Input
            id="phone"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            dir="ltr"
            className="font-mono"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="note">{t("customer_note")}</Label>
          <Input id="note" value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} />
        </div>
      </div>
      <Button type="button" onClick={() => void checkout()}>
        {t("place_order")}
      </Button>
      {orderId ? (
        <p className="text-muted-foreground text-sm">
          {t("order_created")} #{orderId}
        </p>
      ) : null}
      {pricing?.active && pricing.purchase_type !== "cash" && pricing.allowed_gateways.length ? (
        <p className="text-muted-foreground text-xs">
          {tPricing("gateways_filtered", { type: tTypes(pricing.purchase_type) })}
        </p>
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
      {allowed.length === 0 ? <p className="text-muted-foreground text-sm">{t("no_gateway_mode")}</p> : null}
      <div className="flex flex-col gap-2">
        {allowed.map((gateway) => {
          const quote = gateway.quote
          const percent = quote?.fee_percent ?? gateway.fee_percent
          return (
            <div key={gateway.id} className="rounded-md border p-3">
              {percent > 0 && quote ? (
                <div className="text-muted-foreground mb-2 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>{t("base")}</span>
                    <MoneyDisplay amount={quote.base_minor} />
                  </div>
                  <div className="flex justify-between">
                    <span>{t("fee_line", { percent: toLocaleDigits(percent, locale) })}</span>
                    <MoneyDisplay amount={quote.fee_minor} />
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>{t("total")}</span>
                    <MoneyDisplay amount={quote.charge_minor} />
                  </div>
                  {quote.fee_payer === "merchant" ? <p>{t("fee_merchant")}</p> : null}
                </div>
              ) : percent > 0 ? (
                <p className="text-muted-foreground mb-2 text-xs">
                  {t("fee_line", { percent: toLocaleDigits(percent, locale) })}
                </p>
              ) : null}
              <Button type="button" variant="secondary" disabled={!orderId} onClick={() => void pay(gateway.id)}>
                {t(`pay_${gateway.id}`)}
              </Button>
            </div>
          )
        })}
      </div>
      {intentUrl ? (
        <p className="break-all text-muted-foreground text-xs">{intentUrl}</p>
      ) : null}
    </div>
  )
}
