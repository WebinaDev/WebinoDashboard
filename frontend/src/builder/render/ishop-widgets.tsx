"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"

import { IshopMegaMenuPanel } from "../storefront/ishop-port"
import { StoreProductCard } from "../storefront/ui"
import { useCatalog } from "../storefront/use-catalog"
import { propNum, propStr } from "../props"
import type { WidgetNode } from "../types"
import { ProductReviewsPanel } from "../storefront/ishop-port"
import { StorefrontAccount } from "../storefront/ui"

export function MegaMenuWidget({ widget }: { widget: WidgetNode }) {
  const columns = propStr(widget.props, "columns", "")
  return (
    <div className="mx-auto max-w-6xl px-4 py-2">
      <IshopMegaMenuPanel columnsText={columns} />
    </div>
  )
}

export function TasteBoxWidget({ widget }: { widget: WidgetNode }) {
  const title = propStr(widget.props, "title", "پیشنهاد برای سلیقه شما")
  const catalog = useCatalog(4)
  return (
    <section className="mx-auto max-w-6xl px-4 py-6">
      <div className="ishop-section-head">
        <h2>{title}</h2>
        <Link href="/shop">مشاهده همه</Link>
      </div>
      <div className="ishop-taste-grid">
        {catalog.products.slice(0, 4).map((product) => (
          <Link key={product.slug} href={`/product/${product.slug}`} className="ishop-taste-card">
            <span className="text-xs font-bold text-primary">{product.brand}</span>
            <span className="mt-1 line-clamp-2 text-sm font-extrabold">{product.name}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export function PackageBlockWidget({ widget }: { widget: WidgetNode }) {
  const title = propStr(widget.props, "title", "پکیج ویژه")
  const text = propStr(widget.props, "text", "چند محصول مکمل با قیمت به‌صرفه")
  const href = propStr(widget.props, "href", "/shop")
  return (
    <section className="mx-auto max-w-6xl px-4 py-6">
      <div className="ishop-package">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{text}</p>
          <Link href={href} className="mt-4 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">
            مشاهده پکیج
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {["مراقبت", "آرایش", "مو", "عطر"].map((label) => (
            <div key={label} className="rounded-2xl bg-card p-4 text-center text-sm font-bold">
              {label}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function BlogTocWidget({ widget }: { widget: WidgetNode }) {
  const items = propStr(widget.props, "items", "مقدمه|#intro\nجمع‌بندی|#summary")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  return (
    <aside className="ishop-blog-toc sf-card p-4">
      <h3 className="mb-2 text-sm font-bold">{propStr(widget.props, "title", "فهرست مطالب")}</h3>
      {items.map((line) => {
        const [label, href] = line.split("|").map((s) => s.trim())
        return (
          <a key={line} href={href || "#"}>
            {label}
          </a>
        )
      })}
    </aside>
  )
}

export function MostViewedWidget({ widget }: { widget: WidgetNode }) {
  const limit = propNum(widget.props, "limit", 6)
  const catalog = useCatalog(limit)
  const title = propStr(widget.props, "title", "پربازدیدترین")
  return (
    <section className="mx-auto max-w-6xl px-4 py-6">
      <div className="ishop-section-head">
        <h2>{title}</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.products.slice(0, limit).map((product) => (
          <StoreProductCard key={product.slug} product={product} />
        ))}
      </div>
    </section>
  )
}

export function AmazingOffersBlockWidget({ widget }: { widget: WidgetNode }) {
  const t = useTranslations("storefront")
  const title = propStr(widget.props, "title", t("amazing_offers_title"))
  const catalog = useCatalog(8)
  const offers = catalog.products.filter((p) => p.compare && p.compare > p.price).slice(0, 4)
  return (
    <section className="mx-auto max-w-6xl px-4 py-6">
      <div className="ishop-section-head">
        <h2>{title}</h2>
        <Link href="/amazing-offers">{t("amazing_offers_title")}</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {offers.map((product) => (
          <StoreProductCard key={product.slug} product={product} />
        ))}
      </div>
    </section>
  )
}

export function ProductReviewsWidget({ widget, productSlug }: { widget: WidgetNode; productSlug?: string }) {
  const slug = productSlug || propStr(widget.props, "slug", "")
  if (!slug) return null
  return (
    <div className="mx-auto max-w-6xl px-4">
      <ProductReviewsPanel slug={slug} />
    </div>
  )
}

export function AccountDashboardWidget() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <StorefrontAccount />
    </div>
  )
}

export function BreadcrumbsWidget({ widget }: { widget: WidgetNode }) {
  const items = propStr(widget.props, "trail", "خانه|/\nفروشگاه|/shop")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, href] = line.split("|").map((s) => s.trim())
      return { label: label || "", href: href || undefined }
    })
  return (
    <nav className="ishop-breadcrumb mx-auto max-w-6xl px-4 pt-4" aria-label="breadcrumb">
      {items.map((item, i) => (
        <span key={item.label + i}>
          {i > 0 ? " / " : null}
          {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
        </span>
      ))}
    </nav>
  )
}
