"use client"
import { OptImg } from "@/components/perf/OptImg"

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
import { ClassicCouponChooser } from "./ClassicCouponChooser"

import { ClassicCheckoutSteps } from "./ClassicCart"
import { ClassicTrustStrip } from "./ClassicProduct"
import { IconBadge, IconCard, IconCheck, IconShield, IconTruck } from "./icons"
import { ClassicAmount, useDigits } from "./parts"
import { useClassicText } from "../lib/texts"
import { optImg } from "@/lib/image-url"

type Gateway = {
  id: "zarinpal" | "zibal" | "digipay" | "snapppay" | "torobpay" | "bale_pay" | "basalam_pay" | "cod" | "cheque" | "c2c" | "wallet"
  title?: string
  cash_enabled: boolean
  installment_enabled: boolean
  kind?: "online" | "offline"
  quote?: { fee_percent: number; fee_payer: string; fee_minor: number; base_minor: number; charge_minor: number }
}

type SavedAddress = {
  label?: string
  name?: string
  phone?: string
  address?: string
  city?: string
  province_code?: string
  postcode?: string
  plaque?: string
  unit?: string
  lat?: number
  lng?: number
  is_default?: boolean
}

type Rate = { instance_id: number; title: string; cost_minor: number }

function labelForGateway(
  id: string,
  tCheckout: (key: "pay_zarinpal" | "pay_digipay" | "pay_snapppay" | "pay_torobpay") => string,
  t: (key: "pay_bale" | "pay_basalam") => string,
) {
  if (id === "zarinpal" || id === "digipay" || id === "snapppay" || id === "torobpay") return tCheckout(`pay_${id}` as "pay_zarinpal")
  if (id === "zibal") return "زیبال"
  if (id === "bale_pay") return t("pay_bale")
  if (id === "basalam_pay") return t("pay_basalam")
  if (id === "cod") return "پرداخت در محل"
  if (id === "cheque") return "پرداخت با چک"
  if (id === "c2c") return "کارت به کارت"
  if (id === "wallet") return "کیف پول"
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
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [gateways, setGateways] = useState<Gateway[]>([])
  const [mode, setMode] = useState<"cash" | "installment">("cash")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([])
  const [selectedAddressIdx, setSelectedAddressIdx] = useState<number | null>(null)
  const [guestCheckout, setGuestCheckout] = useState(false)
  const [doneProvider, setDoneProvider] = useState<string | null>(null)
  const [selectedPay, setSelectedPay] = useState<Gateway["id"] | null>(null)
  const [addressNote, setAddressNote] = useState("")
  const flash = params.get("payment")

  const lines = cart?.items ?? []
  const pricing = cart?.pricing
  const subtotal = pricing?.subtotal_minor ?? lines.reduce((sum, line) => sum + line.product.price_minor * line.quantity, 0)
  const count = lines.reduce((sum, line) => sum + line.quantity, 0)
  const [districts, setDistricts] = useState<Record<string, string[]>>({})
  const [district, setDistrict] = useState("")
  const [proPack, setProPack] = useState<{ enabled: boolean; mandatory: boolean; amount_minor: number; label: string; description?: string; default_selected?: boolean; replaces_carton?: boolean } | null>(null)
  const [proPackOn, setProPackOn] = useState(false)
  const cityDistricts = districts[city.trim()] ?? []
  const proPackFee = proPack?.enabled && proPack.amount_minor > 0 && (proPack.mandatory || proPackOn) ? proPack.amount_minor : 0
  const pickedRate = rates.find((r) => r.instance_id === rateId) as { cost_minor?: number; packaging_minor?: number } | undefined
  const cartonOff = proPackFee > 0 && proPack?.replaces_carton !== false ? (pickedRate?.packaging_minor ?? 0) : 0
  const shipCost = Math.max(0, (pickedRate?.cost_minor ?? 0) - cartonOff) + proPackFee
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
    void quietApi<{ data?: { cities?: string[]; districts?: Record<string, string[]>; professional_packaging?: { enabled: boolean; mandatory: boolean; amount_minor: number; label: string; description?: string; default_selected?: boolean; replaces_carton?: boolean } } }>(
      `/api/v1/shipping/regions?state_code=${encodeURIComponent(stateCode)}`,
    ).then((res) => {
      if (!res.ok) return
      setRegionCities(res.data.data?.cities ?? [])
      setDistricts(res.data.data?.districts ?? {})
      const pp = res.data.data?.professional_packaging ?? null
      setProPack(pp)
      if (pp?.default_selected) setProPackOn(true)
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
    void quietApi<{ guest_checkout?: boolean; data?: { guest_checkout?: boolean } }>("/api/v1/public/tenant").then((res) => {
      if (!res.ok) return
      const raw = res.data as { guest_checkout?: boolean; data?: { guest_checkout?: boolean } }
      setGuestCheckout(Boolean(raw.guest_checkout ?? raw.data?.guest_checkout))
    })
  }, [])

  useEffect(() => {
    if (auth !== "auth") return
    void quietApi<unknown>("/api/v1/account/addresses").then((res) => {
      if (!res.ok) {
        setAddressNote("دفترچه آدرس در دسترس نیست؛ می‌توانید آدرس را همین‌جا وارد کنید.")
        return
      }
      const payload = res.data as { addresses?: SavedAddress[]; data?: { addresses?: SavedAddress[] } }
      const raw = payload?.addresses ?? payload?.data?.addresses ?? []
      const list = (Array.isArray(raw) ? raw : []).filter((a) => a && (a.address || a.city))
      setSavedAddresses(list)
      if (!list.length) {
        setAddressNote("هنوز آدرسی ذخیره نشده. فرم زیر را پر کنید؛ با ثبت سفارش در دفترچه می‌ماند.")
        return
      }
      setAddressNote("")
      const def = list.findIndex((a) => a.is_default)
      applySavedAddress(list[def >= 0 ? def : 0], def >= 0 ? def : 0)
    })
  }, [auth])

  useEffect(() => {
    if (!showShippingQuote || !stateCode || !city.trim()) return
    const timer = window.setTimeout(() => {
      void quoteShipping()
    }, 350)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateCode, city, showShippingQuote])

  useEffect(() => {
    if (cart?.pricing?.purchase_type === "installment") setMode("installment")
  }, [cart?.pricing?.purchase_type])

  useEffect(() => {
    if (auth !== "auth") return
    const qs = orderId ? `?order_id=${orderId}` : "?mode=cash"
    void api<{ gateways?: Gateway[] }>(`/api/v1/payments/checkout-options${qs}`)
      .then((res) => {
        const list = res.gateways ?? []
        setGateways(list)
        setSelectedPay((prev) => {
          if (prev && list.some((g) => g.id === prev)) return prev
          const cod = list.find((g) => g.id === "cod")
          return (cod?.id ?? list[0]?.id ?? null) as Gateway["id"] | null
        })
      })
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

  function applySavedAddress(row: SavedAddress, index: number) {
    setSelectedAddressIdx(index)
    if (row.name) setRecipient(row.name)
    if (row.phone) setPhone(row.phone)
    if (row.address) {
      const plaque = row.plaque ? ` پلاک ${row.plaque}` : ""
      const unit = row.unit ? ` واحد ${row.unit}` : ""
      setAddress(`${row.address}${plaque}${unit}`.trim())
    }
    if (row.city) setCity(row.city)
    if (row.postcode) setPostcode(String(row.postcode).replace(/\D/g, "").slice(0, 10))
    if (row.province_code) setStateCode(row.province_code)
  }

  function buildAddressPayload(asDefault = false): SavedAddress {
    return {
      label: recipient.trim() || city.trim() || "آدرس من",
      name: recipient.trim() || undefined,
      phone: phone || undefined,
      address: address.trim() || undefined,
      city: city.trim() || undefined,
      province_code: stateCode || undefined,
      postcode: postcode || undefined,
      is_default: asDefault || savedAddresses.length === 0,
    }
  }

  async function saveCurrentAddress(opts?: { quiet?: boolean }): Promise<boolean> {
    if (auth !== "auth") return false
    const next = buildAddressPayload(selectedAddressIdx == null)
    if (!next.address) {
      if (!opts?.quiet) setError("برای ذخیره، آدرس را وارد کنید.")
      return false
    }
    const merged = savedAddresses.map((row, i) => ({ ...row, is_default: false }))
    if (selectedAddressIdx != null && selectedAddressIdx >= 0) {
      merged[selectedAddressIdx] = { ...merged[selectedAddressIdx], ...next, is_default: true }
    } else {
      merged.unshift({ ...next, is_default: true })
    }
    const capped = merged.slice(0, 10)
    const res = await quietApi<unknown>("/api/v1/account/addresses", { method: "PATCH", json: { addresses: capped } })
    if (!res.ok) {
      if (!opts?.quiet) setError("ذخیره آدرس ناموفق بود.")
      return false
    }
    const payload = res.data as { addresses?: SavedAddress[]; data?: { addresses?: SavedAddress[] } }
    const raw = payload?.addresses ?? payload?.data?.addresses ?? capped
    const list = (Array.isArray(raw) ? raw : capped).filter((a) => a && (a.address || a.city))
    setSavedAddresses(list)
    const def = list.findIndex((a) => a.is_default)
    setSelectedAddressIdx(def >= 0 ? def : 0)
    setAddressNote(list.length ? "آدرس در دفترچه ذخیره شد." : "")
    return true
  }

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
          <h2>{guestCheckout ? "ورود یا ادامه به‌عنوان مهمان" : tx("checkout.login_title")}</h2>
          <p>
            {guestCheckout
              ? "برای ثبت سفارش وارد شوید (ورود با پیامک). خرید مهمان به‌زودی از همین صفحه فعال می‌شود."
              : tx("checkout.login_text")}
          </p>
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

  async function confirmPayment(orderKey: number, provider: Gateway["id"]) {
    const offline = provider === "cod" || provider === "cheque" || provider === "c2c"
    if (offline) {
      const res = await api<{ id: number; number?: string | null; status: string; payment_provider?: string }>(
        "/api/v1/payments/offline",
        { method: "POST", json: { order_id: orderKey, provider } },
      )
      setOrderNumber(res.number ? String(res.number) : String(res.id))
      setDoneProvider(provider)
      setStep(3)
      return
    }
    if (provider === "wallet") {
      setError("پرداخت با کیف پول از پنل حساب کاربری انجام می‌شود.")
      return
    }
    const intent = await api<{ redirect_url: string | null; data?: { redirect_url?: string | null } }>(
      "/api/v1/payments/intent",
      { method: "POST", json: { order_id: orderKey, provider, mode } },
    )
    const url = intent.redirect_url ?? intent.data?.redirect_url ?? null
    if (url?.startsWith("http")) {
      window.location.assign(url)
      return
    }
    setError(t("pay_missing"))
  }

  async function placeOrder() {
    if (nationalMode !== "hidden" && (nationalMode === "required" || nationalId) && !isValidIranNationalId(nationalId)) {
      setError(tx("checkout.national_id_invalid"))
      return
    }
    if (!selectedPay) {
      setError("لطفاً روش پرداخت را انتخاب کنید.")
      return
    }
    if (showShippingQuote && rates.length > 0 && !rateId) {
      setError("لطفاً روش ارسال را انتخاب کنید.")
      return
    }
    setBusy(true)
    setError("")
    try {
      await saveCurrentAddress({ quiet: true })
      const stateName = states.find((item) => item.code === stateCode)?.name ?? stateCode
      const shippingAddress = [recipient.trim(), stateName, city, address, postcode].filter(Boolean).join("، ")
      const order = await api<{ id: number; number?: string | null }>("/api/v1/checkout", {
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
          shipping_district: district || null,
          professional_packaging: proPackFee > 0,
          customer_national_id: nationalMode !== "hidden" ? nationalId || null : null,
          recipient_name: recipient.trim() || null,
          address_line: address.trim() || null,
          address_label: recipient.trim() || city.trim() || "آدرس من",
          save_address: true,
        },
      })
      if (showCoupon && coupon) storeCoupon(null)
      setOrderId(order.id)
      setOrderNumber(order.number ? String(order.number) : String(order.id))
      await confirmPayment(order.id, selectedPay)
      // Refresh address book after server-side persist
      const book = await quietApi<unknown>("/api/v1/account/addresses")
      if (book.ok) {
        const payload = book.data as { addresses?: SavedAddress[]; data?: { addresses?: SavedAddress[] } }
        const raw = payload?.addresses ?? payload?.data?.addresses ?? []
        const list = (Array.isArray(raw) ? raw : []).filter((a) => a && (a.address || a.city))
        setSavedAddresses(list)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("add_failed"))
    } finally {
      setBusy(false)
    }
  }

  async function pay(provider: Gateway["id"]) {
    setSelectedPay(provider)
    if (!orderId) return
    setError("")
    setBusy(true)
    try {
      await confirmPayment(orderId, provider)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("add_failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sfc-checkout sfc-container">
      <ClassicCheckoutSteps active={step === 3 || flash === "success" ? 3 : 1} />
      <div className="sfc-checkout__headline">
        <h1>
          {step === 3 || flash === "success"
            ? "سفارش ثبت شد"
            : orderId
              ? "پرداخت سفارش"
              : "اطلاعات ارسال و تسویه"}
        </h1>
        {orderId || orderNumber ? (
          <span className="sfc-pill">
            سفارش #{digits(Number(orderId || 0))}
          </span>
        ) : (
          <span className="sfc-checkout__hint">مرحله {digits(step)} از {digits(3)}</span>
        )}
      </div>

      {flash === "refund_pending" ? <p role="alert" className="sfc-flash sfc-flash--err">{tCheckout("payment_refund_pending")}</p> : null}
      {flash === "failed" ? <p className="sfc-flash sfc-flash--err">{tCheckout("payment_failed")}</p> : null}

      {step === 3 || flash === "success" ? (
        <div className="sfc-box sfc-checkout__success">
          <div className="sfc-checkout__success-icon" aria-hidden="true">
            <IconCheck size={36} />
          </div>
          <h2>سفارش شما با موفقیت ثبت شد</h2>
          <p>
            شماره سفارش: <strong dir="ltr">#{orderNumber ? String(orderNumber) : digits(Number(orderId || params.get("order") || 0))}</strong>
          </p>
          <p className="sfc-checkout__success-note">
            {doneProvider === "cod"
              ? "مبلغ هنگام تحویل دریافت می‌شود."
              : flash === "success"
                ? "پرداخت آنلاین تأیید شد."
                : "سفارش ثبت شد و در صف پردازش قرار گرفت."}
          </p>
          <div className="sfc-checkout__success-actions">
            <Link href="/shop" className="sfc-btn sfc-btn--lg">
              ادامه خرید
            </Link>
            <Link href="/dashboard/account/orders" className="sfc-btn sfc-btn--lg sfc-btn--ghost">
              پیگیری سفارش
            </Link>
          </div>
        </div>
      ) : null}

      {step === 3 || flash === "success" ? null : (
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
              <div className="sfc-address-book">
                <p className="sfc-address-book__label">آدرس‌های ذخیره‌شده</p>
                {savedAddresses.length ? (
                  <div className="sfc-address-book__list">
                    {savedAddresses.map((row, index) => (
                      <button
                        key={`${row.label || "a"}-${index}`}
                        type="button"
                        className={`sfc-address-card ${selectedAddressIdx === index ? "is-active" : ""}`}
                        onClick={() => applySavedAddress(row, index)}
                      >
                        <strong>{row.label || row.name || `آدرس ${digits(index + 1)}`}</strong>
                        <span>{[row.city, row.address].filter(Boolean).join("، ") || "ندارد"}</span>
                        {row.phone ? <em dir="ltr">{row.phone}</em> : null}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`sfc-address-card sfc-address-card--new ${selectedAddressIdx == null ? "is-active" : ""}`}
                      onClick={() => {
                        setSelectedAddressIdx(null)
                        setAddressNote("آدرس جدید را در فرم زیر وارد کنید.")
                      }}
                    >
                      <strong>آدرس جدید</strong>
                      <span>فرم را برای آدرس تازه پر کنید</span>
                    </button>
                  </div>
                ) : (
                  <p className="sfc-address-book__empty">{addressNote || "دفترچه خالی است. فرم زیر را پر کنید."}</p>
                )}
                {savedAddresses.length && addressNote ? <p className="sfc-address-book__hint">{addressNote}</p> : null}
              </div>
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
                        {cityDistricts.length ? (
                          <label className="sfc-field">
                            <span>محله</span>
                            <select value={district} onChange={(e) => setDistrict(e.target.value)}>
                              <option value="">انتخاب محله</option>
                              {cityDistricts.map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        {proPack?.enabled && proPack.amount_minor > 0 ? (
                          <label className="sfc-field sfc-field--check">
                            <input type="checkbox" checked={proPack.mandatory || proPackOn} disabled={proPack.mandatory} onChange={(e) => setProPackOn(e.target.checked)} />
                            <span>{proPack.label || "بسته‌بندی حرفه‌ای"} (+<ClassicAmount value={proPack.amount_minor} />){proPack.mandatory ? " (اجباری)" : ""}</span>
                            {proPack.description ? <small className="sfc-hint">{proPack.description}</small> : null}
                          </label>
                        ) : null}
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
                        {showCoupon ? (
                          <ClassicCouponChooser
                            subtotal={subtotal}
                            appliedCode={coupon || null}
                            onApply={(code) => {
                              setCoupon(code)
                              storeCoupon(code)
                            }}
                            onRemove={() => {
                              setCoupon("")
                              storeCoupon(null)
                            }}
                          />
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

              <button type="button" className="sfc-link-btn sfc-checkout__save-address" onClick={() => void saveCurrentAddress()}>
                ذخیره این آدرس در دفترچه
              </button>

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

              <div className="sfc-checkout__pay sfc-checkout__pay--inline">
                <h2 className="sfc-checkout__section-title">{tx("checkout.payment_title")}</h2>
                {hasCash && hasInstallment ? (
                  <div className="sfc-pay-modes">
                    <button type="button" className={mode === "cash" ? "is-active" : ""} onClick={() => setMode("cash")}>
                      {tx("checkout.cash_tab")}
                    </button>
                    <button type="button" className={mode === "installment" ? "is-active" : ""} onClick={() => setMode("installment")}>
                      {tx("checkout.installment_tab")}
                    </button>
                  </div>
                ) : null}
                <div className="sfc-pay-list" role="radiogroup" aria-label={tx("checkout.payment_title")}>
                  {displayGateways.length === 0 ? (
                    <p className="sfc-empty-note">{tCheckout("no_gateway_mode")}</p>
                  ) : (
                    displayGateways.map((gateway) => {
                      const offline = gateway.kind === "offline" || gateway.id === "cod" || gateway.id === "cheque" || gateway.id === "c2c"
                      const active = selectedPay === gateway.id
                      return (
                        <label
                          key={gateway.id}
                          className={`sfc-pay-method ${offline ? "is-offline" : ""} ${active ? "is-selected" : ""}`}
                        >
                          <input
                            type="radio"
                            name="checkout-pay"
                            checked={active}
                            onChange={() => setSelectedPay(gateway.id)}
                          />
                          <span className="sfc-pay-method__icon">
                            {offline ? <IconTruck size={22} /> : <IconCard size={22} />}
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
                              <em>{offline ? (gateway.id === "cod" ? "پرداخت هنگام تحویل" : "بدون درگاه آنلاین") : tx("checkout.gateway_ready")}</em>
                            )}
                          </span>
                          <IconCheck size={18} className="sfc-pay-method__check" />
                        </label>
                      )
                    })
                  )}
                </div>
              </div>

              {error ? <p className="sfc-flash sfc-flash--err">{error}</p> : null}

              <button type="submit" disabled={busy || !lines.length || !selectedPay} className="sfc-btn sfc-btn--block sfc-btn--lg">
                {busy ? "در حال ثبت…" : "ثبت نهایی سفارش"}
              </button>
            </form>
          ) : (
            <div className="sfc-box sfc-checkout__pay">
              <h2 className="sfc-checkout__section-title">{tx("checkout.payment_title")}</h2>
              <p className="sfc-empty-note">سفارش ثبت شد؛ پرداخت را تکمیل کنید.</p>
              <div className="sfc-pay-list">
                {displayGateways.map((gateway) => {
                  const offline = gateway.kind === "offline" || gateway.id === "cod" || gateway.id === "cheque" || gateway.id === "c2c"
                  return (
                    <button
                      key={gateway.id}
                      type="button"
                      disabled={busy}
                      onClick={() => void pay(gateway.id)}
                      className={`sfc-pay-method ${offline ? "is-offline" : ""}`}
                    >
                      <span className="sfc-pay-method__icon">{offline ? <IconTruck size={22} /> : <IconCard size={22} />}</span>
                      <span className="sfc-pay-method__body">
                        <strong>{gateway.title || labelForGateway(gateway.id, tCheckout, t)}</strong>
                      </span>
                    </button>
                  )
                })}
              </div>
              {error ? <p className="sfc-flash sfc-flash--err">{error}</p> : null}
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
                        <OptImg loading="lazy" decoding="async" {...optImg(line.product.cover_image_url || line.product.image_url || "")} alt="" />
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
      )}
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
