"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { ShoppingBag } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

import { trackAnalyticsEvent } from "@/lib/analytics-track"
import { api, type ApiError } from "@/lib/api"
import { MapPinPicker } from "@/components/MapPinPickerLazy"
import { getApiErrorMessage } from "@/lib/api-helpers"
import type { ShopCurrencyDisplay } from "@/lib/format"
import { toLocaleDigits } from "@/lib/locale"
import { cn } from "@/lib/utils"
import { previewCoupon, readStoredCoupon, storeCoupon } from "@/builder/storefront/coupon"
import { quietApi } from "@/builder/storefront/session"

import { useGuestCart, type CartLine } from "../lib/cart"
import type { CafeOrderingStatus, CafeVenuePayload } from "../types"
import { CafeMoney } from "./CafeMoney"
import { CafeSheet } from "./CafeSheet"

export type CartTriggerVariant = "icon" | "bar" | "pill"

type AuthUser = { id: number; name?: string | null; phone?: string | null }

export function CafeCartDrawer({
  tableNumber,
  branchSlug,
  ordering,
  currency,
  currencyDisplay,
  variant = "icon",
  mode = "drawer",
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
  /** Full /cart|/checkout page (no sheet). Drawer stays the menu quick-order UI. */
  mode?: "drawer" | "page"
  skin?: string
  scheme?: string
  className?: string
}) {
  const t = useTranslations("cafe_starter.cart")
  const tMenu = useTranslations("cafe_starter")
  const locale = useLocale()
  const queryClient = useQueryClient()
  const isPage = mode === "page"
  const [open, setOpen] = useState(isPage)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [receipt, setReceipt] = useState<CafeOrderReceipt | null>(null)
  const [returnNotice, setReturnNotice] = useState<"success" | "failed" | "refund_pending" | null>(null)

  // Shop sync: only modes the cafe menu enables (pickup stays available if merchant leaves it on).
  const fulfillmentOptions = (["dine_in", "delivery", "pickup"] as const).filter((key) => ordering?.fulfillment?.[key] !== false)
  const [fulfillment, setFulfillment] = useState<(typeof fulfillmentOptions)[number]>(fulfillmentOptions[0] ?? "dine_in")
  const { token, cart, count, subtotal, totals } = useGuestCart(tableNumber, branchSlug, fulfillment)
  const lang = locale === "fa" ? "fa" : "en"

  // Shop payment hub via CafeOrdering — cash/COD filtered out when pay_cash_enabled is off.
  const methods = useMemo(
    () => (ordering?.payment_methods ?? []).filter((m) => m.type === "online"),
    [ordering?.payment_methods],
  )
  const [method, setMethod] = useState<string>("")
  const activeMethod = methods.some((m) => m.id === method) ? method : methods[0]?.id ?? ""

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
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
  const [couponInput, setCouponInput] = useState("")
  const [couponCode, setCouponCode] = useState("")
  const [couponDiscount, setCouponDiscount] = useState(0)
  const [couponBusy, setCouponBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const idemKey = useRef<string>("")
  if (!idemKey.current && typeof window !== "undefined") idemKey.current = newKey()

  const authQ = useQuery({
    queryKey: ["cafe-auth-user"],
    enabled: open,
    queryFn: async (): Promise<AuthUser | null> => {
      const res = await quietApi<AuthUser>("/api/v1/auth/user")
      return res.ok ? res.data : null
    },
    staleTime: 30_000,
    retry: false,
  })
  const authed = Boolean(authQ.data?.id)

  const [saved, setSaved] = useState<SavedAddress[]>([])
  useEffect(() => {
    if (!open || !authed || fulfillment !== "delivery") return
    let alive = true
    void quietApi<{ addresses?: SavedAddress[] }>("/api/v1/account/addresses").then((res) => {
      if (!alive || !res.ok) return
      const list = (res.data as { addresses?: SavedAddress[] })?.addresses ?? (Array.isArray(res.data) ? (res.data as SavedAddress[]) : [])
      setSaved(list.filter((a) => a && a.address))
    })
    return () => {
      alive = false
    }
  }, [open, fulfillment, authed])

  useEffect(() => {
    if (isPage) {
      setOpen(true)
      const qs = new URLSearchParams(window.location.search)
      const p = qs.get("payment")
      if (qs.get("order") && (p === "success" || p === "failed" || p === "refund_pending")) setReturnNotice(p)
      return
    }
    const path = window.location.pathname.replace(/\/+$/, "") || "/"
    const qs = new URLSearchParams(window.location.search)
    const p = qs.get("payment")
    if (qs.get("cart") === "open" || path === "/cart" || path === "/checkout") setOpen(true)
    if (qs.get("order") && (p === "success" || p === "failed" || p === "refund_pending")) {
      setReturnNotice(p)
      setOpen(true)
    }
  }, [isPage])

  useEffect(() => {
    if (!open) return
    const stored = readStoredCoupon()
    if (stored) {
      setCouponInput(stored)
      setCouponCode(stored)
    }
  }, [open])

  useEffect(() => {
    if (!couponCode || subtotal <= 0) {
      setCouponDiscount(0)
      return
    }
    let alive = true
    setCouponBusy(true)
    void previewCoupon(couponCode, subtotal).then((res) => {
      if (!alive) return
      setCouponBusy(false)
      if (res.ok) {
        setCouponDiscount(Math.min(res.data.discount_minor, subtotal))
        storeCoupon(res.data.code)
      } else {
        setCouponDiscount(0)
      }
    })
    return () => {
      alive = false
    }
  }, [couponCode, subtotal])

  useEffect(() => {
    const u = authQ.data
    if (!u) return
    setForm((f) => {
      if (f.firstName || f.lastName || f.phone) return f
      const parts = String(u.name ?? "")
        .trim()
        .split(/\s+/)
      return {
        ...f,
        firstName: parts[0] ?? "",
        lastName: parts.slice(1).join(" "),
        phone: u.phone ?? f.phone,
      }
    })
  }, [authQ.data])

  const venue = useQuery({
    queryKey: ["cafe-venue-pickup"],
    enabled: open && (fulfillment === "dine_in" || fulfillment === "pickup"),
    queryFn: () => api<CafeVenuePayload>("/api/v1/public/cafe/venue"),
    staleTime: 60_000,
  })

  const slotsQ = useQuery({
    queryKey: ["cafe-pickup-slots"],
    enabled: open,
    queryFn: () => api<{ time: string; at: string }[]>("/api/v1/public/cafe/pickup-slots"),
    refetchInterval: 60_000,
  })
  const slots = (slotsQ.data ?? []).map((s) => s.time)

  const loginHref = `/login?next=${encodeURIComponent(isPage ? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/checkout") : "/checkout")}`

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!authed) {
      errs.auth = t("login_required")
      return errs
    }
    const phone = toAscii(form.phone).replace(/\s|-/g, "")
    if (form.firstName.trim().length < 2) errs.customer_first_name = t("err_first_name")
    if (form.lastName.trim().length < 2) errs.customer_last_name = t("err_last_name")
    if (!/^(\+98|0098|0)?9\d{9}$/.test(phone)) errs.customer_phone = t("err_phone")
    if (!form.pickupTime) errs.pickup_time = t("err_time")
    if (fulfillment === "dine_in" && ordering?.dine_in_require_table !== false && !form.table.trim() && !tableNumber) {
      errs.table_number = t("err_table")
    }
    if (fulfillment === "delivery") {
      if (form.address.trim().length < 10) errs.address = t("err_address")
      if (!form.plaque.trim()) errs.plaque = t("err_plaque")
      if (form.postal && !/^\d{10}$/.test(toAscii(form.postal))) errs.postal_code = t("err_postal")
      if (ordering?.delivery_require_pin !== false && !pin) errs.lat = t("err_pin")
    }
    if (methods.length === 0) errs.payment_method = t("no_online_gateway")
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
          customer_first_name: form.firstName.trim(),
          customer_last_name: form.lastName.trim(),
          customer_name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
          customer_phone: toAscii(form.phone).replace(/\s|-/g, ""),
          customer_note: form.note || undefined,
          coupon_code: couponCode || undefined,
          table_number: fulfillment === "dine_in" ? toAscii(form.table) || cart?.table_number || undefined : undefined,
          address: fulfillment === "delivery" ? form.address : undefined,
          plaque: fulfillment === "delivery" ? toAscii(form.plaque) : undefined,
          unit: fulfillment === "delivery" ? toAscii(form.unit) || undefined : undefined,
          postal_code: fulfillment === "delivery" ? toAscii(form.postal) || undefined : undefined,
          lat: fulfillment === "delivery" ? pin?.lat : undefined,
          lng: fulfillment === "delivery" ? pin?.lng : undefined,
          pickup_time: form.pickupTime || undefined,
        },
      }),
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: ["guest-cart"] })
      setError(null)
      idemKey.current = newKey()
      if (couponCode) storeCoupon(null)
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

  const setQty = useMutation({
    mutationFn: (input: { productId: number; quantity: number; optionIds: number[]; variantId: number | null }) =>
      api("/api/v1/public/cafe/cart/items", {
        method: "POST",
        json: {
          product_id: input.productId,
          quantity: input.quantity,
          mode: "set",
          guest_token: token,
          table_number: tableNumber || undefined,
          branch_slug: branchSlug || undefined,
          option_ids: input.optionIds,
          variant_id: input.variantId,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["guest-cart"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  function submit() {
    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length) {
      setError(errs.auth || t("err_fix"))
      return
    }
    trackAnalyticsEvent("checkout_start")
    checkout.mutate()
  }

  async function applyCoupon() {
    const code = couponInput.trim()
    if (!code) return
    setCouponBusy(true)
    const res = await previewCoupon(code, subtotal)
    setCouponBusy(false)
    if (!res.ok) {
      setError(res.message || t("coupon_bad"))
      setCouponCode("")
      setCouponDiscount(0)
      return
    }
    setCouponCode(res.data.code)
    setCouponDiscount(Math.min(res.data.discount_minor, subtotal))
    storeCoupon(res.data.code)
    setError(null)
  }

  const packagingFee = totals?.packaging_minor ?? 0
  const deliveryFee = totals?.delivery_minor ?? 0
  const serviceFee = totals?.service_minor ?? 0
  const vatAmount = totals?.tax_minor ?? 0
  const showVat = Boolean(totals?.show_vat) && vatAmount > 0
  const discountedSubtotal = Math.max(0, subtotal - couponDiscount)
  const grandTotal = Math.max(0, (totals?.grand_total_minor ?? subtotal) - couponDiscount)
  const fe = (k: string) => (fieldErrors[k] ? <p className="cafe-error">{fieldErrors[k]}</p> : null)

  function Price({ amount }: { amount: number }) {
    return <CafeMoney amount={amount} currency={currency || "IRT"} display={currencyDisplay} locale={lang} />
  }

  const countLabel = toLocaleDigits(String(count), lang)
  const venueAddress =
    (lang === "fa" ? venue.data?.venue?.address_fa : venue.data?.venue?.address_en || venue.data?.venue?.address_fa) || t("none")

  const trigger =
    variant === "bar" ? (
      <button type="button" className={cn("cafe-cart-bar", count === 0 && "is-empty", className)} aria-label={t("title")}>
        <span className="cafe-cart-bar-count" key={count}>
          {countLabel}
        </span>
        <span className="cafe-cart-bar-label">{t("view_cart")}</span>
        <span className="cafe-cart-bar-total">
          <Price amount={subtotal} />
        </span>
      </button>
    ) : variant === "pill" ? (
      <button type="button" className={cn("cafe-cart-pill", count === 0 && "is-empty", className)} aria-label={t("title")}>
        <ShoppingBag className="size-4" />
        <span className="cafe-cart-pill-count" key={count}>
          {countLabel}
        </span>
        {count > 0 ? (
          <span className="cafe-cart-pill-total">
            <Price amount={subtotal} />
          </span>
        ) : null}
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

  function lineOptionIds(line: CartLine): number[] {
    const sels = line.meta?.selections
    if (!Array.isArray(sels)) return []
    return sels.map((s) => Number(s.option_id ?? 0)).filter((n) => n > 0)
  }

  const body = (
    <div className={cn("cafe-cart-body", isPage && "is-page")}>
      {returnNotice ? (
        <p className={returnNotice === "success" ? "cafe-ok-note" : "cafe-error"}>
          {returnNotice === "success" ? t("pay_success") : returnNotice === "refund_pending" ? t("pay_refund_pending") : t("pay_failed")}
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
                <dt>
                  {it.product_name} ×{toLocaleDigits(String(it.quantity), lang)}
                </dt>
                <dd>
                  <Price amount={it.unit_price_minor * it.quantity} />
                </dd>
              </div>
            ))}
            {(receipt.discount_minor ?? 0) > 0 ? (
              <div>
                <dt>
                  {t("discount")}
                  {receipt.coupon_code ? ` (${receipt.coupon_code})` : ""}
                </dt>
                <dd>
                  −
                  <Price amount={receipt.discount_minor!} />
                </dd>
              </div>
            ) : null}
            {(receipt.fees?.packaging_minor ?? 0) > 0 ? (
              <div>
                <dt>{t("packaging_fee")}</dt>
                <dd>
                  <Price amount={receipt.fees!.packaging_minor} />
                </dd>
              </div>
            ) : null}
            {(receipt.fees?.delivery_minor ?? 0) > 0 ? (
              <div>
                <dt>{t("delivery_fee")}</dt>
                <dd>
                  <Price amount={receipt.fees!.delivery_minor} />
                </dd>
              </div>
            ) : null}
            {(receipt.fees?.service_minor ?? 0) > 0 ? (
              <div>
                <dt>{t("service_fee")}</dt>
                <dd>
                  <Price amount={receipt.fees!.service_minor} />
                </dd>
              </div>
            ) : null}
            {receipt.vat?.show && receipt.tax_minor > 0 ? (
              <div>
                <dt>{t(receipt.vat.inclusive ? "vat_included" : "vat", { rate: toLocaleDigits(String(receipt.vat.rate), lang) })}</dt>
                <dd>
                  <Price amount={receipt.tax_minor} />
                </dd>
              </div>
            ) : null}
            <div className="is-total">
              <dt>{t("grand_total")}</dt>
              <dd>
                <Price amount={receipt.total_minor} />
              </dd>
            </div>
          </dl>
          {receipt.pay_token && methods.length ? (
            <div className="cafe-pay-list">
              {methods.map((m) => (
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
          {isPage ? (
            <Link className="cafe-primary-btn" href="/menu">
              {t("back_to_menu")}
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="cafe-cart-lines">
          {cart.items.map((line) => {
            const productId = line.product?.id
            const optionIds = lineOptionIds(line)
            const variantId = line.meta?.variant_id ?? null
            return (
              <li key={line.id}>
                <div className="min-w-0">
                  <p className="cafe-cart-line-name">{line.product?.name}</p>
                  {line.meta?.selections?.length ? (
                    <p className="cafe-cart-line-meta">
                      {line.meta.selections.map((s) => (locale === "fa" ? s.name_fa : s.name_en) || s.name_fa).join("، ")}
                    </p>
                  ) : null}
                </div>
                {productId ? (
                  <div className="cafe-cart-qty" role="group" aria-label={tMenu("qty")}>
                    <button
                      type="button"
                      disabled={setQty.isPending}
                      aria-label={t("qty_dec")}
                      onClick={() => setQty.mutate({ productId, quantity: Math.max(0, line.quantity - 1), optionIds, variantId })}
                    >
                      −
                    </button>
                    <span>{toLocaleDigits(String(line.quantity), lang)}</span>
                    <button
                      type="button"
                      disabled={setQty.isPending || line.quantity >= 50}
                      aria-label={t("qty_inc")}
                      onClick={() => setQty.mutate({ productId, quantity: line.quantity + 1, optionIds, variantId })}
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <span className="cafe-cart-line-qty">×{toLocaleDigits(String(line.quantity), lang)}</span>
                )}
                <span className="cafe-cart-line-price">
                  <Price amount={line.quantity * (line.meta?.unit_minor ?? line.product?.price_minor ?? 0)} />
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {!receipt && cart?.items?.length ? (
        <>
          {fulfillmentOptions.length > 1 ? (
            <div className="cafe-seg" role="group" aria-label={t("fulfillment")}>
              {fulfillmentOptions.map((key) => (
                <button
                  key={key}
                  type="button"
                  data-on={fulfillment === key ? "true" : "false"}
                  onClick={() => {
                    setFulfillment(key)
                    setForm((f) => ({ ...f, pickupTime: "" }))
                  }}
                >
                  {tMenu(`fulfillment.${key}`)}
                </button>
              ))}
            </div>
          ) : null}

          {!authed ? (
            <div className="cafe-pickup-info">
              <p className="cafe-hint">{t("login_required")}</p>
              <Link className="cafe-primary-btn" href={loginHref}>
                {t("login_cta")}
              </Link>
            </div>
          ) : (
            <>
              <div className="cafe-field-row">
                <input className="cafe-field" value={form.firstName} onChange={set("firstName")} placeholder={t("first_name")} aria-label={t("first_name")} autoComplete="given-name" />
                <input className="cafe-field" value={form.lastName} onChange={set("lastName")} placeholder={t("last_name")} aria-label={t("last_name")} autoComplete="family-name" />
              </div>
              {fe("customer_first_name")}
              {fe("customer_last_name")}
              <input
                className="cafe-field"
                value={form.phone}
                onChange={set("phone")}
                placeholder={t("mobile")}
                aria-label={t("mobile")}
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
              />
              {fe("customer_phone")}

              {fulfillment === "dine_in" ? (
                <div className="cafe-pickup-info">
                  {ordering?.dine_in_require_table !== false ? (
                    <>
                      <input
                        className="cafe-field"
                        value={form.table}
                        onChange={set("table")}
                        placeholder={t("table_number")}
                        aria-label={t("table_number")}
                        inputMode="numeric"
                        readOnly={Boolean(tableNumber)}
                      />
                      {fe("table_number")}
                    </>
                  ) : null}
                  <p className="cafe-hint">
                    {t("venue_address")}: {venueAddress}
                  </p>
                  {ordering?.cafe_location ? (
                    <MapPinPicker value={ordering.cafe_location} readOnly height={160} labels={{ failed: t("map_failed") }} />
                  ) : venue.data?.venue?.map_url ? (
                    <a className="cafe-chip" href={venue.data.venue.map_url} target="_blank" rel="noreferrer">
                      {t("open_map")}
                    </a>
                  ) : null}
                </div>
              ) : null}

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
                          firstName: f.firstName || (a.name ?? "").split(/\s+/)[0] || "",
                          lastName: f.lastName || (a.name ?? "").split(/\s+/).slice(1).join(" "),
                          phone: f.phone || a.phone || "",
                        }))
                        if (typeof a.lat === "number" && typeof a.lng === "number") setPin({ lat: a.lat, lng: a.lng })
                      }}
                    >
                      <option value="">{t("saved_addresses")}</option>
                      {saved.map((a, i) => (
                        <option key={i} value={i}>
                          {a.label || a.address}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <textarea
                    className="cafe-field"
                    rows={2}
                    value={form.address}
                    onChange={set("address")}
                    placeholder={t("address")}
                    aria-label={t("address")}
                    autoComplete="street-address"
                  />
                  {fe("address")}
                  <div className="cafe-field-row">
                    <input className="cafe-field" value={form.plaque} onChange={set("plaque")} placeholder={t("plaque")} aria-label={t("plaque")} />
                    <input className="cafe-field" value={form.unit} onChange={set("unit")} placeholder={t("unit")} aria-label={t("unit")} />
                  </div>
                  {fe("plaque")}
                  <input
                    className="cafe-field"
                    value={form.postal}
                    onChange={set("postal")}
                    placeholder={t("postal_optional")}
                    aria-label={t("postal_optional")}
                    inputMode="numeric"
                    dir="ltr"
                  />
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
                    {t("pickup_from")}: {venueAddress}
                  </p>
                  {ordering?.cafe_location ? (
                    <MapPinPicker value={ordering.cafe_location} readOnly height={160} labels={{ failed: t("map_failed") }} />
                  ) : null}
                </div>
              ) : null}

              <select className="cafe-field" value={form.pickupTime} onChange={set("pickupTime")} aria-label={t("order_time")}>
                <option value="">{t("order_time")}</option>
                {slots.map((s) => (
                  <option key={s} value={s}>
                    {toLocaleDigits(s, lang)}
                  </option>
                ))}
              </select>
              {slotsQ.isSuccess && slots.length === 0 ? <p className="cafe-error">{t("no_pickup_slots")}</p> : null}
              {fe("pickup_time")}

              <input className="cafe-field" value={form.note} onChange={set("note")} placeholder={t("note")} aria-label={t("note")} />

              <div className="cafe-field-row">
                <input
                  className="cafe-field"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder={t("coupon")}
                  aria-label={t("coupon")}
                  autoComplete="off"
                />
                {couponCode ? (
                  <button
                    type="button"
                    className="cafe-chip"
                    onClick={() => {
                      setCouponCode("")
                      setCouponInput("")
                      setCouponDiscount(0)
                      storeCoupon(null)
                    }}
                  >
                    {t("coupon_remove")}
                  </button>
                ) : (
                  <button type="button" className="cafe-chip" disabled={couponBusy || !couponInput.trim()} onClick={() => void applyCoupon()}>
                    {t("coupon_apply")}
                  </button>
                )}
              </div>
              {couponCode && couponDiscount > 0 ? <p className="cafe-ok">{t("coupon_ok")}</p> : null}

              <div className="cafe-pay-methods" role="radiogroup" aria-label={t("payment_method")}>
                <p className="cafe-hint">{t("payment_method")}</p>
                {methods.length === 0 ? <p className="cafe-error">{t("no_online_gateway")}</p> : null}
                {methods.map((m) => (
                  <label key={m.id} className="cafe-pay-option" data-on={activeMethod === m.id ? "true" : "false"}>
                    <input type="radio" name="cafe-pay" value={m.id} checked={activeMethod === m.id} onChange={() => setMethod(m.id)} />
                    <span>{t("pay_online", { name: m.title || m.id })}</span>
                  </label>
                ))}
              </div>

              <dl className="cafe-cart-sum">
                <div>
                  <dt>{t("items_total")}</dt>
                  <dd>
                    <Price amount={subtotal} />
                  </dd>
                </div>
                {couponDiscount > 0 ? (
                  <div>
                    <dt>
                      {t("discount")}
                      {couponCode ? ` (${couponCode})` : ""}
                    </dt>
                    <dd>
                      −
                      <Price amount={couponDiscount} />
                    </dd>
                  </div>
                ) : null}
                {packagingFee > 0 ? (
                  <div>
                    <dt>{t("packaging_fee")}</dt>
                    <dd>
                      <Price amount={packagingFee} />
                    </dd>
                  </div>
                ) : null}
                {deliveryFee > 0 ? (
                  <div>
                    <dt>{t("delivery_fee")}</dt>
                    <dd>
                      <Price amount={deliveryFee} />
                    </dd>
                  </div>
                ) : null}
                {serviceFee > 0 ? (
                  <div>
                    <dt>{t("service_fee")}</dt>
                    <dd>
                      <Price amount={serviceFee} />
                    </dd>
                  </div>
                ) : null}
                {showVat ? (
                  <div>
                    <dt>{t(totals?.vat_inclusive ? "vat_included" : "vat", { rate: toLocaleDigits(String(totals?.vat_rate ?? 0), lang) })}</dt>
                    <dd>
                      <Price amount={vatAmount} />
                    </dd>
                  </div>
                ) : null}
                <div className="is-total">
                  <dt>{t("grand_total")}</dt>
                  <dd>
                    <Price amount={grandTotal > 0 ? grandTotal : discountedSubtotal} />
                  </dd>
                </div>
              </dl>
              {error ? <p className="cafe-error">{error}</p> : null}
              <button
                type="button"
                className="cafe-primary-btn"
                disabled={checkout.isPending || ordering?.accepting_orders === false || methods.length === 0}
                onClick={submit}
              >
                {ordering?.accepting_orders === false ? (
                  tMenu("orders_paused")
                ) : checkout.isPending ? (
                  t("sending")
                ) : (
                  <span className="inline-flex items-center gap-2">
                    {t("checkout_pay_label")}
                    <Price amount={grandTotal > 0 ? grandTotal : discountedSubtotal} />
                  </span>
                )}
              </button>
            </>
          )}
        </>
      ) : null}
    </div>
  )

  if (isPage) return body

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
      {body}
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
  discount_minor?: number
  coupon_code?: string | null
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
