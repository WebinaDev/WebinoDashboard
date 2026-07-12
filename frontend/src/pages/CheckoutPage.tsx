"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"

export default function CheckoutPage() {
  const { t } = useTranslation(["checkout"])
  const searchParams = useSearchParams()
  const [orderId, setOrderId] = useState<number | null>(null)
  const [intentUrl, setIntentUrl] = useState<string | null>(null)
  const [paymentFlash, setPaymentFlash] = useState<string | null>(null)
  const [shippingAddress, setShippingAddress] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerNote, setCustomerNote] = useState("")

  useEffect(() => {
    const p = searchParams?.get("payment")
    if (p === "success" || p === "failed") {
      setPaymentFlash(p)
    }
  }, [searchParams])

  async function checkout() {
    const order = await api<{ data: { id: number } }>("/api/v1/checkout", {
      method: "POST",
      json: {
        shipping_address: shippingAddress || null,
        customer_phone: customerPhone || null,
        customer_note: customerNote || null,
      },
    })
    setOrderId(order.data.id)
    setIntentUrl(null)
  }

  async function pay(provider: "zarinpal" | "digipay") {
    if (!orderId) {
      return
    }
    const intent = await api<{ data: { redirect_url: string | null } }>(
      "/api/v1/payments/intent",
      {
        method: "POST",
        json: { order_id: orderId, provider },
      }
    )
    const url = intent.data.redirect_url
    if (url?.startsWith("http")) {
      window.location.assign(url)
      return
    }
    setIntentUrl(url ?? null)
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("checkout:title")}</h1>
      {paymentFlash === "success" ? (
        <p className="text-sm text-green-600 dark:text-green-400">
          {t("checkout:payment_ok")}
        </p>
      ) : null}
      {paymentFlash === "failed" ? (
        <p className="text-destructive text-sm">{t("checkout:payment_failed")}</p>
      ) : null}
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="ship">{t("checkout:shipping_address")}</Label>
          <Input
            id="ship"
            value={shippingAddress}
            onChange={(e) => setShippingAddress(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">{t("checkout:customer_phone")}</Label>
          <Input
            id="phone"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            dir="ltr"
            className="font-mono"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="note">{t("checkout:customer_note")}</Label>
          <Input id="note" value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} />
        </div>
      </div>
      <Button type="button" onClick={() => void checkout()}>
        {t("checkout:place_order")}
      </Button>
      {orderId ? (
        <p className="text-muted-foreground text-sm">
          {t("checkout:order_created")} #{orderId}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!orderId}
          onClick={() => void pay("zarinpal")}
        >
          {t("checkout:pay_zarinpal")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!orderId}
          onClick={() => void pay("digipay")}
        >
          {t("checkout:pay_digipay")}
        </Button>
      </div>
      {intentUrl ? (
        <p className="break-all text-muted-foreground text-xs">{intentUrl}</p>
      ) : null}
    </div>
  )
}
