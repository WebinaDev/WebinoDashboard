"use client"

import { Menu, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useState, type ReactNode } from "react"

import { formatDate, formatNumber, normalizeUiLocale } from "@/lib/locale"
import { useCatalog } from "./use-catalog"
import { quietApi } from "./session"
import type { ShopProduct } from "../catalog"

export function IshopBreadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="ishop-breadcrumb" aria-label="breadcrumb">
      {items.map((item, index) => (
        <span key={item.label + index}>
          {index > 0 ? <span aria-hidden="true"> / </span> : null}
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  )
}

export function IshopTopBar() {
  const t = useTranslations("storefront")
  return (
    <div className="ishop-topbar hidden md:block">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
        <span>{t("footer_hours")}</span>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/amazing-offers">{t("amazing_offers_title")}</Link>
          <Link href="/compare">{t("compare_title")}</Link>
          <Link href="/shop?on_sale=1">{t("on_sale")}</Link>
        </div>
      </div>
    </div>
  )
}

export function IshopMobileNav({
  open,
  onClose,
  links,
}: {
  open: boolean
  onClose: () => void
  links: { label: string; href: string }[]
}) {
  const catalog = useCatalog(12)
  if (!open) return null
  return (
    <div className="ishop-mobile-nav md:hidden" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="close" onClick={onClose} />
      <div className="ishop-mobile-sheet">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-bold">منو</span>
          <button type="button" onClick={onClose} aria-label="close">
            <X className="size-5" />
          </button>
        </div>
        <div className="grid gap-2">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-xl bg-muted px-3 py-2 text-sm font-semibold" onClick={onClose}>
              {link.label}
            </Link>
          ))}
        </div>
        <p className="mb-2 mt-4 text-xs font-bold text-muted-foreground">دسته‌ها</p>
        <div className="grid gap-1">
          {catalog.categories.map((cat) => (
            <Link key={cat.slug} href={`/shop?category=${cat.slug}`} className="text-sm font-semibold" onClick={onClose}>
              {cat.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export function IshopMegaMenuPanel({ columnsText }: { columnsText: string }) {
  const catalog = useCatalog(8)
  const lines = columnsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const parsed = lines.map((line) => {
    const [title, ...rest] = line.split("|")
    return { title: (title ?? "").trim(), links: rest.join("|").split(",").map((s) => s.trim()).filter(Boolean) }
  })

  if (!parsed.length) {
    return (
      <div className="ishop-mega-panel grid gap-4 md:grid-cols-3">
        <div className="ishop-mega-col">
          <h3>دسته‌ها</h3>
          {catalog.categories.slice(0, 6).map((c) => (
            <Link key={c.slug} href={`/shop?category=${c.slug}`}>
              {c.name}
            </Link>
          ))}
        </div>
        <div className="ishop-mega-col">
          <h3>فروشگاه</h3>
          <Link href="/shop">همه محصولات</Link>
          <Link href="/amazing-offers">پیشنهاد شگفت‌انگیز</Link>
          <Link href="/compare">مقایسه</Link>
        </div>
        <div className="ishop-mega-col">
          <h3>حساب</h3>
          <Link href="/account">ورود / سفارش‌ها</Link>
          <Link href="/dashboard/account/favorites">علاقه‌مندی‌ها</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="ishop-mega-panel grid gap-4 md:grid-cols-3">
      {parsed.map((col) => (
        <div key={col.title} className="ishop-mega-col">
          <h3>{col.title}</h3>
          {col.links.map((entry) => {
            const [label, href] = entry.includes("|") ? entry.split("|").map((s) => s.trim()) : [entry, "/shop"]
            return (
              <Link key={label + href} href={href || "/shop"}>
                {label}
              </Link>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function ProductReviewsPanel({ slug }: { slug: string }) {
  const t = useTranslations("storefront")
  const locale = useLocale()
  const [items, setItems] = useState<
    Array<{ id: number; rating: number; body?: string | null; author_name?: string | null; voice_url?: string | null; likes_count?: number; dislikes_count?: number; created_at?: string }>
  >([])
  const [average, setAverage] = useState<number | null>(null)

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    fetch(`${base}/api/v1/public/catalog/items/${encodeURIComponent(slug)}/reviews`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        setItems(Array.isArray(json?.data?.items) ? json.data.items : [])
        setAverage(typeof json?.data?.average === "number" ? json.data.average : null)
      })
  }, [slug])

  return (
    <section className="mt-6">
      <div className="ishop-section-head">
        <h2>{t("reviews_title")}</h2>
        {average != null ? (
          <span className="text-sm font-bold text-primary">
            {formatNumber(average, normalizeUiLocale(locale))} / ۵
          </span>
        ) : null}
      </div>
      <div className="grid gap-3">
        {items.map((review) => (
          <article key={review.id} className="ishop-review-card">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm">{review.author_name || t("account_login")}</strong>
              <span className="text-xs text-muted-foreground">
                {review.created_at ? formatDate(review.created_at, normalizeUiLocale(locale)) : ""}
              </span>
            </div>
            <p className="mt-1 text-xs text-primary">{"★".repeat(Math.max(0, Math.min(5, review.rating)))}</p>
            {review.body ? <p className="mt-2 text-sm leading-7">{review.body}</p> : null}
            {review.voice_url ? (
              <audio controls className="mt-2 w-full max-w-md" preload="none">
                <source src={review.voice_url} />
              </audio>
            ) : null}
            <div className="ishop-review-actions">
              <button type="button" onClick={() => void quietApi(`/api/v1/public/catalog/reviews/${review.id}/react`, { method: "POST", json: { reaction: "like" } })}>
                👍 {review.likes_count ?? 0}
              </button>
              <button type="button" onClick={() => void quietApi(`/api/v1/public/catalog/reviews/${review.id}/react`, { method: "POST", json: { reaction: "dislike" } })}>
                👎 {review.dislikes_count ?? 0}
              </button>
              <button type="button" onClick={() => void quietApi(`/api/v1/public/catalog/reviews/${review.id}/report`, { method: "POST", json: {} })}>
                {t("review_report")}
              </button>
            </div>
          </article>
        ))}
        {!items.length ? <p className="text-sm text-muted-foreground">{t("empty_none")}</p> : null}
      </div>
    </section>
  )
}

export function StockAlertForm({ slug }: { slug: string }) {
  const t = useTranslations("storefront")
  const [destination, setDestination] = useState("")
  const [note, setNote] = useState("")
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-muted/40 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void quietApi(`/api/v1/public/catalog/items/${encodeURIComponent(slug)}/stock-alerts`, {
          method: "POST",
          json: { alert_type: "back_in_stock", channel: "email", destination },
        }).then((res) => setNote(res.ok ? t("added") : t("add_failed")))
      }}
    >
      <label className="grid flex-1 gap-1 text-xs">
        <span>{t("stock_alert_cta")}</span>
        <input className="sf-field h-10" dir="ltr" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="email@example.com" />
      </label>
      <button type="submit" className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">
        {t("stock_alert_cta")}
      </button>
      {note ? <p className="w-full text-xs text-muted-foreground">{note}</p> : null}
    </form>
  )
}

export function IshopAccountShell({ children }: { children: ReactNode }) {
  const t = useTranslations("storefront")
  const pathname = usePathname()
  const links = [
    { href: "/account", label: t("account_orders") },
    { href: "/dashboard/account/favorites", label: t("favorite") },
    { href: "/dashboard/account/profile", label: t("account_password") },
    { href: "/dashboard/account/wallet", label: t("pay_title") },
    { href: "/compare", label: t("compare_title") },
  ]
  return (
    <div className="ishop-account-shell">
      <nav className="ishop-account-nav" aria-label="account">
        {links.map((link) => (
          <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}>
            {link.label}
          </Link>
        ))}
      </nav>
      <div>{children}</div>
    </div>
  )
}

export function IshopProductCardActions({ product }: { product: ShopProduct }) {
  const t = useTranslations("storefront")
  if (!product.id) return null
  return (
    <div className="mt-2 flex gap-1">
      <button
        type="button"
        className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold"
        onClick={() => void quietApi(`/api/v1/public/compare/products/${product.id}`, { method: "POST" })}
      >
        {t("compare_add")}
      </button>
    </div>
  )
}

export function MobileNavToggle({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="grid size-10 place-items-center rounded-full bg-muted md:hidden" aria-label="menu" onClick={onOpen}>
      <Menu className="size-4" />
    </button>
  )
}

export function IshopStorefrontPage({
  title,
  description,
  trail,
  children,
  wide,
}: {
  title: string
  description?: string
  trail: { label: string; href?: string }[]
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className={`ishop-secondary-page mx-auto px-4 py-8 ${wide ? "max-w-6xl" : "max-w-4xl"}`}>
      <IshopBreadcrumbs items={trail} />
      <header className="ishop-section-head mt-4">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </header>
      <div className="mt-6">{children}</div>
    </div>
  )
}
