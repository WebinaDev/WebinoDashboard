"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState, Fragment } from "react"
import { useLocale, useTranslations } from "next-intl"

import { trackAnalyticsEvent } from "@/lib/analytics-track"
import { ApiError, api } from "@/lib/api"
import { formatNumber, normalizeUiLocale, toLatinDigits, toLocaleDigits } from "@/lib/locale"
import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"

import { syncGuestCart, useServerCart } from "@/builder/storefront/actions"
import { quietApi } from "@/builder/storefront/session"
import { readStoredCoupon, storeCoupon } from "@/builder/storefront/coupon"

import { ClassicCheckoutSteps } from "./ClassicCart"
import { ClassicTrustStrip } from "./ClassicProduct"
import { IconBadge, IconCard, IconCheck, IconShield, IconTruck } from "./icons"
import { ClassicAmount, useDigits } from "./parts"
import { useClassicText } from "../lib/texts"

type Gateway = {
  id: "zarinpal" | "digipay" | "snapppay" | "torobpay" | "bale_pay" | "basalam_pay"
  title?: string
  cash_enabled: boolean
  installment_enabled: boolean
  quote?: { fee_percent: number; fee_payer: string; fee_minor: number; base_minor: number; charge_minor: number }
}

type Rate = { instance_id: number; title: string; cost_minor: number }

function labelForGateway(
  id: string,
  tCheckout: (key: "pay_zarinpal" | "pay_digipay" | "pay_snapppay" | "pay_torobpay") => string,
  t: (key: "pay_bale" | "pay_basalam") => string,
) {
  if (id === "zarinpal" || id === "digipay" || id === "snapppay" || id === "torobpay") return tCheckout(`pay_${id}` as "pay_zarinpal")
  if (id === "bale_pay") return t("pay_bale")
  if (id === "basalam_pay") return t("pay_basalam")
  return id
}

const CHECKOUT_FIELDS = ["recipient", "national_id", "state", "city", "postcode", "phone", "address", "coupon", "note"] as const
type CheckoutField = (typeof CHECKOUT_FIELDS)[number]

/** Admin-defined order (comma list); unknown keys dropped, missing keys appended in default order. */
export function checkoutFieldOrder(raw: string | undefined): CheckoutField[] {
  const wanted = (raw ?? "").split(",").map((k) => k.trim()).filter((k): k is CheckoutField => (CHECKOUT_FIELDS as readonly string[]).includes(k))
  const unique = [...new Set(wanted)]
  return [...unique, ...CHECKOUT_FIELDS.filter((k) => !unique.includes(k))]
}

/** Iranian national code checksum. */
export function isValidIranNationalId(value: string): boolean {
  const code = toLatinDigits(value).replace(/\D/g, "")
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false
  const sum = code.slice(0, 9).split("").reduce((acc, d, i) => acc + Number(d) * (10 - i), 0)
  const rem = sum % 11
  const check = Number(code[9])
  return rem < 2 ? check === rem : check === 11 - rem
}

