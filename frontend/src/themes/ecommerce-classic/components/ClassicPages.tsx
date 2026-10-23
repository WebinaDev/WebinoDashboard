"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import { useLocale, useTranslations } from "next-intl"

import { formatDate, formatNumber, normalizeUiLocale } from "@/lib/locale"
import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"
import { useServerCart } from "@/builder/storefront/actions"
import { quietApi } from "@/builder/storefront/session"
import { useClassicText } from "../lib/texts"
import { StorefrontCompareTable } from "@/builder/storefront/storefront-extras"

import { ClassicBreadcrumbBar } from "./ClassicArchive"
import { IconBag, IconHeart, IconPin, IconSearch, IconUser } from "./icons"
import { ClassicAmount, ClassicLoader } from "./parts"

export function ClassicPageShell({
  title,
  description,
  trail,
  children,
  actions,
}: {
  title: string
  description?: string
  trail: { label: string; href?: string }[]
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="sfc-page sfc-container">
      <ClassicBreadcrumbBar items={trail} />
      <div className="sfc-page__head">
        <div>
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

export function ClassicNotFound() {
  const tx = useClassicText()
  const theme = useClassicThemeSettings()
  const general = theme.general ?? {}
  const logo = String(general.logo_404_url || "")
  const bg = String(general.bg_404 || "")
  return (
    <div className="sfc-404 sfc-container" style={bg ? { background: bg, borderRadius: 18 } : undefined}>
      {logo ? <img loading="lazy" decoding="async" src={logo} alt="" className="sfc-404__logo" /> : null}
      <h1>{tx("pages.nf_title")}</h1>
      <p>{tx("pages.nf_text")}</p>
      <div className="sfc-cart__links" style={{ justifyContent: "center" }}>
        <Link href="/">{tx("pages.nf_home")}</Link>
        <Link href="/shop">{tx("pages.nf_shop")}</Link>
      </div>
    </div>
  )
}

const ORDER_STATUS_FA: Record<string, string> = {
  pending_payment: "در انتظار پرداخت",
  awaiting_gateway: "در انتظار درگاه",
  on_hold: "در انتظار بررسی",
  paid: "پرداخت شده",
  payment_failed: "پرداخت ناموفق",
  processing: "در حال پردازش",
  "sent-to-warehouse": "ارسال به انبار",
  "webino-in-stock": "تأمین شده",
  "webino-packaged": "بسته‌بندی شده",
  "webino-courier": "تحویل به پیک",
  "webino-post": "تحویل به پست",
  "webino-tipax": "تحویل به تیپاکس",
  "webino-ready-to-ship": "آماده ارسال",
  "webino-shipping": "در حال ارسال",
  shipped: "ارسال شده",
  completed: "تکمیل شده",
  cancelled: "لغو شده",
  refunded: "مسترد شده",
}

type TrackResult = {
  number: string
  status: string
  created_at?: string | null
  total_minor: number
  items_count: number
  tracking_code?: string | null
  tracking_url?: string | null
}

export function ClassicOrderTrack() {
  const theme = useClassicThemeSettings()
  const tx = useClassicText()
  const locale = useLocale()
  const enabled = theme.commerce?.order_tracking_enabled !== false
  const { auth } = useServerCart()
  const [orderNo, setOrderNo] = useState("")
  const [contact, setContact] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<TrackResult | null>(null)

  const trail = [{ label: "خانه", href: "/" }, { label: tx("pages.track_title") }]

  if (!enabled) {
    return (
      <ClassicPageShell title={tx("pages.track_title")} trail={trail}>
        <div className="sfc-box" style={{ padding: "1.5rem" }}>
          <p className="sfc-empty-note">پیگیری سفارش از تنظیمات قالب غیرفعال است.</p>
        </div>
      </ClassicPageShell>
    )
  }

  async function lookup() {
    if (!orderNo.trim() || !contact.trim()) return
    setBusy(true)
    setError("")
    setResult(null)
    const res = await quietApi<{ data?: TrackResult } | TrackResult>("/api/v1/public/orders/track", {
      method: "POST",
      json: { number: orderNo.trim(), contact: contact.trim() },
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.status === 429 ? "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید." : tx("pages.track_not_found"))
      return
    }
    const body = res.data as { data?: TrackResult } & TrackResult
    setResult(body.data ?? body)
  }

  return (
    <ClassicPageShell title={tx("pages.track_title")} description={tx("pages.track_text")} trail={trail}>
      <div className="sfc-box" style={{ padding: "1.25rem" }}>
        <form
          className="sfc-track-form"
          onSubmit={(event) => {
            event.preventDefault()
            void lookup()
          }}
        >
          <label className="sfc-field">
            <span>{tx("pages.track_number")}</span>
            <input required value={orderNo} onChange={(e) => setOrderNo(e.target.value)} dir="ltr" />
          </label>
          <label className="sfc-field">
            <span>{tx("pages.track_contact")}</span>
            <input required value={contact} onChange={(e) => setContact(e.target.value)} dir="ltr" autoComplete="tel" />
          </label>
          <button type="submit" className="sfc-btn" disabled={busy}>
            {busy ? tx("header.loading") : tx("pages.track_submit")}
          </button>
        </form>
        {error ? (
          <p className="sfc-flash sfc-flash--err" role="alert" style={{ marginTop: "1rem" }}>
            {error}
          </p>
        ) : null}
        {result ? (
          <dl className="sfc-track-result" aria-live="polite">
            <div>
              <dt>{tx("pages.track_number")}</dt>
              <dd dir="ltr">{result.number}</dd>
            </div>
            <div>
              <dt>وضعیت</dt>
              <dd>
                <strong>{ORDER_STATUS_FA[result.status] ?? result.status}</strong>
              </dd>
            </div>
            {result.created_at ? (
              <div>
                <dt>تاریخ ثبت</dt>
                <dd>{formatDate(result.created_at, locale)}</dd>
              </div>
            ) : null}
            <div>
              <dt>مبلغ</dt>
              <dd>
                <ClassicAmount value={result.total_minor} />
              </dd>
            </div>
            <div>
              <dt>تعداد اقلام</dt>
              <dd>{formatNumber(result.items_count, normalizeUiLocale(locale))}</dd>
            </div>
            {result.tracking_code ? (
              <div>
                <dt>کد رهگیری مرسوله</dt>
                <dd dir="ltr">
                  {result.tracking_url ? (
                    <a href={result.tracking_url} target="_blank" rel="noreferrer">
                      {result.tracking_code}
                    </a>
                  ) : (
                    result.tracking_code
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <p style={{ marginTop: "1rem" }}>
          {auth === "auth" ? (
            <Link href="/dashboard/account/orders" className="sfc-link-btn">
              مشاهده سفارش‌های حساب
            </Link>
          ) : (
            <Link href={`/login?next=${encodeURIComponent("/order-tracking")}`} className="sfc-link-btn">
              ورود به حساب کاربری
            </Link>
          )}
        </p>
      </div>
    </ClassicPageShell>
  )
}

type WishlistProduct = { id: number; name: string; slug: string; price_minor: number; sale_price_minor?: number | null; image_url?: string | null }

/** Signed-in wishlist (account favorites) in the classic storefront chrome. */
export function ClassicWishlist() {
  const theme = useClassicThemeSettings()
  const tx = useClassicText()
  const enabled = theme.commerce?.wishlist_enabled !== false
  const { auth } = useServerCart()
  const [items, setItems] = useState<WishlistProduct[] | null>(null)

  useEffect(() => {
    if (auth !== "auth" || !enabled) return
    let cancel = false
    void quietApi<{ data?: { products?: WishlistProduct[] }; products?: WishlistProduct[] }>("/api/v1/account/favorites").then((res) => {
      if (cancel) return
      if (!res.ok) {
        setItems([])
        return
      }
      const body = res.data as { data?: { products?: WishlistProduct[] }; products?: WishlistProduct[] }
      setItems(body.data?.products ?? body.products ?? [])
    })
    return () => {
      cancel = true
    }
  }, [auth, enabled])

  const remove = (id: number) => {
    setItems((rows) => (rows ?? []).filter((row) => row.id !== id))
    void quietApi(`/api/v1/account/favorites/${id}`, { method: "DELETE" })
  }

  const trail = [{ label: "خانه", href: "/" }, { label: tx("pages.wishlist_title") }]

  if (!enabled) {
    return (
      <ClassicPageShell title={tx("pages.wishlist_title")} trail={trail}>
        <p className="sfc-empty-note">علاقه‌مندی از تنظیمات قالب غیرفعال است.</p>
      </ClassicPageShell>
    )
  }

  if (auth === "loading" || (auth === "auth" && items === null)) {
    return (
      <ClassicPageShell title={tx("pages.wishlist_title")} trail={trail}>
        <p className="sfc-empty-note"><ClassicLoader label={tx("header.loading")} /></p>
      </ClassicPageShell>
    )
  }

  if (auth !== "auth") {
    return (
      <ClassicPageShell title={tx("pages.wishlist_title")} trail={trail}>
        <div className="sfc-box sfc-cart__empty">
          <IconHeart size={36} />
          <h2>برای دیدن علاقه‌مندی‌ها وارد شوید</h2>
          <Link href={`/login?next=${encodeURIComponent("/wishlist")}`} className="sfc-btn">
            {tx("header.account_login")}
          </Link>
        </div>
      </ClassicPageShell>
    )
  }

  return (
    <ClassicPageShell title={tx("pages.wishlist_title")} trail={trail}>
      {!items?.length ? (
        <div className="sfc-box sfc-cart__empty">
          <IconHeart size={36} />
          <h2>{tx("pages.wishlist_empty")}</h2>
          <div className="sfc-cart__links">
            <Link href="/shop">{tx("archive.view_all")}</Link>
          </div>
        </div>
      ) : (
        <ul className="sfc-wishlist">
          {items.map((item) => (
            <li key={item.id} className="sfc-box sfc-wishlist__item">
              <Link href={`/product/${item.slug}`} className="sfc-wishlist__img">
                {item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : <span>{item.name.slice(0, 1)}</span>}
              </Link>
              <Link href={`/product/${item.slug}`} className="sfc-wishlist__name">
                {item.name}
              </Link>
              <ClassicAmount value={item.sale_price_minor || item.price_minor} />
              <button type="button" className="sfc-link-btn" onClick={() => remove(item.id)}>
                {tx("header.minicart_remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </ClassicPageShell>
  )
}


export function ClassicAccountHome() {
  const t = useTranslations("storefront")
  const { auth } = useServerCart()
  const cards = [
    { href: "/dashboard/account/orders", title: t("account_orders"), text: "وضعیت و جزئیات خریدها", icon: <IconBag size={20} /> },
    { href: "/wishlist", title: t("favorite"), text: "لیست علاقه‌مندی‌ها", icon: <IconHeart size={20} /> },
    { href: "/dashboard/account/addresses", title: "آدرس‌ها", text: "مدیریت آدرس‌های ارسال", icon: <IconPin size={20} /> },
    { href: "/dashboard/account/profile", title: "پروفایل", text: "اطلاعات حساب کاربری", icon: <IconUser size={20} /> },
    { href: "/compare", title: t("compare_title"), text: "مقایسه محصولات", icon: <IconSearch size={20} /> },
    { href: "/order-tracking", title: "پیگیری سفارش", text: "پیگیری وضعیت مرسوله", icon: <IconBag size={20} /> },
  ]

  if (auth !== "auth") {
    return (
      <ClassicPageShell
        title="حساب کاربری"
        description="برای مشاهده سفارش‌ها وارد شوید."
        trail={[{ label: "خانه", href: "/" }, { label: "حساب کاربری" }]}
      >
        <div className="sfc-account-grid">
          <Link href={`/login?next=${encodeURIComponent("/account")}`} className="sfc-account-card">
            <strong>{t("account_login")}</strong>
            <span>{t("account_login_text")}</span>
          </Link>
          <Link href="/account/change-password" className="sfc-account-card">
            <strong>{t("account_password")}</strong>
            <span>{t("account_password_text")}</span>
          </Link>
        </div>
      </ClassicPageShell>
    )
  }

  return (
    <ClassicPageShell
      title="حساب کاربری"
      trail={[{ label: "خانه", href: "/" }, { label: "حساب کاربری" }]}
    >
      <div className="sfc-account-grid">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="sfc-account-card">
            <span>{card.icon}</span>
            <strong>{card.title}</strong>
            <span>{card.text}</span>
          </Link>
        ))}
      </div>
    </ClassicPageShell>
  )
}

type CompareItem = {
  id: number
  slug: string
  name: string
  price_minor: number
  brand?: string | null
  category?: string | null
  in_stock?: boolean
}

export function ClassicComparePage() {
  const t = useTranslations("storefront")
  const locale = useLocale()
  const theme = useClassicThemeSettings()
  const enabled = theme.commerce?.compare_enabled !== false
  const [items, setItems] = useState<CompareItem[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) return
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    const url = `${base}/api/v1/public/compare${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`
    fetch(url, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setItems(Array.isArray(json?.data?.items) ? json.data.items : []))
      .finally(() => setLoading(false))
  }, [query, enabled])

  const money = (minor: number) =>
    `${formatNumber(Math.round(minor), normalizeUiLocale(locale))} ${t("currency_toman")}`

  if (!enabled) {
    return (
      <ClassicPageShell title={t("compare_title")} trail={[{ label: t("home_crumb"), href: "/" }, { label: t("compare_title") }]}>
        <p className="sfc-empty-note">مقایسه محصول از تنظیمات قالب غیرفعال است.</p>
      </ClassicPageShell>
    )
  }

  return (
    <ClassicPageShell
      title={t("compare_title")}
      description={t("compare_hint")}
      trail={[{ label: t("home_crumb"), href: "/" }, { label: t("compare_title") }]}
      actions={
        <input
          className="sfc-field"
          style={{ minWidth: 220 }}
          placeholder={t("compare_search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      }
    >
      {loading ? <p className="sfc-empty-note"><ClassicLoader label={t("loading")} /></p> : null}
      {!loading && !items.length ? (
        <div className="sfc-box sfc-cart__empty">
          <h2>{t("compare_empty")}</h2>
          <div className="sfc-cart__links">
            <Link href="/shop">{t("continue_shop")}</Link>
          </div>
        </div>
      ) : null}
      {!loading && items.length ? (
        <div className="sfc-box" style={{ padding: "0.5rem", overflow: "auto" }}>
          <StorefrontCompareTable
            items={items}
            money={money}
            onRemove={(id) => setItems((rows) => rows.filter((row) => row.id !== id))}
          />
        </div>
      ) : null}
    </ClassicPageShell>
  )
}
