"use client"

import { Moon, Search, ShoppingBag, Sun, UserRound } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"

import { ApiError, api } from "@/lib/api"
import { formatDate, formatNumber, normalizeUiLocale, toLatinDigits, toLocaleDigits } from "@/lib/locale"
import { useThemeSettings } from "@/providers/AppProviders"

import { cartCount, cartSnapshot, clearCart, setQty, subscribeCart } from "../cart"
import { toneClass, mapApiProduct, type ShopProduct } from "../catalog"
import { parseLinks, propStr } from "../props"
import type { WidgetNode } from "../types"
import { addShopItem, setServerQty, syncGuestCart, useServerCart } from "./actions"
import { ProductPriceHistory } from "./ishop-extras"
import {
  IshopAccountShell,
  IshopBreadcrumbs,
  IshopMegaMenuPanel,
  IshopMobileNav,
  IshopTopBar,
  MobileNavToggle,
  StockAlertForm,
} from "./ishop-port"
import { quietApi } from "./session"
import { useCatalog } from "./use-catalog"

const NAV = [
  { label: "خانه", href: "/" },
  { label: "فروشگاه", href: "/shop" },
  { label: "تازه‌ها", href: "/shop?sort=new" },
  { label: "مجله", href: "/blog" },
  { label: "درباره", href: "/pages/about" },
]

function useMoney() {
  const t = useTranslations("builder")
  const locale = useLocale()
  return (amount: number) =>
    `${formatNumber(Math.max(0, Math.round(amount)), normalizeUiLocale(locale))} ${t("currency_toman")}`
}

function digits(value: number, locale: string) {
  return formatNumber(value, normalizeUiLocale(locale))
}