export function ClassicCheckout() {
  const tx = useClassicText()
  const theme = useClassicThemeSettings()
  const commerce = theme.commerce ?? {}
  const showCoupon = commerce.checkout_coupon !== false
  const showShippingQuote = commerce.checkout_shipping_quote !== false
  const showTrust = commerce.checkout_trust_badges !== false
  const showRecipient = commerce.checkout_show_recipient !== false
  const showPostcode = commerce.checkout_show_postcode !== false
  const requirePostcode = showPostcode && Boolean(commerce.checkout_require_postcode)
  const showNote = commerce.checkout_show_note !== false
  const stickySummary = commerce.checkout_sticky_summary !== false
  const requirePhone = commerce.checkout_require_phone !== false
  const nationalMode = commerce.checkout_national_id === "optional" || commerce.checkout_national_id === "required" ? commerce.checkout_national_id : "hidden"
  const fieldOrder = checkoutFieldOrder(commerce.checkout_field_order)

  const t = useTranslations("storefront")
  const tCheckout = useTranslations("checkout")
  const digits = useDigits()
  const locale = useLocale()
  const params = useSearchParams()
  const { auth, cart } = useServerCart()

  const [states, setStates] = useState<{ code: string; name: string }[]>([])
  const [stateCode, setStateCode] = useState("")
  const [city, setCity] = useState("")
  const [regionCities, setRegionCities] = useState<string[]>([])
  const [postcode, setPostcode] = useState("")
  const [address, setAddress] = useState("")
  const [phone, setPhone] = useState("")
  const [note, setNote] = useState("")
  const [coupon, setCoupon] = useState("")
  const [recipient, setRecipient] = useState("")
  const [nationalId, setNationalId] = useState("")
  const [rates, setRates] = useState<Rate[]>([])
  const [rateId, setRateId] = useState<number | null>(null)
  const [orderId, setOrderId] = useState<number | null>(null)
  const [gateways, setGateways] = useState<Gateway[]>([])
  const [mode, setMode] = useState<"cash" | "installment">("cash")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const flash = params.get("payment")

  const lines = cart?.items ?? []
  const pricing = cart?.pricing
  const subtotal = pricing?.subtotal_minor ?? lines.reduce((sum, line) => sum + line.product.price_minor * line.quantity, 0)
  const count = lines.reduce((sum, line) => sum + line.quantity, 0)
  const shipCost = rates.find((r) => r.instance_id === rateId)?.cost_minor ?? 0
  const total = subtotal + shipCost

  useEffect(() => {
    trackAnalyticsEvent("checkout_start")
    const stored = readStoredCoupon()
    if (stored) setCoupon(stored)
  }, [])

  useEffect(() => {
    if (!stateCode) {
      setRegionCities([])
      return
    }
    void quietApi<{ data?: { cities?: string[] } }>(
      `/api/v1/shipping/regions?state_code=${encodeURIComponent(stateCode)}`,
    ).then((res) => {
      if (res.ok) setRegionCities(res.data.data?.cities ?? [])
    })
  }, [stateCode])

  useEffect(() => {
    void quietApi<{ states?: { code: string; name: string }[] }>("/api/v1/public/geo/states").then((res) => {
      if (res.ok) setStates(res.data.states ?? [])
    })
  }, [])

  useEffect(() => {
    if (auth !== "auth") return
    void syncGuestCart()
  }, [auth])

  useEffect(() => {
    if (cart?.pricing?.purchase_type === "installment") setMode("installment")
  }, [cart?.pricing?.purchase_type])

  useEffect(() => {
    if (!orderId || auth !== "auth") return
    void api<{ gateways?: Gateway[] }>(`/api/v1/payments/checkout-options?order_id=${orderId}`)
      .then((res) => setGateways(res.gateways ?? []))
      .catch(() => setGateways([]))
  }, [auth, orderId])

  const allowed = useMemo(
    () => gateways.filter((gateway) => (mode === "installment" ? gateway.installment_enabled : gateway.cash_enabled)),
    [gateways, mode],
  )

  // Only gateways the store really enabled are shown to customers (no sample/placeholder cards).
  const displayGateways: Gateway[] = allowed
  const hasCash = gateways.some((gateway) => gateway.cash_enabled)
  const hasInstallment = gateways.some((gateway) => gateway.installment_enabled)

  useEffect(() => {
    if (mode === "installment" && !hasInstallment && hasCash) setMode("cash")
    if (mode === "cash" && !hasCash && hasInstallment) setMode("installment")
  }, [hasCash, hasInstallment, mode])

  if (auth === "loading") {
    return (
      <div className="sfc-checkout sfc-container">
        <ClassicCheckoutSteps active={1} />
        <div className="sfc-box sfc-checkout__empty">
          <span className="sfc-empty-note">{tx("header.loading")}</span>
        </div>
      </div>
    )
  }

  if (auth !== "auth") {
    return (
      <div className="sfc-checkout sfc-container">
        <ClassicCheckoutSteps active={1} />
        <div className="sfc-box sfc-checkout__guest">
          <IconUserHint />
          <h2>{tx("checkout.login_title")}</h2>
          <p>{tx("checkout.login_text")}</p>
          <Link href={`/login?next=${encodeURIComponent("/checkout")}`} className="sfc-btn sfc-btn--lg">
            {tx("checkout.login_button")}
          </Link>
        </div>
      </div>
    )
  }

  async function quoteShipping() {
    setError("")
    try {
      const res = await api<{ rates?: Rate[] }>("/api/v1/shipping/quote", {
        method: "POST",
        json: {
          state_code: stateCode || null,
          postcode: postcode || null,
          city: city || null,
          cart_subtotal_minor: pricing?.subtotal_minor ?? subtotal,
        },
      })
      const next = res.rates ?? []
      setRates(next)
      setRateId(next[0]?.instance_id ?? null)
      if (!next.length) setError(t("shipping_empty"))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("add_failed"))
    }
  }

  async function placeOrder() {
    if (nationalMode !== "hidden" && (nationalMode === "required" || nationalId) && !isValidIranNationalId(nationalId)) {
      setError(tx("checkout.national_id_invalid"))
      return
    }
    setBusy(true)
    setError("")
    try {
      const stateName = states.find((item) => item.code === stateCode)?.name ?? stateCode
      const shippingAddress = [recipient.trim(), stateName, city, address, postcode].filter(Boolean).join("، ")
      const order = await api<{ id: number }>("/api/v1/checkout", {
        method: "POST",
        json: {
          shipping_address: shippingAddress || null,
          customer_phone: phone || null,
          customer_note: note || null,
          coupon_code: showCoupon ? coupon || null : null,
          shipping_instance_id: rateId,
          shipping_state_code: stateCode || null,
          shipping_postcode: postcode || null,
          shipping_city: city || null,
          customer_national_id: nationalMode !== "hidden" ? nationalId || null : null,
        },
      })
      if (showCoupon && coupon) storeCoupon(null)
      setOrderId(order.id)
      setStep(2)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("add_failed"))
    } finally {
      setBusy(false)
    }
  }

  async function pay(provider: Gateway["id"]) {
    if (!orderId) return
    setError("")
    try {
      const intent = await api<{ redirect_url: string | null }>("/api/v1/payments/intent", {
        method: "POST",
        json: { order_id: orderId, provider, mode },
      })
      if (intent.redirect_url?.startsWith("http")) {
        window.location.assign(intent.redirect_url)
        return
      }
      setError(t("pay_missing"))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("add_failed"))
    }
  }

  return (
    <div className="sfc-checkout sfc-container">
      <ClassicCheckoutSteps active={orderId ? 2 : 1} />
      <div className="sfc-checkout__headline">
        <h1>{orderId ? "پرداخت سفارش" : "اطلاعات ارسال و تسویه"}</h1>
        {orderId ? (
          <span className="sfc-pill">
            سفارش #{digits(orderId)}
          </span>
        ) : (
          <span className="sfc-checkout__hint">مرحله {digits(step)} از {digits(2)}</span>
        )}
      </div>

      {flash === "success" ? <p className="sfc-flash sfc-flash--ok">{tCheckout("payment_ok")}</p> : null}
      {flash === "refund_pending" ? <p role="alert" className="sfc-flash sfc-flash--err">{tCheckout("payment_refund_pending")}</p> : null}
        {flash === "failed" ? <p className="sfc-flash sfc-flash--err">{tCheckout("payment_failed")}</p> : null}

      <div className="sfc-checkout__grid">
        <div className="sfc-checkout__main">
          {!orderId ? (
            <form
              className="sfc-box sfc-checkout__form"
              onSubmit={(event) => {
                event.preventDefault()
                void placeOrder()
              }}
            >
              <h2 className="sfc-checkout__section-title">{tx("checkout.address_title")}</h2>
              <div className="sfc-checkout__fields">
                {fieldOrder.map((field) => {
                  switch (field) {
                  case "recipient":
                    return (
                      <Fragment key="recipient">
                        {showRecipient ? (
                          <label className="sfc-field sfc-field--full">
                            <span>{tx("checkout.recipient_label")}</span>
                            <input value={recipient} onChange={(e) => setRecipient(e.target.value)} autoComplete="name" />
                          </label>
                        ) : null}
                      </Fragment>
                    )
                  case "state":
                    return (
                      <Fragment key="state">
                        <label className="sfc-field">
                          <span>{tx("checkout.state_label")}</span>
                          <select value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
                            <option value="">{tx("checkout.select_placeholder")}</option>
                            {states.map((item) => (
                              <option key={item.code} value={item.code}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </Fragment>
                    )
                  case "city":
                    return (
                      <Fragment key="city">
                        <label className="sfc-field">
                          <span>{tx("checkout.city_label")}</span>
                          <input value={city} list="checkout-region-cities" onChange={(e) => setCity(e.target.value)} />
                          {regionCities.length ? (
                            <datalist id="checkout-region-cities">
                              {regionCities.map((c) => (
                                <option key={c} value={c} />
                              ))}
                            </datalist>
                          ) : null}
                        </label>
                      </Fragment>
                    )
                  case "postcode":
                    return (
                      <Fragment key="postcode">
                        {showPostcode ? (
                          <label className="sfc-field">
                            <span>{tx("checkout.postcode_label")}</span>
                            <input
                              dir="ltr"
                              inputMode="numeric"
                              required={requirePostcode}
                              pattern={requirePostcode ? "\\d{10}" : undefined}
                              value={postcode}
                              onChange={(e) => setPostcode(toLatinDigits(e.target.value).replace(/\D/g, "").slice(0, 10))}
                            />
                          </label>
                        ) : null}
                      </Fragment>
                    )
                  case "phone":
                    return (
                      <Fragment key="phone">
                        <label className="sfc-field">
                          <span>{tx("checkout.phone_label")}</span>
                          <input
                            required={requirePhone}
                            dir="ltr"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                          />
                        </label>
                      </Fragment>
                    )
                  case "address":
                    return (
                      <Fragment key="address">
                        <label className="sfc-field sfc-field--full">
                          <span>{tx("checkout.address_label")}</span>
                          <textarea required value={address} onChange={(e) => setAddress(e.target.value)} rows={3} />
                        </label>
                      </Fragment>
                    )
                  case "coupon":
                    return (
                      <Fragment key="coupon">
                        {showCoupon ? (
                          <label className="sfc-field">
                            <span>{tx("checkout.coupon_label")}</span>
                            <input
                              value={coupon}
                              onChange={(e) => setCoupon(e.target.value)}
                              placeholder={tx("cart.coupon_placeholder")}
                            />
                          </label>
                        ) : null}
                      </Fragment>
                    )
                  case "note":
                    return (
                      <Fragment key="note">
                        {showNote ? (
                          <label className="sfc-field">
                            <span>{tx("checkout.note_label")}</span>
                            <input value={note} onChange={(e) => setNote(e.target.value)} />
                          </label>
                        ) : null}
                      </Fragment>
                    )
                  case "national_id":
                    return (
                      <Fragment key="national_id">
                        {nationalMode !== "hidden" ? (
                          <label className="sfc-field">
                            <span>{tx("checkout.national_id_label")}</span>
                            <input
                              dir="ltr"
                              inputMode="numeric"
                              autoComplete="off"
                              required={nationalMode === "required"}
                              pattern="\\d{10}"
                              value={nationalId}
                              onChange={(e) => setNationalId(toLatinDigits(e.target.value).replace(/\D/g, "").slice(0, 10))}
                            />
                          </label>
                        ) : null}
                      </Fragment>
                    )
                    default:
                      return null
                  }
                })}
              </div>

              {showShippingQuote ? (
                <div className="sfc-checkout__shipping">
                  <div className="sfc-checkout__shipping-head">
                    <strong>{tx("checkout.shipping_title")}</strong>
                    <button type="button" className="sfc-link-btn" onClick={() => void quoteShipping()}>
                      {tx("checkout.shipping_quote")}
                    </button>
                  </div>
                  <div className="sfc-checkout__rates">
                    {rates.length === 0 ? (
                      <p className="sfc-empty-note">{tx("checkout.shipping_hint")}</p>
                    ) : (
                      rates.map((rate) => (
                        <label key={rate.instance_id} className={`sfc-rate ${rateId === rate.instance_id ? "is-active" : ""}`}>
                          <input
                            type="radio"
                            name="ship"
                            checked={rateId === rate.instance_id}
                            onChange={() => setRateId(rate.instance_id)}
                          />
                          <span>{rate.title}</span>
                          <ClassicAmount value={rate.cost_minor} />
                        </label>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {error ? <p className="sfc-flash sfc-flash--err">{error}</p> : null}

              <button type="submit" disabled={busy || !lines.length} className="sfc-btn sfc-btn--block sfc-btn--lg">
                {busy ? "در حال ثبت…" : "ثبت سفارش و انتخاب پرداخت"}
              </button>
            </form>
          ) : (
            <div className="sfc-box sfc-checkout__pay">
              <h2 className="sfc-checkout__section-title">{tx("checkout.payment_title")}</h2>
              {hasCash && hasInstallment ? (
              <div className="sfc-pay-modes">
                <button
                  type="button"
                  className={mode === "cash" ? "is-active" : ""}
                  onClick={() => setMode("cash")}
                >
                  {tx("checkout.cash_tab")}
                </button>
                <button
                  type="button"
                  className={mode === "installment" ? "is-active" : ""}
                  onClick={() => setMode("installment")}
                >
                  {tx("checkout.installment_tab")}
                </button>
              </div>
              ) : null}
              <div className="sfc-pay-list">
                {displayGateways.length === 0 ? (
                  <p className="sfc-empty-note">{tCheckout("no_gateway_mode")}</p>
                ) : (
                  displayGateways.map((gateway) => {
                    return (
                      <button
                        key={gateway.id}
                        type="button"
                        onClick={() => void pay(gateway.id)}
                        className="sfc-pay-method"
                      >
                        <span className="sfc-pay-method__icon">
                          <IconCard size={22} />
                        </span>
                        <span className="sfc-pay-method__body">
                          <strong>{gateway.title || labelForGateway(gateway.id, tCheckout, t)}</strong>
                          {gateway.quote && gateway.quote.fee_percent > 0 ? (
                            <em>
                              {tCheckout("fee_line", {
                                percent: toLocaleDigits(gateway.quote.fee_percent, locale),
                              })}
                              {" · "}
                              {formatNumber(gateway.quote.charge_minor, normalizeUiLocale(locale))} تومان
                            </em>
                          ) : (
                            <em>{tx("checkout.gateway_ready")}</em>
                          )}
                        </span>
                        <IconCheck size={18} className="sfc-pay-method__check" />
                      </button>
                    )
                  })
                )}
              </div>
              {error ? <p className="sfc-flash sfc-flash--err">{error}</p> : null}
              <button type="button" className="sfc-link-btn" onClick={() => { setOrderId(null); setStep(1) }}>
                {tx("checkout.back_to_edit")}
              </button>
            </div>
          )}

          {showTrust ? <ClassicTrustStrip /> : null}
        </div>

        <aside className={`sfc-checkout__side ${stickySummary ? "is-sticky" : ""}`}>
          <div className="sfc-box sfc-summary">
            <h3 className="sfc-summary__title">{tx("checkout.summary_title")}</h3>
            <div className="sfc-checkout__items">
              {lines.length === 0 ? (
                <p className="sfc-empty-note">{tx("checkout.summary_empty")}</p>
              ) : (
                lines.map((line) => (
                  <div key={line.id} className="sfc-checkout-item">
                    <span className="sfc-checkout-item__img">
                      {line.product.cover_image_url || line.product.image_url ? (
                        <img src={line.product.cover_image_url || line.product.image_url || ""} alt="" />
                      ) : null}
                    </span>
                    <div className="sfc-checkout-item__body">
                      <strong>{line.product.name}</strong>
                      <span>× {digits(line.quantity)}</span>
                    </div>
                    <ClassicAmount
                      value={
                        pricing?.lines?.find((row) => row.id === line.id)?.line_total_minor ??
                        line.product.price_minor * line.quantity
                      }
                    />
                  </div>
                ))
              )}
            </div>
            <div className="sfc-summary__row">
              <span>قیمت کالاها ({digits(count)})</span>
              <ClassicAmount value={subtotal} />
            </div>
            {shipCost > 0 ? (
              <div className="sfc-summary__row">
                <span>{tx("checkout.shipping_title")}</span>
                <ClassicAmount value={shipCost} />
              </div>
            ) : null}
            <div className="sfc-summary__row sfc-summary__row--total">
              <span>{tx("checkout.payable_label")}</span>
              <ClassicAmount value={total} />
            </div>
            <ul className="sfc-checkout__assurances">
              <li>
                <IconShield size={16} /> {tx("checkout.assurance_1")}
              </li>
              <li>
                <IconTruck size={16} /> {tx("checkout.assurance_2")}
              </li>
              <li>
                <IconBadge size={16} /> {tx("checkout.assurance_3")}
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

function IconUserHint() {
  return (
    <span className="sfc-checkout__guest-icon" aria-hidden="true">
      <IconCard size={28} />
    </span>
  )
}
