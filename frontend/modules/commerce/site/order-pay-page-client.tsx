"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedSiteRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { toLocaleDigits } from "@/lib/locale"
import { gatewayBrandSrc } from "@/lib/checkout-brands"

import {
  buildShippingAddress,
  fetchGeoCities,
  fetchGeoStates,
  type PayLinkFieldConfig,
  type StructuredAddress,
  parseStructuredAddress,
} from "../lib/pos-commerce"

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
  offline?: boolean
  instructions?: string
  iban?: string | null
  cards?: Array<{ number?: string; bank?: string; name?: string }>
  deadline_hours?: number | null
}

type PayItem = {
  id: number
  product_name?: string
  quantity?: number
  unit_price_minor?: number
}

type ShippingOption = {
  id: string
  title: string
  cost_minor: number
  method_id?: string
  instance_id?: number
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
  show_vat?: boolean
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  shipping_address?: unknown
  gateways: Gateway[]
  items?: PayItem[]
  fields?: Record<string, PayLinkFieldConfig>
  shipping_options?: ShippingOption[]
  wizard_steps?: string[]
  needs_payment?: boolean
  allow_both_types?: boolean
  purchase_type?: string
}

type BaleWebApp = { openInvoice?: (url: string, cb?: (status: string) => void) => void }

function baleWebApp(): BaleWebApp | undefined {
  if (typeof window === "undefined") return undefined
  return (window as unknown as { Bale?: { WebApp?: BaleWebApp } }).Bale?.WebApp
}

const ONLINE = new Set(["zarinpal", "digipay", "snapppay", "torobpay", "bale_pay", "basalam_pay"])

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

