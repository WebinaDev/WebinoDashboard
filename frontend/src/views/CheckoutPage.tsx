"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"

type Provider = "zarinpal" | "digipay" | "snapppay" | "torobpay"

const PROVIDERS: Provider[] = ["zarinpal", "digipay", "snapppay", "torobpay"]

type CartPricing = { active: boolean; purchase_type: string; allowed_gateways: string[] }

export default function CheckoutPage() {
  const t = useTranslations("checkout")
  const tPricing = useTranslations("pricing_storefront")
  const tTypes = useTranslations("pricing_settings.types")
  const [pricing, setPricing] = useState<CartPricing | null>(null)
  const searchParams = useSearchParams()
  const [orderId, setOrderId] = useState<number | null>(null)
  const [intentUrl, setIntentUrl] = useState<string | null>(null)
  const [paymentFlash, setPaymentFlash] = useState<string | null>(null)
  const [shippingAddress, setShippingAddress] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerNote, setCustomerNote] = useState("")

  useEffect(() => {
    api<{ pricing?: CartPricing }>("/api/v1/cart")
      .then((c) => setPricing(c.pricing ?? null))
      .catch(() => setPricing(null))
  }, [])

  const allowed = pricing?.active && pricing.allowed_gateways.length
    ? PROVIDERS.filter((p) => pricing.allowed_gateways.includes(p))
    : PROVIDERS

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
        json: { order_id: orderId, provider },
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
      {allowed.length === 0 ? <p className="text-destructive text-sm">{tPricing("no_gateway")}</p> : null}
      <div className="flex flex-wrap gap-2">
        {allowed.map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="secondary"
            disabled={!orderId}
            onClick={() => void pay(provider)}
          >
            {t(`pay_${provider}`)}
          </Button>
        ))}
      </div>
      {intentUrl ? (
        <p className="break-all text-muted-foreground text-xs">{intentUrl}</p>
      ) : null}
    </div>
  )
}