export function StoreProductCard({ product }: { product: ShopProduct }) {
  const money = useMoney()
  const tCart = useTranslations("cart")
  const t = useTranslations("storefront")
  const locale = useLocale()
  const [liked, setLiked] = useState(false)
  const [note, setNote] = useState("")
  const off =
    product.compare && product.compare > product.price
      ? Math.round((1 - product.price / product.compare) * 100)
      : 0
  return (
    <article className="sf-card flex flex-col p-3 transition hover:-translate-y-0.5">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
        {product.image ? (
          <img src={product.image} alt={product.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className={`grid h-full w-full place-items-center bg-gradient-to-br ${toneClass(product.tone)}`}>
            <span className="text-xs font-bold text-foreground/70">{product.brand}</span>
          </div>
        )}
        <button
          type="button"
          aria-label={t("favorite")}
          className="absolute end-2 top-2 grid size-8 place-items-center rounded-full bg-card text-foreground"
          onClick={() => {
            setLiked((value) => !value)
            if (product.id) {
              void quietApi(`/api/v1/account/favorites/${product.id}`, { method: "POST" })
            }
          }}
        >
          <span className={liked ? "text-destructive" : ""}>♥</span>
        </button>
        {off > 0 ? (
          <span className="sf-sale absolute start-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold">
            {digits(off, locale)}٪
          </span>
        ) : null}
        {!product.inStock ? (
          <span className="absolute inset-x-2 bottom-2 rounded-full bg-foreground/80 px-2 py-1 text-center text-[11px] font-bold text-background">
            {t("stock_out")}
          </span>
        ) : null}
        {product.isNew ? (
          <span className="absolute bottom-2 start-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">جدید</span>
        ) : null}
      </div>
      <h3 className="mt-3 line-clamp-2 min-h-10 text-sm font-bold">
        <Link href={`/product/${product.slug}`}>{product.name}</Link>
      </h3>
      <p className="mt-1 text-xs text-primary">{product.brand}</p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <div>
          {product.compare ? <div className="text-[11px] text-muted-foreground line-through">{money(product.compare)}</div> : null}
          <div className="text-sm font-bold">{money(product.price)}</div>
        </div>
        <button
          type="button"
          disabled={!product.inStock}
          className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          onClick={() => {
            void addShopItem(product).then((result) => setNote(result === "error" ? t("add_failed") : ""))
          }}
        >
          {tCart("add_to_cart")}
        </button>
      </div>
      {note ? <p className="mt-2 text-xs text-destructive">{note}</p> : null}
    </article>
  )
}

export function StoreFilters({ editing }: { editing: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const catalog = useCatalog(12)
  const t = useTranslations("storefront")
  const category = params.get("category") ?? ""
  const brand = params.get("brand") ?? ""
  const inStock = params.get("in_stock") === "1"
  const onSale = params.get("on_sale") === "1"

  function setParam(key: string, value: string) {
    if (editing) return
    const next = new URLSearchParams(params.toString())
    if (!value || next.get(key) === value) next.delete(key)
    else next.set(key, value)
    next.delete("page")
    router.replace(`?${next.toString()}`, { scroll: false })
  }

  return (
    <aside className="sf-card p-4">
      <div className="mb-3 text-sm font-bold">{t("filters")}</div>
      <details open className="border-b border-border py-2">
        <summary className="cursor-pointer text-sm font-semibold">{t("category")}</summary>
        <div className="mt-2 grid gap-1">
          {catalog.categories.map((item) => (
            <button
              key={item.slug}
              type="button"
              onClick={() => setParam("category", item.slug)}
              className={`rounded-xl px-2 py-1 text-start text-sm ${category === item.slug ? "bg-muted font-bold text-primary" : ""}`}
            >
              {item.name}
            </button>
          ))}
        </div>
      </details>
      <details open className="border-b border-border py-2">
        <summary className="cursor-pointer text-sm font-semibold">{t("brand")}</summary>
        <div className="mt-2 grid gap-1">
          {catalog.brands.map((item) => (
            <label key={item.slug} className="flex items-center justify-between gap-2 text-sm">
              <span>{item.name}</span>
              <input type="checkbox" checked={brand === item.slug} onChange={() => setParam("brand", item.slug)} />
            </label>
          ))}
        </div>
      </details>
      <label className="mt-3 flex items-center justify-between text-sm">
        <span>{t("in_stock")}</span>
        <input type="checkbox" checked={inStock} onChange={() => setParam("in_stock", inStock ? "" : "1")} />
      </label>
      <label className="mt-2 flex items-center justify-between text-sm">
        <span>{t("on_sale")}</span>
        <input type="checkbox" checked={onSale} onChange={() => setParam("on_sale", onSale ? "" : "1")} />
      </label>
    </aside>
  )
}

export function StorefrontProduct({ slug, editing }: { slug?: string; editing: boolean }) {
  const money = useMoney()
  const t = useTranslations("storefront")
  const tCart = useTranslations("cart")
  const locale = useLocale()
  const catalog = useCatalog(8)
  const [remote, setRemote] = useState<ShopProduct | null | undefined>(undefined)
  const [qty, setQuantity] = useState(1)
  const [image, setImage] = useState(0)
  const [variantId, setVariantId] = useState<number | null>(null)
  const [tab, setTab] = useState("desc")
  const [note, setNote] = useState("")
  const { auth } = useServerCart()

  useEffect(() => {
    if (!slug) {
      setRemote(null)
      return
    }
    let cancel = false
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    fetch(`${base}/api/v1/public/catalog/items/${encodeURIComponent(slug)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: Record<string, unknown> } | null) => {
        if (cancel) return
        if (!json?.data || typeof json.data !== "object") {
          setRemote(null)
          return
        }
        setRemote(mapApiProduct(json.data, 0))
      })
      .catch(() => {
        if (!cancel) setRemote(null)
      })
    return () => {
      cancel = true
    }
  }, [slug])

  const fallback = catalog.products.find((item) => item.slug === slug) ?? (catalog.live ? null : catalog.products[0] ?? null)
  const product = remote === undefined ? fallback : (remote ?? fallback)
  const variant = product?.variants.find((item) => item.id === variantId) ?? null
  const gallery = product?.images.length ? product.images : product?.image ? [product.image] : []
  const activeImage = variant?.image || gallery[image] || product?.image
  const blocked = !product?.inStock || (variant ? !variant.inStock : false)
  const priceGap = variant && variant.price > 0 && variant.price !== product?.price

  if (!product) {
    return <p className="sf-card p-8 text-center text-sm">{t("empty_none")}</p>
  }

  function add() {
    if (editing || blocked) return
    void addShopItem(product as ShopProduct, qty).then((result) => setNote(result === "error" ? t("add_failed") : t("added")))
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <IshopBreadcrumbs
        items={[
          { label: t("categories"), href: "/shop" },
          { label: product.category, href: product.categorySlug ? `/shop?category=${product.categorySlug}` : "/shop" },
          { label: product.name },
        ]}
      />
    <div className="sf-pdp grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <div className="aspect-square overflow-hidden rounded-[28px] border border-border bg-card">
          {activeImage ? (
            <img src={activeImage} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className={`grid h-full w-full place-items-center bg-gradient-to-br ${toneClass(product.tone)}`}>
              <span className="font-bold text-foreground/70">{product.brand}</span>
            </div>
          )}
        </div>
        {gallery.length > 1 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {gallery.map((src, index) => (
              <button
                key={src + index}
                type="button"
                onClick={() => setImage(index)}
                className={`h-16 w-16 overflow-hidden rounded-2xl border ${index === image ? "border-primary" : "border-border"}`}
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="lg:col-span-7">
        <p className="text-xs font-semibold text-primary">{product.brand}</p>
        <h1 className="mt-1 text-2xl font-bold md:text-3xl">{product.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{product.inStock ? t("stock_in") : t("stock_out")}</p>
        {!product.inStock ? <StockAlertForm slug={product.slug} /> : null}
        <div className="mt-4 flex items-end gap-3">
          {product.compare ? <div className="text-sm text-muted-foreground line-through">{money(product.compare)}</div> : null}
          <div className="text-2xl font-bold">{money(product.price)}</div>
        </div>
        {product.cashPrice && product.cashPrice !== product.price ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("cash_hint", { amount: money(product.cashPrice) })}</p>
        ) : null}
        {product.variants.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {product.variants.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setVariantId(item.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${variantId === item.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {item.name}
                {!item.inStock ? ` (${t("stock_out")})` : ""}
              </button>
            ))}
          </div>
        ) : null}
        {priceGap ? <p className="mt-2 text-xs text-muted-foreground">{t("variant_price_note")}</p> : null}
        {product.installments.length ? (
          <div className="sf-muted mt-4 rounded-3xl p-4">
            <div className="text-sm font-bold">{t("installment_title")}</div>
            <ul className="mt-2 grid gap-1 text-sm">
              {product.installments.map((plan) => (
                <li key={plan.months}>{t("installment_row", { months: digits(plan.months, locale), amount: money(plan.monthly) })}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-4 hidden items-center gap-3 md:flex">
          <QtyControl qty={qty} onChange={setQuantity} />
          <button type="button" disabled={editing || blocked} onClick={add} className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {tCart("add_to_cart")}
          </button>
          {product.id && auth === "auth" ? (
            <button
              type="button"
              className="rounded-full border border-border px-4 py-2.5 text-sm font-semibold"
              onClick={() => void quietApi(`/api/v1/cart/items/${product.id}/save-for-later`, { method: "POST" })}
            >
              {t("save_for_later")}
            </button>
          ) : null}
        </div>
        {note ? <p className="mt-2 text-xs text-muted-foreground">{note}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {product.id ? (
            <button
              type="button"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold"
              onClick={() => void quietApi(`/api/v1/public/compare/products/${product.id}`, { method: "POST" })}
            >
              {t("compare_add")}
            </button>
          ) : null}
          <Link href="/compare" className="rounded-full bg-muted px-4 py-2 text-xs font-semibold">
            {t("compare_title")}
          </Link>
        </div>
        <ProductPriceHistory slug={product.slug} />
        <div className="mt-6 flex gap-2 border-b border-border">
          {(
            [
              ["desc", t("tab_desc")],
              ["spec", t("tab_spec")],
              ["faq", t("tab_faq")],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`px-3 py-2 text-sm font-semibold ${tab === id ? "border-b-2 border-primary" : "text-muted-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="py-4 text-sm leading-7 text-foreground/80">
          {tab === "spec" ? (
            product.variants.length ? (
              <ul className="grid gap-2">
                {product.variants.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3 border-b border-border py-1">
                    <span>{item.name}</span>
                    <span>{item.inStock ? t("stock_in") : t("stock_out")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              t("spec_empty")
            )
          ) : tab === "faq" ? (
            product.faqs?.length ? (
              <ul className="grid gap-3">
                {product.faqs.map((row) => (
                  <li key={row.question} className="rounded-2xl bg-muted p-3">
                    <div className="font-bold">{row.question}</div>
                    <div className="mt-1 text-muted-foreground">{row.answer}</div>
                  </li>
                ))}
              </ul>
            ) : (
              t("faq_empty")
            )
          ) : (
            product.description || t("empty_none")
          )}
        </div>
      </div>
      <div className="sf-sticky-cta md:hidden">
        <div>
          <div className="text-xs text-muted-foreground">{product.inStock ? t("stock_in") : t("stock_out")}</div>
          <div className="font-bold">{money(product.price)}</div>
        </div>
        <button type="button" disabled={editing || blocked} onClick={add} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {tCart("add_to_cart")}
        </button>
      </div>
    </div>
    </div>
  )
}

function QtyControl({ qty, onChange }: { qty: number; onChange: (qty: number) => void }) {
  const t = useTranslations("storefront")
  const locale = useLocale()
  return (
    <div className="flex items-center rounded-full border border-border">
      <button type="button" className="px-3 py-2" aria-label={t("qty_dec")} onClick={() => onChange(Math.max(1, qty - 1))}>
        −
      </button>
      <span className="w-8 text-center text-sm font-bold">{digits(qty, locale)}</span>
      <button type="button" className="px-3 py-2" aria-label={t("qty_inc")} onClick={() => onChange(Math.min(99, qty + 1))}>
        +
      </button>
    </div>
  )
}

export function StorefrontCart() {
  const money = useMoney()
  const t = useTranslations("storefront")
  const tCart = useTranslations("cart")
  const locale = useLocale()
  const local = useSyncExternalStore(subscribeCart, cartSnapshot, () => [])
  const { cart, auth } = useServerCart()
  const lines = cart?.items ?? []
  const pricing = cart?.pricing
  const unitFor = (lineId: number, fallback: number) => pricing?.lines?.find((row) => row.id === lineId)?.unit_price_minor ?? fallback

  if (auth === "loading") {
    return <div className="sf-card p-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
  }

  if (auth === "auth") {
    if (!lines.length) {
      return (
        <div className="sf-card p-8 text-center">
          <h2 className="text-xl font-bold">{tCart("empty")}</h2>
          <Link href="/shop" className="mt-4 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">
            {t("continue_shop")}
          </Link>
        </div>
      )
    }
    const total = pricing?.subtotal_minor ?? lines.reduce((sum, line) => sum + line.product.price_minor * line.quantity, 0)
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="grid gap-3">
          {lines.map((line) => (
            <div key={line.id} className="sf-card flex items-center gap-3 p-3">
              <div className="size-20 overflow-hidden rounded-2xl bg-muted">
                {line.product.cover_image_url || line.product.image_url ? (
                  <img src={line.product.cover_image_url || line.product.image_url || ""} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="flex-1">
                <div className="font-bold">{line.product.name}</div>
                <div className="text-sm">{money(unitFor(line.id, line.product.price_minor))}</div>
              </div>
              <input
                className="sf-field h-10 w-16 text-center"
                type="number"
                min={0}
                value={line.quantity}
                aria-label={tCart("quantity")}
                onChange={(event) => void setServerQty(line.product.id, Number(event.target.value))}
              />
            </div>
          ))}
        </div>
        <aside className="sf-card h-fit bg-primary p-5 text-primary-foreground">
          <div className="text-sm opacity-80">{t("subtotal")}</div>
          <div className="mt-1 text-2xl font-bold">{money(total)}</div>
          {pricing?.purchase_type === "installment" && pricing.installment_monthly_minor ? (
            <p className="mt-2 text-xs opacity-90">{t("installment_row", { months: digits(pricing.installment_months ?? 0, locale), amount: money(pricing.installment_monthly_minor) })}</p>
          ) : null}
          <Link href="/checkout" className="mt-4 block rounded-full bg-card py-2.5 text-center text-sm font-bold text-foreground">
            {t("checkout")}
          </Link>
        </aside>
      </div>
    )
  }

  const total = local.reduce((sum, line) => sum + line.price * line.qty, 0)
  if (!local.length) {
    return (
      <div className="sf-card p-8 text-center">
        <h2 className="text-xl font-bold">{tCart("empty")}</h2>
        <Link href="/shop" className="mt-4 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">
          {t("continue_shop")}
        </Link>
      </div>
    )
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="grid gap-3">
        <p className="text-sm text-muted-foreground">{t("guest_note")}</p>
        {local.map((line) => (
          <div key={line.slug} className="sf-card flex items-center gap-3 p-3">
            <div className="size-20 overflow-hidden rounded-2xl bg-muted">
              {line.image ? <img src={line.image} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <div className="flex-1">
              <div className="font-bold">{line.name}</div>
              <div className="text-sm">{money(line.price)}</div>
            </div>
            <input
              className="sf-field h-10 w-16 text-center"
              type="number"
              min={0}
              value={line.qty}
              aria-label={tCart("quantity")}
              onChange={(event) => setQty(line.slug, Number(event.target.value))}
            />
          </div>
        ))}
      </div>
      <aside className="sf-card h-fit bg-primary p-5 text-primary-foreground">
        <div className="text-sm opacity-80">{t("subtotal")}</div>
        <div className="mt-1 text-2xl font-bold">{money(total)}</div>
        <Link href={`/login?next=${encodeURIComponent("/checkout")}`} className="mt-4 block rounded-full bg-card py-2.5 text-center text-sm font-bold text-foreground">
          {t("login_checkout")}
        </Link>
        <button type="button" className="mt-2 w-full text-xs opacity-80" onClick={() => clearCart()}>
          {t("clear_cart")}
        </button>
      </aside>
    </div>
  )
}

type Gateway = {
  id: "zarinpal" | "digipay" | "snapppay" | "torobpay" | "bale_pay" | "basalam_pay"
  title?: string
  cash_enabled?: boolean
  installment_enabled?: boolean
  fee_percent?: number
  fee_payer?: string
  quote?: { fee_percent: number; fee_payer: string; fee_minor: number; base_minor: number; charge_minor: number }
}

type Rate = { instance_id: number; title: string; cost_minor: number }


function labelForGateway(id: string, tCheckout: (key: "pay_zarinpal" | "pay_digipay" | "pay_snapppay" | "pay_torobpay") => string, t: (key: "pay_bale" | "pay_basalam") => string) {
  if (id === "zarinpal") return tCheckout("pay_zarinpal")
  if (id === "digipay") return tCheckout("pay_digipay")
  if (id === "snapppay") return tCheckout("pay_snapppay")
  if (id === "torobpay") return tCheckout("pay_torobpay")
  if (id === "bale_pay") return t("pay_bale")
  if (id === "basalam_pay") return t("pay_basalam")
  return tCheckout("pay_zarinpal")
}

export function StorefrontCheckout() {
  const t = useTranslations("storefront")
  const tCheckout = useTranslations("checkout")
  const money = useMoney()
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
  const flash = params.get("payment")

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
    () =>
      gateways.filter((gateway) => (mode === "installment" ? gateway.installment_enabled : gateway.cash_enabled)),
    [gateways, mode],
  )

  if (auth !== "auth") {
    if (auth === "loading") {
      return <div className="sf-card p-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
    }
    return (
      <div className="sf-card p-8 text-center">
        <p className="text-sm">{t("guest_note")}</p>
        <Link href={`/login?next=${encodeURIComponent("/checkout")}`} className="mt-4 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">
          {t("login_checkout")}
        </Link>
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
          cart_subtotal_minor: cart?.pricing?.subtotal_minor ?? 0,
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
          coupon_code: coupon || null,
          shipping_instance_id: rateId,
          shipping_state_code: stateCode || null,
          shipping_postcode: postcode || null,
        },
      })
      setOrderId(order.id)
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
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <form
        className="sf-card grid gap-3 p-5 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          void placeOrder()
        }}
      >
        <h2 className="text-xl font-bold md:col-span-2">{tCheckout("title")}</h2>
        {flash === "success" ? <p className="text-sm text-primary md:col-span-2">{tCheckout("payment_ok")}</p> : null}
        {flash === "failed" ? <p className="text-sm text-destructive md:col-span-2">{tCheckout("payment_failed")}</p> : null}
        <label className="grid gap-1 text-sm">
          <span>{t("shipping_state")}</span>
          <select className="sf-field" value={stateCode} onChange={(event) => setStateCode(event.target.value)}>
            <option value="">{t("choose")}</option>
            {states.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>{t("shipping_city")}</span>
          <input className="sf-field" value={city} onChange={(event) => setCity(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span>{t("shipping_postcode")}</span>
          <input className="sf-field" dir="ltr" value={postcode} onChange={(event) => setPostcode(toLatinDigits(event.target.value).replace(/\D/g, ""))} />
        </label>
        <label className="grid gap-1 text-sm">
          <span>{tCheckout("customer_phone")}</span>
          <input required className="sf-field" dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span>{tCheckout("shipping_address")}</span>
          <textarea required className="sf-field min-h-24 py-2" value={address} onChange={(event) => setAddress(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span>{t("coupon")}</span>
          <input className="sf-field" value={coupon} onChange={(event) => setCoupon(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span>{tCheckout("customer_note")}</span>
          <input className="sf-field" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <div className="md:col-span-2">
          <button type="button" className="rounded-full border border-border px-4 py-2 text-sm font-semibold" onClick={() => void quoteShipping()}>
            {t("shipping_quote")}
          </button>
          <div className="mt-3 grid gap-2">
            {rates.map((rate) => (
              <label key={rate.instance_id} className="sf-muted flex items-center justify-between rounded-2xl px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <input type="radio" name="ship" checked={rateId === rate.instance_id} onChange={() => setRateId(rate.instance_id)} />
                  {rate.title}
                </span>
                <span>{money(rate.cost_minor)}</span>
              </label>
            ))}
          </div>
        </div>
        {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}
        <button type="submit" disabled={busy || auth !== "auth"} className="h-11 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50 md:col-span-2">
          {tCheckout("place_order")}
        </button>
        {orderId ? (
          <p className="text-sm text-muted-foreground md:col-span-2">
            {tCheckout("order_created")} #{digits(orderId, locale)}
          </p>
        ) : null}
      </form>
      <aside className="sf-card h-fit p-5">
        <h3 className="font-bold">{t("pay_title")}</h3>
        <div className="mt-3 flex gap-2">
          <button type="button" className={`rounded-full px-3 py-1 text-xs font-semibold ${mode === "cash" ? "bg-primary text-primary-foreground" : "bg-muted"}`} onClick={() => setMode("cash")}>
            {tCheckout("mode_cash")}
          </button>
          <button type="button" className={`rounded-full px-3 py-1 text-xs font-semibold ${mode === "installment" ? "bg-primary text-primary-foreground" : "bg-muted"}`} onClick={() => setMode("installment")}>
            {tCheckout("mode_installment")}
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {allowed.length === 0 ? <p className="text-sm text-muted-foreground">{tCheckout("no_gateway_mode")}</p> : null}
          {allowed.map((gateway) => (
            <button
              key={gateway.id}
              type="button"
              disabled={!orderId}
              onClick={() => void pay(gateway.id)}
              className="rounded-2xl border border-border px-3 py-3 text-start text-sm font-semibold disabled:opacity-50"
            >
              <span>{gateway.title || labelForGateway(gateway.id, tCheckout, t)}</span>
              {gateway.quote && gateway.quote.fee_percent > 0 ? (
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {tCheckout("fee_line", { percent: toLocaleDigits(gateway.quote.fee_percent, locale) })}
                  {" · "}
                  {money(gateway.quote.charge_minor)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </aside>
    </div>
  )
}

type AccountOrder = {
  id: number
  number?: string | null
  status: string
  total_minor?: number
  created_at?: string
}

export function StorefrontAccount() {
  const t = useTranslations("storefront")
  const tStatus = useTranslations("enums.order_status")
  const money = useMoney()
  const locale = useLocale()
  const { auth } = useServerCart()
  const [orders, setOrders] = useState<AccountOrder[] | null>(null)

  useEffect(() => {
    if (auth !== "auth") return
    void quietApi<AccountOrder[]>("/api/v1/account/orders").then((res) => {
      if (res.ok && Array.isArray(res.data)) setOrders(res.data)
      else setOrders([])
    })
  }, [auth])

  if (auth !== "auth") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Link href={`/login?next=${encodeURIComponent("/account")}`} className="sf-card p-5">
          <div className="font-bold">{t("account_login")}</div>
          <p className="mt-2 text-sm text-muted-foreground">{t("account_login_text")}</p>
        </Link>
        <Link href="/account/change-password" className="sf-card p-5">
          <div className="font-bold">{t("account_password")}</div>
          <p className="mt-2 text-sm text-muted-foreground">{t("account_password_text")}</p>
        </Link>
      </div>
    )
  }

  return (
    <IshopAccountShell>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{t("account_orders")}</h2>
          <Link href="/dashboard/account/orders" className="text-sm font-semibold text-primary">
            {t("account_portal")}
          </Link>
        </div>
        {!orders?.length ? <p className="sf-card p-6 text-sm text-muted-foreground">{orders ? t("account_empty") : t("loading")}</p> : null}
        <div className="grid gap-3">
          {(orders ?? []).map((order) => {
            const key = order.status.replace(/-/g, "_")
            const label = tStatus.has(key) ? tStatus(key) : order.status
            return (
              <Link key={order.id} href={`/dashboard/account/orders/${order.id}`} className="sf-card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-bold">{order.number || `#${digits(order.id, locale)}`}</div>
                  <div className="text-xs text-muted-foreground">{order.created_at ? formatDate(order.created_at, normalizeUiLocale(locale)) : t("empty_none")}</div>
                </div>
                <div className="text-sm">{label}</div>
                {order.total_minor != null ? <div className="font-bold">{money(order.total_minor)}</div> : null}
              </Link>
            )
          })}
        </div>
      </div>
    </IshopAccountShell>
  )
}

export function StorefrontHeader({
  widget,
  siteName,
  logoUrl,
}: {
  widget: WidgetNode
  siteName?: string
  logoUrl?: string | null
}) {
  const t = useTranslations("storefront")
  const locale = useLocale()
  const count = useSyncExternalStore(subscribeCart, cartCount, () => 0)
  const { cart, auth } = useServerCart()
  const serverCount = (cart?.items ?? []).reduce((sum, line) => sum + line.quantity, 0)
  const shown = auth === "auth" ? serverCount : count
  const { resolvedMode, setMode } = useThemeSettings()
  const [open, setOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [query, setQuery] = useState("")
  const router = useRouter()
  const catalog = useCatalog(8)
  const links = parseLinks(widget.props.links, NAV)
  const name = siteName || propStr(widget.props, "mark", "ویبینو")
  const dark = resolvedMode === "dark"

  return (
    <>
      <IshopTopBar />
      <IshopMobileNav open={mobileNav} onClose={() => setMobileNav(false)} links={links} />
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <MobileNavToggle onOpen={() => setMobileNav(true)} />
        <Link href="/" className="flex items-center gap-2">
          {logoUrl ? <img src={logoUrl} alt={name} className="h-11 w-auto" /> : <span className="grid size-11 place-items-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">{name.slice(0, 1)}</span>}
          <span className="hidden text-lg font-bold sm:inline">{name}</span>
        </Link>
        <form
          className="sf-muted flex h-11 flex-1 items-center gap-2 rounded-full px-4"
          onSubmit={(event) => {
            event.preventDefault()
            router.push(query.trim() ? `/shop?q=${encodeURIComponent(query.trim())}` : "/shop")
          }}
        >
          <Search className="size-4 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search_placeholder")} className="w-full bg-transparent text-sm outline-none" />
        </form>
        <button
          type="button"
          className="grid size-10 place-items-center rounded-full bg-muted"
          aria-label={dark ? t("theme_to_light") : t("theme_to_dark")}
          onClick={() => setMode(dark ? "light" : "dark")}
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <Link href="/account" className="hidden items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-semibold sm:inline-flex">
          <UserRound className="size-4" />
          {t("account_login")}
        </Link>
        <Link href="/compare" className="hidden rounded-full bg-muted px-3 py-2 text-xs font-semibold sm:inline-flex">
          {t("compare_add")}
        </Link>
        <Link href="/cart" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          <ShoppingBag className="size-4" />
          {t("cart")}
          <span className="grid size-5 place-items-center rounded-full bg-card text-[11px] text-foreground">{digits(shown, locale)}</span>
        </Link>
      </div>
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 pb-3">
        <button type="button" className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm font-bold" onClick={() => setOpen((value) => !value)}>
          {t("categories")}
        </button>
        <nav className="hidden flex-1 flex-wrap items-center justify-end gap-1 md:flex">
          {links.map((link) => (
            <Link key={link.href + link.label} href={link.href} className="rounded-full px-3 py-1.5 text-sm hover:bg-muted">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      {open ? (
        <div className="border-t border-border bg-card pb-4">
          <div className="mx-auto hidden max-w-6xl px-4 pt-3 md:block">
            <IshopMegaMenuPanel columnsText="" />
          </div>
          <div className="mx-auto grid max-w-6xl gap-2 px-4 py-3 md:hidden sm:grid-cols-3">
            {catalog.categories.map((item) => (
              <Link key={item.slug} href={`/shop?category=${item.slug}`} className="rounded-2xl bg-muted px-3 py-2 text-sm font-semibold" onClick={() => setOpen(false)}>
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </header>
    </>
  )
}

export function StorefrontFooter({ widget, siteName }: { widget: WidgetNode; siteName?: string }) {
  const t = useTranslations("storefront")
  const locale = useLocale()
  const about = propStr(widget.props, "about", "")
  const year = formatDate(new Date(), normalizeUiLocale(locale), { dateStyle: "short" }).split("/")[0] || digits(new Date().getFullYear(), locale)
  return (
    <footer className="mt-8 border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-3">
        <div>
          <h3 className="font-bold">{siteName}</h3>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{about}</p>
        </div>
        <div className="grid gap-2 text-sm">
          <div>{propStr(widget.props, "phone", "")}</div>
          <div>{propStr(widget.props, "email", "")}</div>
          <p className="text-muted-foreground">{t("footer_hours")}</p>
        </div>
        <div className="grid content-start gap-2 text-sm">
          <div className="rounded-2xl bg-muted px-3 py-2">{t("footer_pay")}</div>
          <div className="rounded-2xl bg-muted px-3 py-2">{t("footer_ship")}</div>
          <div className="rounded-2xl bg-muted px-3 py-2">{t("footer_trust")}</div>
        </div>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted-foreground">© {year} {siteName}</p>
    </footer>
  )
}

