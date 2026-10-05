"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import { useLocale, useTranslations } from "next-intl"

import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"
import { useServerCart } from "@/builder/storefront/actions"
import { StorefrontCompareTable } from "@/builder/storefront/storefront-extras"

import { ClassicBreadcrumbBar } from "./ClassicArchive"
import { IconBag, IconHeart, IconPin, IconSearch, IconUser } from "./icons"

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
  const theme = useClassicThemeSettings()
  const general = theme.general ?? {}
  const logo = String(general.logo_404_url || "")
  const bg = String(general.bg_404 || "")
  return (
    <div className="sfc-404 sfc-container" style={bg ? { background: bg, borderRadius: 18 } : undefined}>
      {logo ? <img src={logo} alt="" className="sfc-404__logo" /> : null}
      <h1>این صفحه پیدا نشد</h1>
      <p>نشانی را دوباره بررسی کنید یا به فروشگاه برگردید.</p>
      <div className="sfc-cart__links" style={{ justifyContent: "center" }}>
        <Link href="/">بازگشت به خانه</Link>
        <Link href="/shop">مشاهده فروشگاه</Link>
      </div>
    </div>
  )
}

export function ClassicOrderTrack() {
  const theme = useClassicThemeSettings()
  const enabled = theme.commerce?.order_tracking_enabled !== false
  const { auth } = useServerCart()
  const [orderNo, setOrderNo] = useState("")
  const [phone, setPhone] = useState("")
  const [note, setNote] = useState("")

  if (!enabled) {
    return (
      <ClassicPageShell
        title="پیگیری سفارش"
        trail={[{ label: "خانه", href: "/" }, { label: "پیگیری سفارش" }]}
      >
        <div className="sfc-box" style={{ padding: "1.5rem" }}>
          <p className="sfc-empty-note">پیگیری سفارش از تنظیمات قالب غیرفعال است.</p>
        </div>
      </ClassicPageShell>
    )
  }

  return (
    <ClassicPageShell
      title="پیگیری سفارش"
      description="شماره سفارش و موبایل ثبت‌شده را وارد کنید."
      trail={[{ label: "خانه", href: "/" }, { label: "پیگیری سفارش" }]}
    >
      <div className="sfc-box" style={{ padding: "1.25rem" }}>
        <form
          className="sfc-track-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (auth === "auth") {
              setNote("برای جزئیات کامل به حساب کاربری / سفارش‌ها بروید.")
              return
            }
            setNote(
              "جستجوی عمومی سفارش هنوز به API متصل نیست. پس از ورود، سفارش‌ها در حساب کاربری در دسترس‌اند.",
            )
          }}
        >
          <label className="sfc-field">
            <span>شماره سفارش</span>
            <input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} dir="ltr" />
          </label>
          <label className="sfc-field">
            <span>موبایل</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
          </label>
          <button type="submit" className="sfc-btn">
            پیگیری
          </button>
        </form>
        {note ? <p className="sfc-flash sfc-flash--ok" style={{ marginTop: "1rem" }}>{note}</p> : null}
        {auth === "auth" ? (
          <p style={{ marginTop: "1rem" }}>
            <Link href="/account" className="sfc-link-btn">
              مشاهده سفارش‌های حساب
            </Link>
          </p>
        ) : (
          <p style={{ marginTop: "1rem" }}>
            <Link href={`/login?next=${encodeURIComponent("/order-tracking")}`} className="sfc-btn">
              ورود به حساب کاربری
            </Link>
          </p>
        )}
      </div>
    </ClassicPageShell>
  )
}

export function ClassicAccountHome() {
  const t = useTranslations("storefront")
  const { auth } = useServerCart()
  const cards = [
    { href: "/dashboard/account/orders", title: t("account_orders"), text: "وضعیت و جزئیات خریدها", icon: <IconBag size={20} /> },
    { href: "/dashboard/account/favorites", title: t("favorite"), text: "لیست علاقه‌مندی‌ها", icon: <IconHeart size={20} /> },
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
      {loading ? <p className="sfc-empty-note">{t("loading")}</p> : null}
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
