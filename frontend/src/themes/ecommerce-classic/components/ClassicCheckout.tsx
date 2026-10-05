"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"

import { trackAnalyticsEvent } from "@/lib/analytics-track"
import { ApiError, api } from "@/lib/api"
import { formatNumber, normalizeUiLocale, toLatinDigits, toLocaleDigits } from "@/lib/locale"
import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"

import { syncGuestCart, useServerCart } from "@/builder/storefront/actions"
import { quietApi } from "@/builder/storefront/session"

import { ClassicCheckoutSteps } from "./ClassicCart"
import { ClassicTrustStrip } from "./ClassicProduct"
import { IconBadge, IconCard, IconCheck, IconShield, IconTruck } from "./icons"
import { ClassicAmount, useDigits } from "./parts"

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

const PLACEHOLDER_GATEWAYS: { id: Gateway["id"]; title: string }[] = [
  { id: "zarinpal", title: "زرین‌پال" },
  { id: "digipay", title: "دیجی‌پی" },
  { id: "snapppay", title: "اسنپ‌پی" },
  { id: "torobpay", title: "ترب‌پی" },
]

export function ClassicCheckout() {
  const theme = useClassicThemeSettings()
  const commerce = theme.commerce ?? {}
  const showCoupon = commerce.checkout_coupon !== false
  const showShippingQuote = commerce.checkout_shipping_quote !== false
  const showTrust = commerce.checkout_trust_badges !== false
  const showPaymentPlaceholders = commerce.checkout_payment_placeholders !== false
  const stickySummary = commerce.checkout_sticky_summary !== false
  const requirePhone = commerce.checkout_require_phone !== false

  const t = useTranslations("storefront")
  const tCheckout = useTranslations("checkout")
  const digits = useDigits()
  const locale = useLocale()
  const params = useSearchParams()
  const { auth, cart } = useServerCart()

  const [states, setStates] = useState<{ code: string; name: string }[]>([])
  const [stateCode, setStateCode] = useState("")
  const [city, setCity] = useState("")
  const [postcode, setPostcode] = useState("")
  const [address, setAddress] = useState("")
  const [phone, setPhone] = useState("")
  const [note, setNote] = useState("")
  const [coupon, setCoupon] = useState("")
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
  }, [])

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

  const displayGateways =
    allowed.length > 0
      ? allowed
      : showPaymentPlaceholders
        ? PLACEHOLDER_GATEWAYS.map((g) => ({
            id: g.id,
            title: g.title,
            cash_enabled: true,
            installment_enabled: true,
          }))
        : []

  if (auth === "loading") {
    return (
      <div className="sfc-checkout sfc-container">
        <ClassicCheckoutSteps active={1} />
        <div className="sfc-box sfc-checkout__empty">
          <span className="sfc-empty-note">در حال بارگذاری…</span>
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
          <h2>ورود برای ادامه خرید</h2>
          <p>برای ثبت سفارش و پرداخت، وارد حساب کاربری شوید. سبد خرید شما حفظ می‌شود.</p>
          <Link href={`/login?next=${encodeURIComponent("/checkout")}`} className="sfc-btn sfc-btn--lg">
            ورود و ادامه خرید
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
    setBusy(true)
    setError("")
    try {
      const shippingAddress = [stateCode, city, address, postcode].filter(Boolean).join("، ")
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
        },
      })
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
              <h2 className="sfc-checkout__section-title">اطلاعات تحویل‌گیرنده و آدرس</h2>
              <div className="sfc-checkout__fields">
                <label className="sfc-field">
                  <span>استان</span>
                  <select value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
                    <option value="">انتخاب کنید</option>
                    {states.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sfc-field">
                  <span>شهر</span>
                  <input value={city} onChange={(e) => setCity(e.target.value)} />
                </label>
                <label className="sfc-field">
                  <span>کد پستی</span>
                  <input
                    dir="ltr"
                    value={postcode}
                    onChange={(e) => setPostcode(toLatinDigits(e.target.value).replace(/\D/g, ""))}
                  />
                </label>
                <label className="sfc-field">
                  <span>موبایل</span>
                  <input
                    required={requirePhone}
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
                <label className="sfc-field sfc-field--full">
                  <span>آدرس کامل</span>
                  <textarea required value={address} onChange={(e) => setAddress(e.target.value)} rows={3} />
                </label>
                {showCoupon ? (
                  <label className="sfc-field">
                    <span>کد تخفیف</span>
                    <input
                      value={coupon}
                      onChange={(e) => setCoupon(e.target.value)}
                      placeholder="کد تخفیف را وارد نمایید"
                    />
                  </label>
                ) : null}
                <label className="sfc-field">
                  <span>یادداشت سفارش</span>
                  <input value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </div>

              {showShippingQuote ? (
                <div className="sfc-checkout__shipping">
                  <div className="sfc-checkout__shipping-head">
                    <strong>هزینه ارسال</strong>
                    <button type="button" className="sfc-link-btn" onClick={() => void quoteShipping()}>
                      محاسبه هزینه ارسال
                    </button>
                  </div>
                  <div className="sfc-checkout__rates">
                    {rates.length === 0 ? (
                      <p className="sfc-empty-note">پس از وارد کردن استان و کد پستی، هزینه را محاسبه کنید.</p>
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
              <h2 className="sfc-checkout__section-title">روش پرداخت</h2>
              <div className="sfc-pay-modes">
                <button
                  type="button"
                  className={mode === "cash" ? "is-active" : ""}
                  onClick={() => setMode("cash")}
                >
                  پرداخت نقدی
                </button>
                <button
                  type="button"
                  className={mode === "installment" ? "is-active" : ""}
                  onClick={() => setMode("installment")}
                >
                  پرداخت اقساطی
                </button>
              </div>
              <div className="sfc-pay-list">
                {displayGateways.length === 0 ? (
                  <p className="sfc-empty-note">{tCheckout("no_gateway_mode")}</p>
                ) : (
                  displayGateways.map((gateway) => {
                    const live = allowed.some((g) => g.id === gateway.id)
                    return (
                      <button
                        key={gateway.id}
                        type="button"
                        disabled={!live}
                        onClick={() => void pay(gateway.id)}
                        className="sfc-pay-method"
                        title={live ? undefined : "درگاه در تنظیمات فروشگاه فعال نیست"}
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
                          ) : live ? (
                            <em>آماده پرداخت امن</em>
                          ) : (
                            <em>نمایش نمونه — درگاه را از تنظیمات پرداخت فعال کنید</em>
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
                بازگشت به ویرایش اطلاعات
              </button>
            </div>
          )}

          {showTrust ? <ClassicTrustStrip /> : null}
        </div>

        <aside className={`sfc-checkout__side ${stickySummary ? "is-sticky" : ""}`}>
          <div className="sfc-box sfc-summary">
            <h3 className="sfc-summary__title">خلاصه سفارش</h3>
            <div className="sfc-checkout__items">
              {lines.length === 0 ? (
                <p className="sfc-empty-note">سبد خرید خالی است.</p>
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
                <span>هزینه ارسال</span>
                <ClassicAmount value={shipCost} />
              </div>
            ) : null}
            <div className="sfc-summary__row sfc-summary__row--total">
              <span>مبلغ قابل پرداخت</span>
              <ClassicAmount value={total} />
            </div>
            <ul className="sfc-checkout__assurances">
              <li>
                <IconShield size={16} /> ضمانت بازگشت کالا
              </li>
              <li>
                <IconTruck size={16} /> ارسال سریع
              </li>
              <li>
                <IconBadge size={16} /> پرداخت امن
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
