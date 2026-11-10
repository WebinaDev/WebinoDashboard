"use client"

/*
 * Stepped cart/checkout for every shop storefront theme (classic, default, academy purchases).
 * Steps and fields come from commerce.checkout_flow (GET /checkout/config or the guest
 * /public/shop/checkout-config): address -> delivery_time -> shipping -> payment. Each step is
 * validated and saved by POST .../checkout/steps/{step}, which also returns fresh totals.
 */

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"

import { trackAnalyticsEvent } from "@/lib/analytics-track"
import { gatewayBrandSrc, shippingBrandSrc } from "@/lib/checkout-brands"
import { useGatewayLabel } from "@/lib/gateway-label"

import { cartLineKey, cartServerSnapshot, cartSnapshot, clearCart, subscribeCart } from "../cart"
import { BuilderPrice, formatAmountDigits, useBuilderCurrency } from "../money"
import { readStoredCoupon, storeCoupon } from "./coupon"
import { serverLinePrice, syncGuestCart, useServerCart } from "./actions"
import { notifyCart } from "./session"

import "./stepped-checkout.css"

export type StepKey = "address" | "delivery_time" | "shipping" | "payment"

export type FlowField = { key: string; label: string; enabled: boolean; required: boolean; type: string; order: number }

export type FlowGateway = {
  id: string
  title?: string | null
  title_key?: string | null
  label_en?: string | null
  category?: string | null
  logo_url?: string | null
  cash_enabled?: boolean
  installment_enabled?: boolean
  fee_percent?: number
  fee_payer?: string
}

export type FlowConfig = {
  stepped: boolean
  steps: Array<{ key: StepKey; label: string; enabled: boolean; order: number }>
  fields: Partial<Record<StepKey, FlowField[]>>
  delivery_time: {
    mode: "all" | "methods"
    shipping_methods: string[]
    days: Array<{ date: string; weekday: number; slots: Array<{ id: string; label: string; from?: string; to?: string }> }>
  }
  payment: {
    gateway_layout: "list" | "grouped" | "cards"
    coupon_enabled: boolean
    gift_card_enabled: boolean
    summary_enabled: boolean
    terms_required: boolean
    terms_url: string
  }
  gateways: FlowGateway[]
  pricing?: { single_price?: boolean }
  guest_checkout?: boolean
}

type TotalsLine = {
  line_id: number | null
  product_id: number
  product_variant_id: number | null
  name: string
  variant_name: string | null
  image_url: string | null
  quantity: number
  unit_price_minor: number
  regular_price_minor: number
  on_sale: boolean
  line_total_minor: number
}

type ShippingRate = { instance_id: number; method_id: string; title: string; cost_minor: number; delivery_time_required: boolean }

export type Totals = {
  purchase_type: string
  lines: TotalsLine[]
  items_count: number
  regular_subtotal_minor: number
  sale_savings_minor: number
  subtotal_minor: number
  coupon: { code: string; discount_minor: number; free_shipping: boolean; auto: boolean } | null
  coupon_error: string | null
  discount_minor: number
  shipping_rates: ShippingRate[]
  shipping: { instance_id: number; title: string } | null
  shipping_minor: number
  packaging_minor: number
  tax_minor: number
  tax_added_minor: number
  gift_card: { code: string; applied_minor: number; balance_minor: number; remaining_minor: number } | null
  gift_card_error: string | null
  gift_card_minor: number
  total_minor: number
  delivery_time_required: boolean
}

type Values = Record<string, unknown>
type CallResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string; errors: Record<string, string> }

const OFFLINE = new Set(["cod", "cheque", "c2c", "card_to_card"])
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""
const EMPTY = "ندارد"

const CATEGORY_LABELS: Record<string, string> = {
  offline: "پرداخت حضوری و آفلاین",
  psp: "درگاه بانکی",
  aggregator: "درگاه پرداخت اینترنتی",
  bnpl: "خرید اقساطی و اعتباری",
  fx_crypto: "پرداخت ارزی و رمزارز",
  wallet: "کیف پول",
  other: "سایر روش‌ها",
}

function unwrap(body: unknown): unknown {
  let r = body
  if (r && typeof r === "object" && (r as Record<string, unknown>).success === true && "data" in (r as object)) r = (r as Record<string, unknown>).data
  if (r && typeof r === "object" && "data" in (r as object) && Object.keys(r as object).length <= 2) r = (r as Record<string, unknown>).data
  return r
}

