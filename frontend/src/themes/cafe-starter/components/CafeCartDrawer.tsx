"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { ShoppingBag } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { trackAnalyticsEvent } from "@/lib/analytics-track"
import { api, type ApiError } from "@/lib/api"
import { MapPinPicker } from "@/components/MapPinPicker"
import { getApiErrorMessage } from "@/lib/api-helpers"
import type { ShopCurrencyDisplay } from "@/lib/format"
import { toLocaleDigits } from "@/lib/locale"
import { cn } from "@/lib/utils"

import { useGuestCart } from "../lib/cart"
import { money } from "../lib/helpers"
import type { CafeOrderingStatus, CafeVenuePayload } from "../types"
import { CafeSheet } from "./CafeSheet"

export type CartTriggerVariant = "icon" | "bar" | "pill"

export function CafeCartDrawer({
  tableNumber,
  branchSlug,
  ordering,
  currency,
  currencyDisplay,
  variant = "icon",
  skin,
  scheme,
  className,
}: {
  tableNumber?: string | null
  branchSlug?: string | null
  ordering?: CafeOrderingStatus | null
  currency?: string
  currencyDisplay?: ShopCurrencyDisplay | null
  variant?: CartTriggerVariant
  skin?: string
  scheme?: string
  className?: string
}) {
  const t = useTranslations("cafe_starter.cart")
  const tMenu = useTranslations("cafe_starter")
  const locale = useLocale()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [receipt, setReceipt] = useState<CafeOrderReceipt | null>(null)
  const [returnNotice, setReturnNotice] = useState<"success" | "failed" | null>(null)
  const fulfillmentOptions = (["dine_in", "pickup", "delivery"] as const).filter((key) => ordering?.fulfillment?.[key] !== false)
  const [fulfillment, setFulfillment] = useState<(typeof fulfillmentOptions)[number]>(fulfillmentOptions[0] ?? "dine_in")
  const { token, cart, count, subtotal, totals } = useGuestCart(tableNumber, branchSlug, fulfillment)
  const lang = locale === "fa" ? "fa" : "en"

  const methods = ordering?.payment_methods ?? [{ id: "cash", title: "", type: "cash" as const }]
  const [method, setMethod] = useState<string>("")
  const activeMethod = methods.some((m) => m.id === method) ? method : methods[0]?.id ?? "cash"

  const [form, setForm] = useState({
    name: "",
    phone: "",
    note: "",
    table: tableNumber ?? "",
    address: "",
    plaque: "",
    unit: "",
    postal: "",
    pickupTime: "",
  })
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // One key per checkout attempt so double taps / retries never create two orders.
  const idemKey = useRef<string>("")
  if (!idemKey.current && typeof window !== "undefined") idemKey.current = newKey()

  // Saved addresses for logged-in customers (store account addresses); silently skipped for guests.
  const [saved, setSaved] = useState<SavedAddress[]>([])
  useEffect(() => {
    if (!open || fulfillment !== "delivery") return
    let alive = true
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1/account/addresses`, {
      credentials: "include",
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const list = (j?.data?.addresses ?? []) as SavedAddress[]
        if (alive && Array.isArray(list)) setSaved(list.filter((a) => a && a.address))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [open, fulfillment])

  // Back from the payment gateway: ?order=…&payment=success|failed
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search)
    const p = qs.get("payment")
    if (qs.get("order") && (p === "success" || p === "failed")) {
      setReturnNotice(p)
      setOpen(true)
    }
  }, [])

  const venue = useQuery({
    queryKey: ["cafe-venue-pickup"],
    enabled: open && fulfillment === "pickup",
    queryFn: () => api<CafeVenuePayload>("/api/v1/public/cafe/venue"),
    staleTime: 60_000,
  })

  const slots = pickupSlots(ordering?.prep_minutes ?? 20, ordering?.pickup_slot_minutes ?? 15)

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    const phone = toAscii(form.phone).replace(/\s|-/g, "")
    const needContact = fulfillment !== "dine_in"
    if (needContact && form.name.trim().length < 2) errs.customer_name = t("err_name")
    if ((needContact || phone) && !/^(\+98|0098|0)?9\d{9}$/.test(phone)) errs.customer_phone = t("err_phone")
    if (fulfillment === "dine_in" && ordering?.dine_in_require_table !== false && !form.table.trim()) errs.table_number = t("err_table")
    if (fulfillment === "delivery") {
      if (form.address.trim().length < 10) errs.address = t("err_address")
      if (!form.plaque.trim()) errs.plaque = t("err_plaque")
      if (form.postal && !/^\d{10}$/.test(toAscii(form.postal))) errs.postal_code = t("err_postal")
      if (ordering?.delivery_require_pin !== false && !pin) errs.lat = t("err_pin")
    }
    if (fulfillment === "pickup" && !form.pickupTime) errs.pickup_time = t("err_pickup")
    return errs
  }

  const checkout = useMutation({
    mutationFn: () =>
      api<CafeOrderReceipt>("/api/v1/public/cafe/checkout", {
        method: "POST",
        json: {
          idempotency_key: idemKey.current,
          guest_token: token,
          branch_slug: branchSlug ?? undefined,
          fulfillment,
          payment_method: activeMethod,
          customer_name: form.name || undefined,
          customer_phone: toAscii(form.phone).replace(/\s|-/g, "") || undefined,
          customer_note: form.note || undefined,
          table_number: fulfillment === "dine_in" ? toAscii(form.table) || cart?.table_number || undefined : undefined,
          address: fulfillment === "delivery" ? form.address : undefined,
          plaque: fulfillment === "delivery" ? toAscii(form.plaque) : undefined,
          unit: fulfillment === "delivery" ? toAscii(form.unit) || undefined : undefined,
          postal_code: fulfillment === "delivery" ? toAscii(form.postal) || undefined : undefined,
          lat: fulfillment === "delivery" ? pin?.lat : undefined,
          lng: fulfillment === "delivery" ? pin?.lng : undefined,
          pickup_time: fulfillment === "pickup" ? form.pickupTime : undefined,
        },
      }),
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: ["guest-cart"] })
      setError(null)
      idemKey.current = newKey()
      if (order.payment?.ok && order.payment.redirect_url) {
        window.location.assign(order.payment.redirect_url)
        return
      }
      if (order.payment && !order.payment.ok) setError(order.payment.message ?? t("pay_failed"))
      setReceipt(order)
    },
    onError: (e: Error) => {
      const body = (e as ApiError).body as { errors?: Record<string, string[] | string> } | undefined
      const errs: Record<string, string> = {}
      for (const [k, v] of Object.entries(body?.errors ?? {})) {
        if (k === "code") continue
        errs[k] = Array.isArray(v) ? String(v[0]) : String(v)
      }
      setFieldErrors(errs)
      setError(getApiErrorMessage(e))
    },
  })

  const retryPay = useMutation({
    mutationFn: (provider: string) =>
      api<{ ok: boolean; redirect_url?: string; message?: string }>(`/api/v1/public/cafe/orders/${receipt?.id}/pay`, {
        method: "POST",
        json: { pay_token: receipt?.pay_token, provider },
      }),
    onSuccess: (res) => {
      if (res.ok && res.redirect_url) window.location.assign(res.redirect_url)
      else setError(res.message ?? t("pay_failed"))
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  function submit() {
    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length) {
      setError(t("err_fix"))
      return
    }
    trackAnalyticsEvent("checkout_start")
    checkout.mutate()
  }

  // Totals come from the server quote, which follows the menu settings exactly.
  const packagingFee = totals?.packaging_minor ?? 0
  const deliveryFee = totals?.delivery_minor ?? 0
  const serviceFee = totals?.service_minor ?? 0
  const vatAmount = totals?.tax_minor ?? 0
  const showVat = Boolean(totals?.show_vat) && vatAmount > 0
  const grandTotal = totals?.grand_total_minor ?? subtotal
  const fe = (k: string) => (fieldErrors[k] ? <p className="cafe-error">{fieldErrors[k]}</p> : null)
  const online = methods.filter((m) => m.type === "online")

  function price(amount: number) {
    return money(amount, currency || "IRT", currencyDisplay, lang)
  }

  const countLabel = toLocaleDigits(String(count), lang)

  const trigger =
    variant === "bar" ? (
      <button type="button" className={cn("cafe-cart-bar", count === 0 && "is-empty", className)} aria-label={t("title")}>
        <span className="cafe-cart-bar-count" key={count}>{countLabel}</span>
        <span className="cafe-cart-bar-label">{t("view_cart")}</span>
        <span className="cafe-cart-bar-total">{price(subtotal)}</span>
      </button>
    ) : variant === "pill" ? (
      <button type="button" className={cn("cafe-cart-pill", count === 0 && "is-empty", className)} aria-label={t("title")}>
        <ShoppingBag className="size-4" />
        <span className="cafe-cart-pill-count" key={count}>{countLabel}</span>
        {count > 0 ? <span className="cafe-cart-pill-total">{price(subtotal)}</span> : null}
      </button>
    ) : (
      <button type="button" className={cn("cafe-icon-btn cafe-cart-icon", className)} aria-label={t("title")}>
        <ShoppingBag className="size-4" />
        {count > 0 ? (
          <span className="cafe-cart-badge" key={count}>
            {countLabel}
          </span>
        ) : null}
      </button>
    )

  return (
    <CafeSheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setReceipt(null)
          setReturnNotice(null)
        }
      }}
      title={t("title")}
      description={tableNumber ? t("table", { number: toLocaleDigits(tableNumber, lang) }) : undefined}
      closeLabel={tMenu("close")}
      placement="side"
      skin={skin}
      scheme={scheme}
      trigger={trigger}
    >
      <div className="cafe-cart-body">
        {returnNotice ? (
          <p className={returnNotice === "success" ? "cafe-ok-note" : "cafe-error"}>
            {returnNotice === "success" ? t("pay_success") : t("pay_failed")}
          </p>
        ) : null}
        {receipt ? (
          <div className="cafe-cart-done">
            <span aria-hidden="true">✓</span>
            <p>{receipt.status === "processing" || receipt.status === "paid" ? t("order_placed") : t("order_awaiting_payment")}</p>
            <p className="cafe-hint">{t("order_number", { number: toLocaleDigits(String(receipt.number), lang) })}</p>
            <dl className="cafe-cart-sum">
              {receipt.items.map((it, i) => (
                <div key={i}>
                  <dt>{it.product_name} ×{toLocaleDigits(String(it.quantity), lang)}</dt>
                  <dd>{price(it.unit_price_minor * it.quantity)}</dd>
                </div>
              ))}
              {(receipt.fees?.packaging_minor ?? 0) > 0 ? (<div><dt>{t("packaging_fee")}</dt><dd>{price(receipt.fees!.packaging_minor)}</dd></div>) : null}
              {(receipt.fees?.delivery_minor ?? 0) > 0 ? (<div><dt>{t("delivery_fee")}</dt><dd>{price(receipt.fees!.delivery_minor)}</dd></div>) : null}
              {(receipt.fees?.service_minor ?? 0) > 0 ? (<div><dt>{t("service_fee")}</dt><dd>{price(receipt.fees!.service_minor)}</dd></div>) : null}
              {receipt.vat?.show && receipt.tax_minor > 0 ? (
                <div>
                  <dt>{t(receipt.vat.inclusive ? "vat_included" : "vat", { rate: toLocaleDigits(String(receipt.vat.rate), lang) })}</dt>
                  <dd>{price(receipt.tax_minor)}</dd>
                </div>
              ) : null}
              <div className="is-total"><dt>{t("grand_total")}</dt><dd>{price(receipt.total_minor)}</dd></div>
            </dl>
            {receipt.pay_token && online.length ? (
              <div className="cafe-pay-list">
                {online.map((m) => (
                  <button key={m.id} type="button" className="cafe-primary-btn" disabled={retryPay.isPending} onClick={() => retryPay.mutate(m.id)}>
                    {t("pay_with", { name: m.title || m.id })}
                  </button>
                ))}
              </div>
            ) : null}
            {error ? <p className="cafe-error">{error}</p> : null}
          </div>
        ) : !cart?.items?.length ? (
          <div className="cafe-cart-empty">
            <ShoppingBag className="size-8 opacity-40" />
            <p>{t("empty")}</p>
          </div>
        ) : (
          <ul className="cafe-cart-lines">
            {cart.items.map((line) => (
              <li key={line.id}>
                <div className="min-w-0">
                  <p className="cafe-cart-line-name">{line.product?.name}</p>
                  {line.meta?.selections?.length ? (
                    <p className="cafe-cart-line-meta">
                      {line.meta.selections.map((s) => (locale === "fa" ? s.name_fa : s.name_en) || s.name_fa).join("، ")}
                    </p>
                  ) : null}
                </div>
                <span className="cafe-cart-line-qty">×{toLocaleDigits(String(line.quantity), lang)}</span>
                <span className="cafe-cart-line-price">
                  {price(line.quantity * (line.meta?.unit_minor ?? line.product?.price_minor ?? 0))}
                </span>
              </li>
            ))}
          </ul>
        )}

        {!receipt && cart?.items?.length ? (
          <>
            {fulfillmentOptions.length > 1 ? (
              <div className="cafe-seg" role="group" aria-label={t("fulfillment")}>
                {fulfillmentOptions.map((key) => (
                  <button key={key} type="button" data-on={fulfillment === key ? "true" : "false"} onClick={() => setFulfillment(key)}>
                    {tMenu(`fulfillment.${key}`)}
                  </button>
                ))}
              </div>
            ) : null}

            {fulfillment === "dine_in" ? (
              <>
                <input className="cafe-field" value={form.table} onChange={set("table")} placeholder={t("table_number")} aria-label={t("table_number")} inputMode="numeric" readOnly={Boolean(tableNumber)} />
                {fe("table_number")}
                <input className="cafe-field" value={form.phone} onChange={set("phone")} placeholder={t("phone_optional")} aria-label={t("phone")} inputMode="tel" dir="ltr" />
                {fe("customer_phone")}
              </>
            ) : (
              <>
                <input className="cafe-field" value={form.name} onChange={set("name")} placeholder={t("name")} aria-label={t("name")} autoComplete="name" />
                {fe("customer_name")}
                <input className="cafe-field" value={form.phone} onChange={set("phone")} placeholder={t("mobile")} aria-label={t("mobile")} inputMode="tel" autoComplete="tel" dir="ltr" />
                {fe("customer_phone")}
              </>
            )}

            {fulfillment === "delivery" ? (
              <>
                {saved.length ? (
                  <select
                    className="cafe-field"
                    aria-label={t("saved_addresses")}
                    defaultValue=""
                    onChange={(e) => {
                      const a = saved[Number(e.target.value)]
                      if (!a) return
                      setForm((f) => ({
                        ...f,
                        address: [a.city, a.address].filter(Boolean).join("، "),
                        plaque: a.plaque ?? "",
                        unit: a.unit ?? "",
                        postal: a.postcode ?? "",
                        name: f.name || a.name || "",
                        phone: f.phone || a.phone || "",
                      }))
                      if (typeof a.lat === "number" && typeof a.lng === "number") setPin({ lat: a.lat, lng: a.lng })
                    }}
                  >
                    <option value="">{t("saved_addresses")}</option>
                    {saved.map((a, i) => (
                      <option key={i} value={i}>{a.label || a.address}</option>
                    ))}
                  </select>
                ) : null}
                <textarea className="cafe-field" rows={2} value={form.address} onChange={set("address")} placeholder={t("address")} aria-label={t("address")} autoComplete="street-address" />
                {fe("address")}
                <div className="cafe-field-row">
                  <input className="cafe-field" value={form.plaque} onChange={set("plaque")} placeholder={t("plaque")} aria-label={t("plaque")} />
                  <input className="cafe-field" value={form.unit} onChange={set("unit")} placeholder={t("unit")} aria-label={t("unit")} />
                </div>
                {fe("plaque")}
                <input className="cafe-field" value={form.postal} onChange={set("postal")} placeholder={t("postal_optional")} aria-label={t("postal_optional")} inputMode="numeric" dir="ltr" />
                {fe("postal_code")}
                <MapPinPicker
                  value={pin}
                  onChange={setPin}
                  center={ordering?.cafe_location ?? null}
                  radiusKm={ordering?.delivery_radius_km ?? 0}
                  labels={{ locate: t("my_location"), failed: t("map_failed"), hint: t("map_hint") }}
                />
                {fe("lat")}
              </>
            ) : null}

            {fulfillment === "pickup" ? (
              <div className="cafe-pickup-info">
                <p className="cafe-hint">
                  {t("pickup_from")}: {(lang === "fa" ? venue.data?.venue?.address_fa : venue.data?.venue?.address_en || venue.data?.venue?.address_fa) || t("none")}
                </p>
                {ordering?.cafe_location ? (
                  <MapPinPicker value={ordering.cafe_location} readOnly height={160} labels={{ failed: t("map_failed") }} />
                ) : venue.data?.venue?.map_url ? (
                  <a className="cafe-chip" href={venue.data.venue.map_url} target="_blank" rel="noreferrer">{t("open_map")}</a>
                ) : null}
                <select className="cafe-field" value={form.pickupTime} onChange={set("pickupTime")} aria-label={t("pickup_time")}>
                  <option value="">{t("pickup_time")}</option>
                  {slots.map((s) => (
                    <option key={s} value={s}>{toLocaleDigits(s, lang)}</option>
                  ))}
                </select>
                {fe("pickup_time")}
              </div>
            ) : null}

            <input className="cafe-field" value={form.note} onChange={set("note")} placeholder={t("note")} aria-label={t("note")} />

            <div className="cafe-pay-methods" role="radiogroup" aria-label={t("payment_method")}>
              <p className="cafe-hint">{t("payment_method")}</p>
              {methods.length === 0 ? <p className="cafe-error">{t("no_payment_method")}</p> : null}
              {methods.map((m) => (
                <label key={m.id} className="cafe-pay-option" data-on={activeMethod === m.id ? "true" : "false"}>
                  <input type="radio" name="cafe-pay" value={m.id} checked={activeMethod === m.id} onChange={() => setMethod(m.id)} />
                  <span>
                    {m.type === "cash"
                      ? t(fulfillment === "delivery" ? "pay_cash_delivery" : "pay_cash_counter")
                      : t("pay_online", { name: m.title || m.id })}
                  </span>
                </label>
              ))}
            </div>

            <dl className="cafe-cart-sum">
              <div>
                <dt>{t("items_total")}</dt>
                <dd>{price(subtotal)}</dd>
              </div>
              {packagingFee > 0 ? (<div><dt>{t("packaging_fee")}</dt><dd>{price(packagingFee)}</dd></div>) : null}
              {deliveryFee > 0 ? (<div><dt>{t("delivery_fee")}</dt><dd>{price(deliveryFee)}</dd></div>) : null}
              {serviceFee > 0 ? (<div><dt>{t("service_fee")}</dt><dd>{price(serviceFee)}</dd></div>) : null}
              {showVat ? (
                <div>
                  <dt>{t(totals?.vat_inclusive ? "vat_included" : "vat", { rate: toLocaleDigits(String(totals?.vat_rate ?? 0), lang) })}</dt>
                  <dd>{price(vatAmount)}</dd>
                </div>
              ) : null}
              <div className="is-total">
                <dt>{t("grand_total")}</dt>
                <dd>{price(grandTotal)}</dd>
              </div>
            </dl>
            {error ? <p className="cafe-error">{error}</p> : null}
            <button
              type="button"
              className="cafe-primary-btn"
              disabled={checkout.isPending || ordering?.accepting_orders === false || methods.length === 0}
              onClick={submit}
            >
              {ordering?.accepting_orders === false
                ? tMenu("orders_paused")
                : checkout.isPending
                  ? t("sending")
                  : methods.find((m) => m.id === activeMethod)?.type === "online"
                    ? t("checkout_pay", { amount: price(grandTotal) })
                    : t("checkout")}
            </button>
          </>
        ) : null}
      </div>
    </CafeSheet>
  )
}

type SavedAddress = {
  label?: string
  name?: string
  phone?: string
  address?: string
  city?: string
  plaque?: string
  unit?: string
  postcode?: string
  lat?: number
  lng?: number
}

export type CafeOrderReceipt = {
  id: number
  number: string | number
  status: string
  pay_token?: string | null
  subtotal_minor: number
  fees?: { packaging_minor: number; delivery_minor: number; service_minor: number; total_minor: number } | null
  tax_minor: number
  total_minor: number
  vat?: { rate: number; inclusive: boolean; show: boolean; amount_minor: number } | null
  items: { product_name: string; quantity: number; unit_price_minor: number }[]
  payment?: { ok: boolean; redirect_url?: string; message?: string }
}

function newKey(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined
  return c?.randomUUID ? c.randomUUID().replace(/-/g, "") : `${Date.now()}${Math.random().toString(36).slice(2)}`
}

function toAscii(v: string): string {
  return v.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
}

/** Pickup slots for today from now + prep time, rounded up to the slot size. */
function pickupSlots(prep: number, step: number): string[] {
  const now = new Date()
  let mins = now.getHours() * 60 + now.getMinutes() + Math.max(0, prep)
  mins = Math.ceil(mins / step) * step
  const out: string[] = []
  for (let m = mins; m < 24 * 60 && out.length < 32; m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`)
  }
  return out
}