function fieldCfg(
  fields: Record<string, PayLinkFieldConfig> | undefined,
  key: string,
): PayLinkFieldConfig {
  return fields?.[key] ?? { visible: true, required: false, customer_editable: true }
}

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
  const queryClient = useQueryClient()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [mode, setMode] = useState<PayMode>("cash")
  const [qtys, setQtys] = useState<Record<number, number>>({})
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [addr, setAddr] = useState<StructuredAddress>({})
  const [cities, setCities] = useState<string[]>([])
  const [shippingId, setShippingId] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)
  const [offlineProvider, setOfflineProvider] = useState<string | null>(null)
  const [offlineNote, setOfflineNote] = useState("")
  const [offlineConfirmed, setOfflineConfirmed] = useState(false)

  const orderId = route.params?.orderId
  const token = searchParams.token ?? ""

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-order-pay", orderId, token],
    enabled: Boolean(orderId && token),
    queryFn: () =>
      api<PayPayload>(`/api/v1/public/orders/${orderId}/pay?token=${encodeURIComponent(token)}`),
  })

  const { data: states = [] } = useQuery({
    queryKey: ["geo-states-public"],
    queryFn: fetchGeoStates,
    enabled: step >= 2,
  })

  useEffect(() => {
    if (!data) return
    const map: Record<number, number> = {}
    for (const it of data.items ?? []) {
      if (it.id) map[it.id] = it.quantity ?? 1
    }
    setQtys(map)
    setCustomerName(data.customer_name || "")
    setCustomerEmail(data.customer_email || "")
    setAddr(parseStructuredAddress(data.shipping_address))
    if (data.purchase_type === "installment") setMode("installment")
  }, [data?.id])

  useEffect(() => {
    const code = addr.province_code?.trim()
    if (!code) {
      setCities([])
      return
    }
    void fetchGeoCities(code)
      .then(setCities)
      .catch(() => setCities([]))
  }, [addr.province_code])

  const shippingOptions = data?.shipping_options ?? []
  const selectedShipping = useMemo(
    () => shippingOptions.find((o) => o.id === shippingId) ?? shippingOptions[0],
    [shippingOptions, shippingId],
  )

  useEffect(() => {
    if (shippingOptions.length && !shippingId) {
      setShippingId(shippingOptions[0]?.id ?? "")
    }
  }, [shippingOptions, shippingId])

  const confirm = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api(`/api/v1/public/orders/${orderId}/pay/confirm?token=${encodeURIComponent(token)}`, {
        method: "POST",
        json: { token, ...payload },
      }),
    onSuccess: async () => {
      setLocalError(null)
      await queryClient.invalidateQueries({ queryKey: ["public-order-pay", orderId, token] })
    },
    onError: (e: Error) => setLocalError(getApiErrorMessage(e)),
  })

  const pay = useMutation({
    mutationFn: (payload: { provider: string; confirm_offline?: boolean; customer_note?: string }) =>
      api<{
        redirect_url?: string | null
        offline?: boolean
        confirmed?: boolean
        instructions?: string
        status?: string
      }>(`/api/v1/public/orders/${orderId}/pay/intent?token=${encodeURIComponent(token)}`, {
        method: "POST",
        json: { ...payload, token, mode },
      }),
    onSuccess: async (res) => {
      const url = res.redirect_url
      if (url?.startsWith("http")) {
        window.location.assign(url)
        return
      }
      if (res.confirmed) {
        setOfflineConfirmed(true)
        setLocalError(null)
        await queryClient.invalidateQueries({ queryKey: ["public-order-pay", orderId, token] })
      }
    },
    onError: (e: Error) => setLocalError(getApiErrorMessage(e)),
  })

  function isOfflineGateway(g: Gateway): boolean {
    return g.offline === true || !ONLINE.has(g.id)
  }

  function selectedOffline(): Gateway | undefined {
    if (!offlineProvider || !data) return undefined
    return data.gateways.find((g) => g.id === offlineProvider)
  }

  async function goAddress() {
    const fields = data?.fields
    const qtyEditable = fieldCfg(fields, "qty_edit").customer_editable
    if (qtyEditable && data?.items?.length) {
      await confirm.mutateAsync({
        step: "products",
        items: (data.items ?? []).map((it) => ({
          id: it.id,
          quantity: Math.max(0, qtys[it.id] ?? it.quantity ?? 1),
        })),
      })
    }
    setStep(2)
  }

  async function goPay() {
    const fields = data?.fields
    const nameCfg = fieldCfg(fields, "customer_name")
    const emailCfg = fieldCfg(fields, "customer_email")
    const addrCfg = fieldCfg(fields, "address")
    const cityCfg = fieldCfg(fields, "city")
    const provinceCfg = fieldCfg(fields, "province")
    const postCfg = fieldCfg(fields, "postcode")

    if (nameCfg.visible && nameCfg.required && !customerName.trim()) {
      setLocalError(t("required_name"))
      return
    }
    if (provinceCfg.visible && provinceCfg.required && !addr.province_code?.trim()) {
      setLocalError(t("required_province"))
      return
    }
    if (cityCfg.visible && cityCfg.required && !addr.city?.trim()) {
      setLocalError(t("required_city"))
      return
    }
    if (addrCfg.visible && addrCfg.required && !addr.address?.trim()) {
      setLocalError(t("required_address"))
      return
    }
    if (postCfg.visible && postCfg.required && !addr.postcode?.trim()) {
      setLocalError(t("required_postcode"))
      return
    }

    const shipping = selectedShipping
    await confirm.mutateAsync({
      step: "address",
      customer_name: nameCfg.customer_editable ? customerName : undefined,
      customer_email: emailCfg.customer_editable ? customerEmail || undefined : undefined,
      shipping_address: buildShippingAddress(addr),
      shipping_minor: shipping?.cost_minor ?? data?.shipping_minor ?? 0,
      shipping_method_id: shipping?.id || shipping?.method_id || undefined,
      shipping_title: shipping?.title || undefined,
    })
    setStep(3)
  }

  if (!orderId || !token) {
    return <p className="text-destructive p-6 text-sm">{t("invalid_link")}</p>
  }

  if (isLoading) {
    return <p className="text-muted-foreground p-6 text-sm">{tCommon("loading")}</p>
  }

  if (error || !data) {
    return <p className="text-destructive p-6 text-sm">{t("invalid_link")}</p>
  }

  const fields = data.fields
  const qtyEditable = fieldCfg(fields, "qty_edit").customer_editable && fieldCfg(fields, "qty_edit").visible

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-6" dir="auto">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {data.number ? (
        <p className="text-muted-foreground text-sm">
          {data.number}
          {data.customer_name ? ` · ${data.customer_name}` : ""}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 text-sm">
        {([1, 2, 3] as const).map((n) => (
          <span
            key={n}
            className={`rounded-md border px-3 py-1 ${step === n ? "bg-muted font-medium" : "text-muted-foreground"}`}
          >
            {n === 1 ? t("step_products") : n === 2 ? t("step_address") : t("step_pay")}
          </span>
        ))}
      </div>

      {localError ? <p className="text-destructive text-sm">{localError}</p> : null}

      {step === 1 ? (
        <div className="space-y-3">
          <ul className="space-y-2 rounded-md border p-3 text-sm">
            {(data.items ?? []).map((it) => (
              <li key={it.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 flex-1">{it.product_name}</span>
                {qtyEditable ? (
                  <Input
                    className="w-20"
                    type="number"
                    min={0}
                    value={qtys[it.id] ?? it.quantity ?? 1}
                    onChange={(e) =>
                      setQtys((prev) => ({ ...prev, [it.id]: Math.max(0, Number(e.target.value) || 0) }))
                    }
                  />
                ) : (
                  <span>× {toLocaleDigits(it.quantity ?? 1, locale)}</span>
                )}
                <MoneyDisplay amount={(it.unit_price_minor ?? 0) * (qtys[it.id] ?? it.quantity ?? 1)} />
              </li>
            ))}
          </ul>
          <Button className="w-full" disabled={confirm.isPending} onClick={() => void goAddress()}>
            {t("continue")}
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3">
          {fieldCfg(fields, "customer_name").visible ? (
            <div>
              <Label>{t("customer_name")}</Label>
              <Input
                className="mt-1"
                value={customerName}
                disabled={!fieldCfg(fields, "customer_name").customer_editable}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
          ) : null}
          {fieldCfg(fields, "customer_email").visible ? (
            <div>
              <Label>{t("customer_email")}</Label>
              <Input
                className="mt-1"
                value={customerEmail}
                disabled={!fieldCfg(fields, "customer_email").customer_editable}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </div>
          ) : null}
          {fieldCfg(fields, "province").visible ? (
            <div>
              <Label>{t("province")}</Label>
              <select
                className={`${selectClass} mt-1`}
                value={addr.province_code ?? ""}
                disabled={!fieldCfg(fields, "province").customer_editable}
                onChange={(e) => setAddr((a) => ({ ...a, province_code: e.target.value, city: "" }))}
              >
                <option value="">—</option>
                {states.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {fieldCfg(fields, "city").visible ? (
            <div>
              <Label>{t("city")}</Label>
              <select
                className={`${selectClass} mt-1`}
                value={addr.city ?? ""}
                disabled={!fieldCfg(fields, "city").customer_editable || !addr.province_code}
                onChange={(e) => setAddr((a) => ({ ...a, city: e.target.value }))}
              >
                <option value="">—</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {fieldCfg(fields, "address").visible ? (
            <div>
              <Label>{t("address")}</Label>
              <Input
                className="mt-1"
                value={addr.address ?? ""}
                disabled={!fieldCfg(fields, "address").customer_editable}
                onChange={(e) => setAddr((a) => ({ ...a, address: e.target.value }))}
              />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {fieldCfg(fields, "plaque").visible ? (
              <div>
                <Label>{t("plaque")}</Label>
                <Input
                  className="mt-1"
                  value={addr.plaque ?? ""}
                  disabled={!fieldCfg(fields, "plaque").customer_editable}
                  onChange={(e) => setAddr((a) => ({ ...a, plaque: e.target.value }))}
                />
              </div>
            ) : null}
            {fieldCfg(fields, "unit").visible ? (
              <div>
                <Label>{t("unit")}</Label>
                <Input
                  className="mt-1"
                  value={addr.unit ?? ""}
                  disabled={!fieldCfg(fields, "unit").customer_editable}
                  onChange={(e) => setAddr((a) => ({ ...a, unit: e.target.value }))}
                />
              </div>
            ) : null}
          </div>
          {fieldCfg(fields, "postcode").visible ? (
            <div>
              <Label>{t("postcode")}</Label>
              <Input
                className="mt-1"
                dir="ltr"
                value={addr.postcode ?? ""}
                disabled={!fieldCfg(fields, "postcode").customer_editable}
                onChange={(e) => setAddr((a) => ({ ...a, postcode: e.target.value }))}
              />
            </div>
          ) : null}
          {fieldCfg(fields, "shipping_method").visible && shippingOptions.length > 0 ? (
            <div>
              <Label>{t("shipping_method")}</Label>
              <select
                className={`${selectClass} mt-1`}
                value={shippingId}
                disabled={!fieldCfg(fields, "shipping_method").customer_editable}
                onChange={(e) => setShippingId(e.target.value)}
              >
                {shippingOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title} — {o.cost_minor}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              {t("back")}
            </Button>
            <Button className="flex-1" disabled={confirm.isPending} onClick={() => void goPay()}>
              {t("continue")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3">
          <ul className="space-y-2 rounded-md border p-3 text-sm">
            {(data.items ?? []).map((it) => (
              <li key={it.id} className="flex justify-between gap-2">
                <span>
                  {it.product_name} × {toLocaleDigits(it.quantity ?? 1, locale)}
                </span>
                <MoneyDisplay amount={(it.unit_price_minor ?? 0) * (it.quantity ?? 1)} />
              </li>
            ))}
          </ul>
          <div className="space-y-1 rounded-md border p-3 text-sm">
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
            {data.show_vat !== false && typeof data.tax_minor === "number" && data.tax_minor > 0 ? (
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
          {(data.allow_both_types || data.purchase_type === "installment") && (
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
          )}
          {offlineConfirmed ? (
            <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm">
              <p className="font-medium">{t("offline_confirmed_title")}</p>
              <p className="text-muted-foreground">{t("offline_confirmed_body")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {data.gateways
                .filter((g) => {
                  if (isOfflineGateway(g)) return mode === "cash"
                  if (mode === "installment") return g.installment_enabled === true
                  return g.cash_enabled !== false && (g.cash_enabled === true || g.cash_enabled === undefined)
                })
                .map((g) => (
                  <div key={g.id} className="rounded-md border p-3">
                    {!isOfflineGateway(g) && (g.fee_percent ?? 0) > 0 ? (
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
                      variant={offlineProvider === g.id ? "default" : "secondary"}
                      className="w-full"
                      disabled={pay.isPending || data.needs_payment === false}
                      onClick={() => {
                        if (isOfflineGateway(g)) {
                          setOfflineProvider(g.id)
                          setLocalError(null)
                          return
                        }
                        pay.mutate({ provider: g.id })
                      }}
                    >
                      {isOfflineGateway(g)
                        ? t("choose_offline", { gateway: g.label })
                        : t("pay_with", { gateway: g.label })}
                    </Button>
                  </div>
                ))}
            </div>
          )}

          {!offlineConfirmed && offlineProvider ? (
            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm font-medium">
                {t("offline_selected", { gateway: selectedOffline()?.label ?? offlineProvider })}
              </p>
              {selectedOffline()?.instructions ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {selectedOffline()?.instructions}
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">{t("offline_no_instructions")}</p>
              )}
              {selectedOffline()?.iban ? (
                <p className="text-sm" dir="ltr">
                  {t("offline_iban")}: {selectedOffline()?.iban}
                </p>
              ) : null}
              {(selectedOffline()?.cards ?? []).length > 0 ? (
                <ul className="space-y-1 text-sm" dir="ltr">
                  {(selectedOffline()?.cards ?? []).map((c, i) => (
                    <li key={i}>
                      {[c.bank, c.name, c.number].filter(Boolean).join(" · ")}
                    </li>
                  ))}
                </ul>
              ) : null}
              {selectedOffline()?.deadline_hours ? (
                <p className="text-muted-foreground text-xs">
                  {t("offline_deadline", {
                    hours: toLocaleDigits(selectedOffline()?.deadline_hours ?? 0, locale),
                  })}
                </p>
              ) : null}
              <div>
                <Label>{t("offline_note")}</Label>
                <Input
                  className="mt-1"
                  value={offlineNote}
                  placeholder={t("offline_note_ph")}
                  onChange={(e) => setOfflineNote(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                disabled={pay.isPending || data.needs_payment === false}
                onClick={() =>
                  pay.mutate({
                    provider: offlineProvider,
                    confirm_offline: true,
                    customer_note: offlineNote.trim() || undefined,
                  })
                }
              >
                {t("confirm_offline")}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setOfflineProvider(null)}>
                {t("cancel_offline")}
              </Button>
            </div>
          ) : null}

          <Button type="button" variant="outline" onClick={() => setStep(2)}>
            {t("back")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