async function call<T>(path: string, method = "GET", json?: unknown): Promise<CallResult<T>> {
  try {
    const res = await fetch(path.startsWith("http") ? path : `${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    })
    const text = await res.text()
    let body: Record<string, unknown> | null = null
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : null
    } catch {
      body = null
    }
    if (!res.ok) {
      const rawErrors = (body?.errors ?? (body?.data as Record<string, unknown> | undefined)?.errors ?? {}) as Record<string, unknown>
      const errors: Record<string, string> = {}
      for (const [k, v] of Object.entries(rawErrors)) errors[k] = Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "")
      const message = typeof body?.message === "string" ? body.message : ""
      return { ok: false, status: res.status, message, errors }
    }
    return { ok: true, data: unwrap(body) as T }
  } catch {
    return { ok: false, status: 0, message: "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.", errors: {} }
  }
}

function guestToken(): string {
  try {
    const key = "webino.guest_checkout_token"
    let t = window.sessionStorage.getItem(key)
    if (!t) {
      t = Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, "0")).join("")
      window.sessionStorage.setItem(key, t)
    }
    return t
  } catch {
    return ""
  }
}

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
const faDigits = (v: string | number) => String(v).replace(/\d/g, (d) => FA_DIGITS[Number(d)])
const latinDigits = (v: string) => v.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))

/** Jalali day label for a Y-m-d delivery date (Tehran calendar). */
function jalaliDay(date: string): { weekday: string; day: string } {
  const d = new Date(`${date}T12:00:00+03:30`)
  try {
    return {
      weekday: new Intl.DateTimeFormat("fa-IR-u-ca-persian", { weekday: "long", timeZone: "Asia/Tehran" }).format(d),
      day: new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", month: "long", timeZone: "Asia/Tehran" }).format(d),
    }
  } catch {
    return { weekday: "", day: faDigits(date) }
  }
}

function str(v: unknown): string {
  return v == null ? "" : String(v)
}

/** Step order: delivery time scoped to shipping methods can only be decided after shipping. */
export function orderedSteps(cfg: FlowConfig): StepKey[] {
  const keys = [...cfg.steps].filter((s) => s.enabled).sort((a, b) => a.order - b.order).map((s) => s.key)
  if (cfg.delivery_time.mode === "methods" && keys.includes("delivery_time") && keys.includes("shipping")) {
    const rest: StepKey[] = keys.filter((k) => k !== "delivery_time")
    rest.splice(rest.indexOf("shipping") + 1, 0, "delivery_time")
    return rest
  }
  return keys
}

function stepVisible(cfg: FlowConfig, step: StepKey, totals: Totals | null): boolean {
  if (step !== "delivery_time") return true
  if (!cfg.delivery_time.days.length) return false
  if (cfg.delivery_time.mode === "all") return true
  return Boolean(totals?.delivery_time_required)
}

/** Loads the checkout flow config for a signed-in shopper or a guest (403 when guests are off). */
export function useCheckoutFlow(auth: "loading" | "auth" | "guest") {
  const [state, setState] = useState<{ config: FlowConfig | null; status: "loading" | "ready" | "guest_off" | "error" }>({ config: null, status: "loading" })
  useEffect(() => {
    if (auth === "loading") return
    let live = true
    const path = auth === "auth" ? "/api/v1/checkout/config" : "/api/v1/public/shop/checkout-config"
    void call<FlowConfig>(path).then((res) => {
      if (!live) return
      if (res.ok && res.data && Array.isArray(res.data.steps)) setState({ config: res.data, status: "ready" })
      else setState({ config: null, status: !res.ok && res.status === 403 ? "guest_off" : "error" })
    })
    return () => {
      live = false
    }
  }, [auth])
  return state
}

export type SteppedSkin = "classic" | "default"

export function SteppedCheckout({ skin = "default", config, auth }: { skin?: SteppedSkin; config: FlowConfig; auth: "auth" | "guest" }) {
  const params = useSearchParams()
  const flash = params.get("payment")
  const gatewayLabel = useGatewayLabel()
  const cur = useBuilderCurrency()
  const { cart } = useServerCart()
  const local = useSyncExternalStore(subscribeCart, cartSnapshot, cartServerSnapshot)
  const isGuest = auth !== "auth"

  const steps = useMemo(() => orderedSteps(config), [config])
  const [values, setValues] = useState<Values>({})
  const [totals, setTotals] = useState<Totals | null>(null)
  const [current, setCurrent] = useState<StepKey>(steps[0] ?? "payment")
  const [done, setDone] = useState<StepKey[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [states, setStates] = useState<Array<{ code: string; name: string }>>([])
  const [cities, setCities] = useState<string[]>([])
  const [districts, setDistricts] = useState<Record<string, string[]>>({})
  const [pack, setPack] = useState<{ enabled: boolean; mandatory: boolean; amount_minor: number; label: string; description?: string; default_selected?: boolean } | null>(null)
  const [saved, setSaved] = useState<Array<Record<string, unknown>>>([])
  const [giftBalance, setGiftBalance] = useState<string>("")
  const [placed, setPlaced] = useState<{ id: number; number: string; offline: boolean; instructions?: string } | null>(null)
  const sessionLoaded = useRef(false)

  const guestItems = useMemo(
    () =>
      local
        .filter((l) => l.productId)
        .map((l) => ({ product_id: Number(l.productId), quantity: l.qty, ...(l.variantId ? { variant_id: l.variantId } : {}) })),
    [local],
  )
  const hasItems = isGuest ? guestItems.length > 0 : (cart?.items?.length ?? 0) > 0

  const set = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  useEffect(() => {
    trackAnalyticsEvent("checkout_start")
    const coupon = readStoredCoupon()
    if (coupon) setValues((prev) => ({ coupon_code: coupon, ...prev }))
    void call<{ states?: Array<{ code: string; name: string }> }>("/api/v1/public/geo/states").then((res) => {
      if (res.ok) setStates((res.data as { states?: Array<{ code: string; name: string }> })?.states ?? [])
    })
  }, [])

  // Signed in: guest lines move to the server cart, saved step values and addresses come back.
  useEffect(() => {
    if (isGuest || sessionLoaded.current) return
    sessionLoaded.current = true
    void (async () => {
      await syncGuestCart()
      const res = await call<{ values?: Values; completed?: StepKey[]; totals?: Totals | null }>("/api/v1/checkout/session")
      if (res.ok && res.data) {
        if (res.data.values && typeof res.data.values === "object") setValues((prev) => ({ ...res.data.values, ...prev }))
        if (res.data.totals) setTotals(res.data.totals)
      }
      const book = await call<{ addresses?: Array<Record<string, unknown>> }>("/api/v1/account/addresses")
      if (book.ok) {
        const raw = (book.data as { addresses?: Array<Record<string, unknown>> })?.addresses ?? []
        setSaved((Array.isArray(raw) ? raw : []).filter((a) => a && (a.address || a.city)))
      }
    })()
  }, [isGuest])

  const stateCode = str(values.shipping_state_code)
  useEffect(() => {
    if (!stateCode) {
      setCities([])
      return
    }
    const path = isGuest
      ? `/api/v1/public/shop/shipping/regions?state_code=${encodeURIComponent(stateCode)}`
      : `/api/v1/shipping/regions?state_code=${encodeURIComponent(stateCode)}`
    void call<{ cities?: string[]; districts?: Record<string, string[]>; professional_packaging?: typeof pack }>(path).then((res) => {
      if (!res.ok || !res.data) return
      const d = res.data as { cities?: string[]; districts?: Record<string, string[]>; professional_packaging?: typeof pack }
      setCities(d.cities ?? [])
      setDistricts(d.districts ?? {})
      setPack(d.professional_packaging ?? null)
    })
  }, [stateCode, isGuest])

  const visibleSteps = steps.filter((s) => stepVisible(config, s, totals))
  const stepLabel = (key: StepKey) => config.steps.find((s) => s.key === key)?.label || key
  const fieldsOf = (key: StepKey) => [...(config.fields[key] ?? [])].filter((f) => f.enabled).sort((a, b) => a.order - b.order)
  const fieldOf = (step: StepKey, key: string) => fieldsOf(step).find((f) => f.key === key)

  function composedAddress(v: Values): string {
    const stateName = states.find((s) => s.code === str(v.shipping_state_code))?.name ?? str(v.shipping_state_code)
    const plaque = str(v.shipping_plaque) ? `پلاک ${str(v.shipping_plaque)}` : ""
    const unit = str(v.shipping_unit) ? `واحد ${str(v.shipping_unit)}` : ""
    return [stateName, str(v.shipping_city), str(v.shipping_district), str(v.address_line), plaque, unit, str(v.shipping_postcode)].filter(Boolean).join("، ")
  }

  function payloadValues(v: Values): Values {
    const out: Values = {}
    for (const [k, val] of Object.entries(v)) {
      if (val === "" || val === undefined) continue
      out[k] = typeof val === "string" && /(phone|postcode|national_id|plaque|unit)/.test(k) ? latinDigits(val) : val
    }
    out.shipping_address = composedAddress(v) || undefined
    if (!isGuest) {
      out.save_address = true
      out.address_label = str(v.recipient_name) || str(v.shipping_city) || "آدرس من"
    }
    return out
  }

  function nextAfter(step: StepKey, fresh: Totals | null, serverNext: string | null | undefined): StepKey | null {
    const i = steps.indexOf(step)
    for (let j = i + 1; j < steps.length; j++) {
      if (stepVisible(config, steps[j], fresh)) return steps[j]
    }
    return (serverNext && steps.includes(serverNext as StepKey) ? (serverNext as StepKey) : null) ?? null
  }

  async function postStep(step: StepKey, v: Values) {
    const body = payloadValues(v)
    const path = isGuest ? `/api/v1/public/shop/checkout/steps/${step}` : `/api/v1/checkout/steps/${step}`
    const json = isGuest ? { ...body, items: guestItems, values: body, guest_token: guestToken() } : body
    return call<{ values?: Values; next_step?: string | null; totals?: Totals }>(path, "POST", json)
  }

  async function submit(step: StepKey) {
    setBusy(true)
    setMessage("")
    const res = await postStep(step, values)
    setBusy(false)
    if (!res.ok) {
      setErrors(res.errors)
      setMessage(Object.keys(res.errors).length ? "لطفاً خطاهای مشخص‌شده را برطرف کنید." : res.message || "ثبت این مرحله ناموفق بود.")
      return null
    }
    setErrors({})
    const fresh = res.data.totals ?? null
    if (fresh) setTotals(fresh)
    if (res.data.values && !isGuest) setValues((prev) => ({ ...prev, ...res.data.values }))
    setDone((prev) => (prev.includes(step) ? prev : [...prev, step]))
    if (step === "address" && fresh && !values.shipping_instance_id && fresh.shipping_rates.length === 1) {
      set("shipping_instance_id", fresh.shipping_rates[0].instance_id)
    }
    return { fresh, next: nextAfter(step, fresh, res.data.next_step) }
  }

  async function goNext() {
    const r = await submit(current)
    if (r?.next) {
      setCurrent(r.next)
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  function goBack() {
    const i = visibleSteps.indexOf(current)
    if (i > 0) setCurrent(visibleSteps[i - 1])
  }

  /** Re-quote with a coupon or gift card code: payment step without asking for terms yet. */
  async function applyCode(key: "coupon_code" | "gift_card_code", code: string) {
    const next = { ...values, [key]: code.trim() }
    setValues(next)
    setBusy(true)
    const res = await postStep("payment", { ...next, terms_accepted: next.terms_accepted ?? false })
    setBusy(false)
    if (res.ok) {
      if (res.data.totals) setTotals(res.data.totals)
      setErrors((prev) => ({ ...prev, [key]: "" }))
      if (key === "coupon_code") storeCoupon(code.trim() || null)
      return
    }
    // Terms not ticked yet is fine here; any error on the code itself is shown under the field.
    const own = res.errors[key]
    setErrors((prev) => ({ ...prev, [key]: own ?? (res.errors.terms_accepted ? "" : res.message) }))
    if (!own && res.errors.terms_accepted) setMessage("مبلغ نهایی با کد واردشده پس از پذیرش قوانین محاسبه می‌شود.")
  }

  async function checkGiftBalance(code: string) {
    if (!code.trim()) return
    const res = await call<{ balance_minor: number; status: string; expires_at?: string | null }>("/api/v1/public/gift-cards/balance", "POST", { code: code.trim() })
    if (!res.ok) {
      setGiftBalance(res.message || "کارت هدیه پیدا نشد.")
      return
    }
    const d = res.data
    setGiftBalance(
      d.status === "active"
        ? `موجودی کارت: ${formatAmountDigits(d.balance_minor, cur.thousandSeparator)}`
        : "این کارت هدیه فعال نیست یا موجودی ندارد.",
    )
  }

  const purchaseMode = totals?.purchase_type === "installment" ? "installment" : "cash"
  const gateways = useMemo(
    () => config.gateways.filter((g) => (purchaseMode === "installment" ? g.installment_enabled : g.cash_enabled !== false)).filter((g) => !(isGuest && g.id === "wallet")),
    [config.gateways, purchaseMode, isGuest],
  )
  const pickedGateway = str(values.payment_gateway)
  useEffect(() => {
    if (!pickedGateway && gateways.length) set("payment_gateway", gateways[0].id)
  }, [gateways, pickedGateway, set])

  async function placeOrder() {
    const r = await submit("payment")
    if (!r) return
    const provider = str(values.payment_gateway)
    if (!provider) {
      setErrors({ payment_gateway: "روش پرداخت را انتخاب کنید." })
      return
    }
    setBusy(true)
    setMessage("")
    try {
      const body = payloadValues(values)
      if (!isGuest && provider === "wallet") body.payment_method = "wallet"
      if (!isGuest && provider === "cheque") body.payment_method = "cheque"
      type Placed = { id: number; number?: string | null; status?: string; total_minor?: number; pay_token?: string; pay_intent_url?: string }
      const order = isGuest
        ? await call<Placed>("/api/v1/public/shop/checkout", "POST", { ...body, items: guestItems, guest_token: guestToken() })
        : await call<Placed>("/api/v1/checkout", "POST", body)
      if (!order.ok) {
        setErrors(order.errors)
        setMessage(order.message || "ثبت سفارش ناموفق بود.")
        return
      }
      const row = order.data
      const number = str(row.number) || str(row.id)
      if (values.coupon_code) storeCoupon(null)
      const finish = (offline: boolean, instructions?: string) => {
        if (isGuest) clearCart()
        notifyCart()
        setPlaced({ id: row.id, number, offline, instructions })
      }
      if (row.status === "paid" || row.total_minor === 0 || provider === "wallet") {
        finish(false)
        return
      }
      if (OFFLINE.has(provider)) {
        const res = isGuest
          ? await call<{ instructions?: string }>("/api/v1/public/shop/payments/offline", "POST", { order_id: row.id, provider: provider === "card_to_card" ? "c2c" : provider, pay_token: row.pay_token })
          : await call<{ instructions?: string }>("/api/v1/payments/offline", "POST", { order_id: row.id, provider: provider === "card_to_card" ? "c2c" : provider })
        if (!res.ok) {
          setMessage(res.message || "ثبت روش پرداخت ناموفق بود.")
          return
        }
        finish(true, str((res.data as { instructions?: string })?.instructions))
        return
      }
      const intent = isGuest
        ? await call<{ redirect_url?: string | null }>(row.pay_intent_url || `/api/v1/public/orders/${row.id}/pay/intent`, "POST", { provider, token: row.pay_token, mode: purchaseMode })
        : await call<{ redirect_url?: string | null }>("/api/v1/payments/intent", "POST", { order_id: row.id, provider, mode: purchaseMode })
      const url = intent.ok ? str(intent.data?.redirect_url) : ""
      if (url.startsWith("http") || url.startsWith("/")) {
        if (isGuest) clearCart()
        window.location.assign(url)
        return
      }
      setMessage((!intent.ok && intent.message) || "اتصال به درگاه پرداخت برقرار نشد. لطفاً روش دیگری را امتحان کنید.")
      setPlaced(null)
    } finally {
      setBusy(false)
    }
  }

  // ---------- render ----------

  if (flash === "success" || placed) {
    return (
      <div className={`wsc wsc--${skin}`}>
        <div className="wsc-card wsc-done">
          <div className="wsc-done__icon" aria-hidden="true">✓</div>
          <h1>سفارش شما ثبت شد</h1>
          {placed ? <p>شماره سفارش: <bdi>{faDigits(placed.number)}</bdi></p> : null}
          {placed?.offline ? <p>{placed.instructions || "پرداخت این سفارش پس از تأیید فروشگاه ثبت می‌شود."}</p> : null}
          <div className="wsc-actions">
            {!isGuest ? <Link className="wsc-btn" href="/account/orders">پیگیری سفارش</Link> : null}
            <Link className="wsc-btn wsc-btn--ghost" href="/shop">ادامه خرید</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!hasItems && !busy) {
    return (
      <div className={`wsc wsc--${skin}`}>
        <div className="wsc-card wsc-done">
          <h1>سبد خرید شما خالی است</h1>
          <Link className="wsc-btn" href="/shop">رفتن به فروشگاه</Link>
        </div>
      </div>
    )
  }

  const err = (key: string) => (errors[key] ? <span className="wsc-err" role="alert">{errors[key]}</span> : null)

  function renderAddressField(f: FlowField) {
    const v = str(values[f.key])
    const id = `wsc-${f.key}`
    const label = (
      <label htmlFor={id} className="wsc-label">
        {f.label}
        {f.required ? <span className="wsc-req" aria-hidden="true"> *</span> : null}
      </label>
    )
    const common = { id, name: f.key, required: f.required, "aria-invalid": Boolean(errors[f.key]) || undefined }
    let control: ReactNode
    if (f.key === "shipping_state_code") {
      control = (
        <select {...common} className="wsc-input" value={v} onChange={(e) => { set(f.key, e.target.value); set("shipping_city", "") }}>
          <option value="">انتخاب استان</option>
          {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
      )
    } else if (f.key === "shipping_city" && cities.length) {
      control = (
        <select {...common} className="wsc-input" value={v} onChange={(e) => set(f.key, e.target.value)}>
          <option value="">انتخاب شهر</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )
    } else if (f.type === "textarea") {
      control = <textarea {...common} className="wsc-input" rows={3} value={v} onChange={(e) => set(f.key, e.target.value)} />
    } else if (f.type === "map") {
      return null
    } else {
      const list = f.key === "shipping_district" ? districts[str(values.shipping_city)] ?? [] : []
      control = (
        <>
          <input
            {...common}
            className="wsc-input"
            type={f.type === "tel" ? "tel" : "text"}
            inputMode={/(phone|postcode|national_id)/.test(f.key) ? "numeric" : undefined}
            dir={/(phone|postcode|national_id)/.test(f.key) ? "ltr" : undefined}
            autoComplete={f.key === "customer_phone" ? "tel" : f.key === "recipient_name" ? "name" : f.key === "shipping_postcode" ? "postal-code" : undefined}
            list={list.length ? `${id}-list` : undefined}
            value={v}
            onChange={(e) => set(f.key, e.target.value)}
          />
          {list.length ? <datalist id={`${id}-list`}>{list.map((d) => <option key={d} value={d} />)}</datalist> : null}
        </>
      )
    }
    return (
      <div key={f.key} className={`wsc-field ${f.type === "textarea" ? "wsc-field--wide" : ""}`}>
        {label}
        {control}
        {err(f.key)}
      </div>
    )
  }

  function applySaved(a: Record<string, unknown>) {
    setValues((prev) => ({
      ...prev,
      recipient_name: str(a.name) || prev.recipient_name,
      customer_phone: str(a.phone) || prev.customer_phone,
      shipping_state_code: str(a.province_code) || prev.shipping_state_code,
      shipping_city: str(a.city) || prev.shipping_city,
      address_line: str(a.address) || prev.address_line,
      shipping_postcode: str(a.postcode) || prev.shipping_postcode,
      shipping_plaque: str(a.plaque) || prev.shipping_plaque,
      shipping_unit: str(a.unit) || prev.shipping_unit,
    }))
    setErrors({})
  }

  function renderAddress() {
    return (
      <>
        {saved.length ? (
          <div className="wsc-saved" role="list" aria-label="آدرس‌های ذخیره‌شده">
            {saved.map((a, i) => (
              <button key={i} type="button" role="listitem" className="wsc-chip" onClick={() => applySaved(a)}>
                <strong>{str(a.label) || str(a.name) || "آدرس من"}</strong>
                <span>{[str(a.city), str(a.address)].filter(Boolean).join("، ") || EMPTY}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="wsc-grid">{fieldsOf("address").map(renderAddressField)}</div>
      </>
    )
  }

  function renderDelivery() {
    const days = config.delivery_time.days
    const date = str(values.delivery_date)
    const day = days.find((d) => d.date === date)
    const dateField = fieldOf("delivery_time", "delivery_date")
    const slotField = fieldOf("delivery_time", "delivery_slot")
    return (
      <>
        <div className="wsc-label">{dateField?.label || "روز ارسال"}{dateField?.required ? <span className="wsc-req"> *</span> : null}</div>
        <div className="wsc-days" role="radiogroup" aria-label={dateField?.label || "روز ارسال"}>
          {days.map((d) => {
            const j = jalaliDay(d.date)
            return (
              <button key={d.date} type="button" role="radio" aria-checked={date === d.date} className={`wsc-day ${date === d.date ? "is-on" : ""}`} onClick={() => { set("delivery_date", d.date); set("delivery_slot", "") }}>
                <span>{j.weekday}</span>
                <strong>{j.day}</strong>
              </button>
            )
          })}
        </div>
        {err("delivery_date")}
        {slotField ? (
          <>
            <div className="wsc-label">{slotField.label}{slotField.required ? <span className="wsc-req"> *</span> : null}</div>
            {day ? (
              <div className="wsc-options" role="radiogroup" aria-label={slotField.label}>
                {day.slots.map((s) => (
                  <label key={s.id} className={`wsc-option ${str(values.delivery_slot) === s.id ? "is-on" : ""}`}>
                    <input type="radio" name="delivery_slot" checked={str(values.delivery_slot) === s.id} onChange={() => set("delivery_slot", s.id)} />
                    <span className="wsc-option__title">{faDigits(s.label)}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="wsc-muted">ابتدا روز ارسال را انتخاب کنید.</p>
            )}
            {err("delivery_slot")}
          </>
        ) : null}
      </>
    )
  }

  function renderShipping() {
    const rates = totals?.shipping_rates ?? []
    const picked = Number(values.shipping_instance_id || 0)
    const packField = fieldOf("shipping", "professional_packaging")
    return (
      <>
        {rates.length ? (
          <div className="wsc-options" role="radiogroup" aria-label={fieldOf("shipping", "shipping_instance_id")?.label || "روش ارسال"}>
            {rates.map((r) => (
              <label key={r.instance_id} className={`wsc-option ${picked === r.instance_id ? "is-on" : ""}`}>
                <input type="radio" name="shipping_instance_id" checked={picked === r.instance_id} onChange={() => set("shipping_instance_id", r.instance_id)} />
                <img src={shippingBrandSrc({ title: r.title, method_id: r.method_id })} alt="" width={36} height={36} loading="lazy" className="wsc-option__logo" />
                <span className="wsc-option__title">{r.title}</span>
                <span className="wsc-option__price">{r.cost_minor > 0 ? <BuilderPrice amount={r.cost_minor} /> : "رایگان"}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="wsc-muted">برای این نشانی روش ارسالی تعریف نشده است. نشانی را بررسی کنید یا با فروشگاه تماس بگیرید.</p>
        )}
        {err("shipping_instance_id")}
        {packField && pack?.enabled && pack.amount_minor > 0 ? (
          <label className="wsc-check">
            <input
              type="checkbox"
              disabled={pack.mandatory}
              checked={pack.mandatory || values.professional_packaging === true || (values.professional_packaging === undefined && Boolean(pack.default_selected))}
              onChange={(e) => set("professional_packaging", e.target.checked)}
            />
            <span>
              {pack.label || packField.label} (<BuilderPrice amount={pack.amount_minor} />)
              {pack.description ? <small className="wsc-muted"> {pack.description}</small> : null}
            </span>
          </label>
        ) : null}
      </>
    )
  }

  function gatewayButton(g: FlowGateway) {
    const on = pickedGateway === g.id
    const label = gatewayLabel(g.title_key || g.id, g.title)
    return (
      <label key={g.id} className={`wsc-option ${on ? "is-on" : ""}`}>
        <input type="radio" name="payment_gateway" checked={on} onChange={() => set("payment_gateway", g.id)} />
        <img src={gatewayBrandSrc(g.id, g.logo_url)} alt="" width={36} height={36} loading="lazy" className="wsc-option__logo" />
        <span className="wsc-option__title">{label}</span>
        {g.fee_percent && g.fee_percent > 0 && g.fee_payer === "customer" ? (
          <span className="wsc-option__price">کارمزد {faDigits(g.fee_percent)}٪</span>
        ) : null}
      </label>
    )
  }

  function renderPayment() {
    const layout = config.payment.gateway_layout
    const groups = new Map<string, FlowGateway[]>()
    for (const g of gateways) {
      const cat = OFFLINE.has(g.id) ? "offline" : g.id === "wallet" ? "wallet" : g.category || "other"
      groups.set(cat, [...(groups.get(cat) ?? []), g])
    }
    const termsField = fieldOf("payment", "terms")
    return (
      <>
        <div className="wsc-label">{fieldOf("payment", "payment_gateway")?.label || "درگاه پرداخت"}</div>
        {!gateways.length ? <p className="wsc-muted">روش پرداختی برای این خرید فعال نیست.</p> : null}
        {layout === "grouped" ? (
          [...groups.entries()].map(([cat, list]) => (
            <fieldset key={cat} className="wsc-group">
              <legend>{CATEGORY_LABELS[cat] ?? CATEGORY_LABELS.other}</legend>
              <div className="wsc-options">{list.map(gatewayButton)}</div>
            </fieldset>
          ))
        ) : (
          <div className={`wsc-options ${layout === "cards" ? "wsc-options--cards" : ""}`} role="radiogroup">{gateways.map(gatewayButton)}</div>
        )}
        {err("payment_gateway")}

        {config.payment.coupon_enabled ? (
          <CodeBox
            label={fieldOf("payment", "coupon_code")?.label || "کد تخفیف"}
            initial={str(values.coupon_code)}
            busy={busy}
            error={errors.coupon_code}
            note={totals?.coupon ? `${totals.coupon.auto ? "تخفیف خودکار" : "کد"} «${totals.coupon.code}» اعمال شد.` : ""}
            onApply={(code) => void applyCode("coupon_code", code)}
          />
        ) : null}
        {config.payment.gift_card_enabled ? (
          <CodeBox
            label={fieldOf("payment", "gift_card_code")?.label || "کارت هدیه"}
            initial={str(values.gift_card_code)}
            busy={busy}
            error={errors.gift_card_code}
            note={totals?.gift_card ? `کارت ${totals.gift_card.code} اعمال شد. مانده پس از خرید: ${formatAmountDigits(totals.gift_card.remaining_minor, cur.thousandSeparator)}` : giftBalance}
            onApply={(code) => void applyCode("gift_card_code", code)}
            onCheck={(code) => void checkGiftBalance(code)}
          />
        ) : null}

        {config.payment.summary_enabled ? <div className="wsc-inline-summary"><Summary totals={totals} /></div> : null}

        {termsField ? (
          <label className="wsc-check">
            <input type="checkbox" checked={values.terms_accepted === true} onChange={(e) => set("terms_accepted", e.target.checked)} />
            <span>
              {config.payment.terms_url ? <a href={config.payment.terms_url} target="_blank" rel="noreferrer">{termsField.label}</a> : termsField.label}
              {termsField.required ? <span className="wsc-req"> *</span> : null}
            </span>
          </label>
        ) : null}
        {err("terms_accepted")}
      </>
    )
  }

  const idx = visibleSteps.indexOf(current)
  const isLast = current === "payment" || idx === visibleSteps.length - 1

  return (
    <div className={`wsc wsc--${skin}`}>
      {flash === "failed" ? <p className="wsc-flash" role="alert">پرداخت ناموفق بود. می‌توانید دوباره تلاش کنید یا روش دیگری انتخاب کنید.</p> : null}
      {isGuest ? (
        <p className="wsc-guest">
          خرید به‌عنوان مهمان. <Link href={`/login?next=${encodeURIComponent("/checkout")}`}>ورود به حساب</Link>
        </p>
      ) : null}
      <ol className="wsc-steps" aria-label="مراحل خرید">
        <li className="is-done"><Link href="/cart">سبد خرید</Link></li>
        {visibleSteps.map((s, i) => {
          const reachable = done.includes(s) || i <= idx
          return (
            <li key={s} className={s === current ? "is-active" : done.includes(s) ? "is-done" : ""} aria-current={s === current ? "step" : undefined}>
              {reachable && s !== current ? (
                <button type="button" onClick={() => setCurrent(s)}>{faDigits(i + 1)}. {stepLabel(s)}</button>
              ) : (
                <span>{faDigits(i + 1)}. {stepLabel(s)}</span>
              )}
            </li>
          )
        })}
      </ol>

      <div className="wsc-layout">
        <section className="wsc-card wsc-main" aria-labelledby="wsc-step-title">
          <h1 id="wsc-step-title" className="wsc-title">{stepLabel(current)}</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (busy) return
              if (isLast) void placeOrder()
              else void goNext()
            }}
            noValidate
          >
            {current === "address" ? renderAddress() : null}
            {current === "delivery_time" ? renderDelivery() : null}
            {current === "shipping" ? renderShipping() : null}
            {current === "payment" ? renderPayment() : null}
            {message ? <p className="wsc-flash" role="alert">{message}</p> : null}
            <div className="wsc-actions">
              {idx > 0 ? <button type="button" className="wsc-btn wsc-btn--ghost" onClick={goBack} disabled={busy}>مرحله قبل</button> : <Link href="/cart" className="wsc-btn wsc-btn--ghost">بازگشت به سبد</Link>}
              <button type="submit" className="wsc-btn" disabled={busy || (isLast && !gateways.length)}>
                {busy ? "لطفاً صبر کنید…" : isLast ? (
                  <>ثبت سفارش و پرداخت{totals ? <> <BuilderPrice amount={totals.total_minor} /></> : null}</>
                ) : "ادامه"}
              </button>
            </div>
          </form>
        </section>
        <aside className="wsc-card wsc-side" aria-label="خلاصه سفارش">
          <h2 className="wsc-subtitle">خلاصه سفارش</h2>
          <SummaryLines totals={totals} fallback={isGuest ? local.map((l) => ({ key: cartLineKey(l), name: l.name, variant: l.variantName ?? null, image: l.image ?? null, qty: l.qty, price: l.price, regular: l.compare ?? 0 })) : (cart?.items ?? []).map((l) => { const p = serverLinePrice(cart, l); return { key: String(l.id), name: l.product.name, variant: l.variant?.name ?? null, image: l.variant?.image_url || l.product.image_url || null, qty: l.quantity, price: p.price, regular: p.regular } })} />
          <Summary totals={totals} />
        </aside>
      </div>
    </div>
  )
}

function CodeBox({ label, initial, busy, error, note, onApply, onCheck }: { label: string; initial: string; busy: boolean; error?: string; note?: string; onApply: (code: string) => void; onCheck?: (code: string) => void }) {
  const [code, setCode] = useState(initial)
  useEffect(() => setCode(initial), [initial])
  return (
    <div className="wsc-code">
      <span className="wsc-label">{label}</span>
      <div className="wsc-code__row">
        <input className="wsc-input" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} aria-label={label} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onApply(code) } }} />
        <button type="button" className="wsc-btn wsc-btn--sm" disabled={busy || !code.trim()} onClick={() => onApply(code)}>اعمال</button>
        {onCheck ? <button type="button" className="wsc-btn wsc-btn--sm wsc-btn--ghost" disabled={busy || !code.trim()} onClick={() => onCheck(code)}>بررسی موجودی</button> : null}
        {initial ? <button type="button" className="wsc-link" disabled={busy} onClick={() => { setCode(""); onApply("") }}>حذف</button> : null}
      </div>
      {error ? <span className="wsc-err" role="alert">{error}</span> : note ? <span className="wsc-note">{note}</span> : null}
    </div>
  )
}

type FallbackLine = { key: string; name: string; variant: string | null; image: string | null; qty: number; price: number; regular: number }

function SummaryLines({ totals, fallback }: { totals: Totals | null; fallback: FallbackLine[] }) {
  const rows: FallbackLine[] = totals
    ? totals.lines.map((l) => ({ key: `${l.product_id}-${l.product_variant_id ?? 0}-${l.line_id ?? ""}`, name: l.name, variant: l.variant_name, image: l.image_url, qty: l.quantity, price: l.unit_price_minor, regular: l.on_sale ? l.regular_price_minor : 0 }))
    : fallback
  return (
    <ul className="wsc-lines">
      {rows.map((l) => (
        <li key={l.key} className="wsc-line">
          {l.image ? <img src={l.image} alt="" width={48} height={48} loading="lazy" className="wsc-line__img" /> : <span className="wsc-line__img" aria-hidden="true" />}
          <span className="wsc-line__body">
            <span className="wsc-line__name">{l.name}</span>
            {l.variant ? <span className="wsc-muted">{l.variant}</span> : null}
            <span className="wsc-muted">{faDigits(l.qty)} عدد</span>
          </span>
          <span className="wsc-line__price"><BuilderPrice amount={l.price * l.qty} original={l.regular > l.price ? l.regular * l.qty : null} /></span>
        </li>
      ))}
    </ul>
  )
}

function Row({ label, children, tone }: { label: ReactNode; children: ReactNode; tone?: "off" | "total" }) {
  return (
    <div className={`wsc-row ${tone ? `wsc-row--${tone}` : ""}`}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  )
}

function Summary({ totals }: { totals: Totals | null }) {
  if (!totals) return <p className="wsc-muted">مبلغ نهایی پس از ثبت نشانی محاسبه می‌شود.</p>
  const minus = (n: number) => <span className="wsc-minus">− <BuilderPrice amount={n} /></span>
  return (
    <div className="wsc-summary">
      <Row label={`قیمت کالاها (${faDigits(totals.items_count)})`}>
        <BuilderPrice amount={totals.subtotal_minor} original={totals.regular_subtotal_minor > totals.subtotal_minor ? totals.regular_subtotal_minor : null} />
      </Row>
      {totals.sale_savings_minor > 0 ? <Row label="سود شما از تخفیف کالاها" tone="off">{minus(totals.sale_savings_minor)}</Row> : null}
      {totals.coupon && totals.discount_minor > 0 ? <Row label={`تخفیف (${totals.coupon.code})`} tone="off">{minus(totals.discount_minor)}</Row> : null}
      <Row label={totals.shipping ? `ارسال (${totals.shipping.title})` : "هزینه ارسال"}>
        {totals.shipping ? (totals.shipping_minor > 0 ? <BuilderPrice amount={totals.shipping_minor} /> : "رایگان") : EMPTY}
      </Row>
      {totals.packaging_minor > 0 ? <Row label="بسته‌بندی ویژه"><BuilderPrice amount={totals.packaging_minor} /></Row> : null}
      {totals.tax_added_minor > 0 ? <Row label="مالیات"><BuilderPrice amount={totals.tax_added_minor} /></Row> : null}
      {totals.gift_card_minor > 0 ? <Row label="کارت هدیه" tone="off">{minus(totals.gift_card_minor)}</Row> : null}
      <Row label="مبلغ قابل پرداخت" tone="total">{totals.total_minor > 0 ? <BuilderPrice amount={totals.total_minor} /> : "رایگان"}</Row>
    </div>
  )
}

/**
 * Drop-in checkout page: stepped flow when the store uses it (default), the theme's own
 * single-page checkout otherwise, and a login prompt when guests cannot buy.
 */
export function SteppedCheckoutGate({ skin, legacy, loading }: { skin: SteppedSkin; legacy: ReactNode; loading?: ReactNode }) {
  const { auth } = useServerCart()
  const flow = useCheckoutFlow(auth)
  if (auth === "loading" || flow.status === "loading") {
    return <>{loading ?? <div className={`wsc wsc--${skin}`}><div className="wsc-card wsc-muted">در حال بارگذاری…</div></div>}</>
  }
  if (flow.status === "guest_off" || flow.status === "error" || !flow.config || flow.config.stepped === false) return <>{legacy}</>
  return <SteppedCheckout skin={skin} config={flow.config} auth={auth} />
}
