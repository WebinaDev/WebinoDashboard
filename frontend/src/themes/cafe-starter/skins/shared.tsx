"use client"

import Image from "next/image"
import Link from "next/link"
import { useState, type CSSProperties, type ReactNode } from "react"
import { Cake, Coffee, Croissant, CupSoda, Grid2x2, LayoutTemplate, List, Moon, Soup, Sun, Utensils, Wine } from "lucide-react"
import { cn } from "@/lib/utils"
import { CafeCartDrawer } from "../components/CafeCartDrawer"
import { ItemSheet } from "../components/ItemSheet"
import { PhoneGateDialog } from "../components/PhoneGateDialog"
import type { CatalogItem, MenuBanner } from "../types"
import {
  digits,
  initialOf,
  keepQuery,
  localizedField,
  menuKind,
  money,
  placeholderFor,
  type ViewMode,
} from "../lib/helpers"
import { offPercent, type CatalogueController } from "../lib/useCatalogueController"
import { useReveal } from "../lib/useScrollSpy"

export function CafeShell({
  ctrl,
  children,
  className,
}: {
  ctrl: CatalogueController
  children: ReactNode
  className?: string
}) {
  const style = ctrl.accent ? ({ ["--cafe-accent" as string]: ctrl.accent } as CSSProperties) : undefined
  useReveal()
  return (
    <div
      className={cn("cafe-shell is-catalogue", className)}
      data-skin={ctrl.skin}
      data-layout={ctrl.layout}
      data-scheme={ctrl.scheme}
      data-season={ctrl.menu.seasonal_theme && ctrl.menu.seasonal_theme !== "none" ? ctrl.menu.seasonal_theme : undefined}
      data-font={ctrl.menu.font_preset || "sans"}
      data-hydrated={ctrl.hydrated ? "true" : "false"}
      style={style}
    >
      <PhoneGateDialog engagement={ctrl.catalog.engagement} />
      {children}
      <ItemSheet ctrl={ctrl} item={ctrl.picked} onClose={() => ctrl.setPicked(null)} />
    </div>
  )
}

export function SchemeCartTools({
  ctrl,
  extra,
  cart = "icon",
}: {
  ctrl: CatalogueController
  extra?: ReactNode
  cart?: "icon" | "pill" | "none"
}) {
  return (
    <div className="cafe-tool-cluster">
      <button type="button" className="cafe-icon-btn" onClick={ctrl.toggleScheme} aria-label={ctrl.t("toggle_theme")}>
        {ctrl.scheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
      {cart !== "none" ? <CartButton ctrl={ctrl} variant={cart} /> : null}
      {extra}
    </div>
  )
}

export function CartButton({
  ctrl,
  variant = "icon",
  className,
}: {
  ctrl: CatalogueController
  variant?: "icon" | "pill" | "bar"
  className?: string
}) {
  return (
    <CafeCartDrawer
      tableNumber={ctrl.tableNumber}
      branchSlug={ctrl.branchSlug}
      ordering={ctrl.ordering}
      currency={ctrl.catalog.items[0]?.currency}
      currencyDisplay={ctrl.currencyDisplay}
      variant={variant}
      skin={ctrl.skin}
      scheme={ctrl.scheme}
      className={className}
    />
  )
}

export function ViewModeSwitch({ ctrl }: { ctrl: CatalogueController }) {
  const modes: { id: ViewMode; label: string }[] = [
    { id: "list", label: ctrl.t("view_list") },
    { id: "grid", label: ctrl.t("view_grid") },
    { id: "cover", label: ctrl.t("view_cover") },
  ]
  return (
    <div className="cafe-view-switch" role="group" aria-label={ctrl.t("view_modes")}>
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          className="cafe-view-btn"
          data-on={ctrl.view === m.id ? "true" : "false"}
          onClick={() => ctrl.setView(m.id)}
          aria-label={m.label}
        >
          {m.id === "list" ? <List className="size-4" /> : m.id === "grid" ? <Grid2x2 className="size-4" /> : <LayoutTemplate className="size-4" />}
        </button>
      ))}
    </div>
  )
}

export function MenuGlyphs({ kind }: { kind: "bar" | "cafe" | "restaurant" }) {
  const icons = kind === "bar" ? [Wine, CupSoda] : kind === "cafe" ? [Coffee, Croissant, Cake] : [Utensils, Soup, Cake]
  return (
    <span className="cafe-acc-glyphs" aria-hidden="true">
      {icons.map((Icon, index) => (
        <Icon key={index} className="size-5" />
      ))}
    </span>
  )
}

export function BannerStrip({
  banners,
  locale,
  t,
}: {
  banners: MenuBanner[]
  locale: string
  t: CatalogueController["t"]
}) {
  if (!banners.length) return null
  return (
    <section className="cafe-banners">
      {banners.map((banner) => {
        const title = localizedField(locale, banner.title_fa, banner.title_en)
        return (
          <article key={banner.id} className="cafe-banner-card">
            <div className="cafe-banner-media" style={{ backgroundImage: `url(${banner.image_url})` }} />
            <div className="cafe-banner-shade">
              {title ? <p>{title}</p> : null}
              {banner.link_url ? (
                <a href={banner.link_url}>{t("banner_cta")}</a>
              ) : null}
            </div>
          </article>
        )
      })}
    </section>
  )
}

export function EmptyMenu({ t }: { t: CatalogueController["t"] }) {
  return <p className="cafe-empty">{t("empty_menu")}</p>
}

export function ItemMedia({
  item,
  className,
  stamp,
  sizes,
}: {
  item: CatalogItem
  className?: string
  stamp?: string | null
  sizes?: string
}) {
  const image = item.cover_image_url || item.image_url
  const [loaded, setLoaded] = useState(false)
  return (
    <div
      className={cn("cafe-media", className)}
      data-loaded={image ? (loaded ? "true" : "false") : "none"}
      style={image ? undefined : { backgroundImage: placeholderFor(item.slug || item.name) }}
    >
      {image ? (
        <Image
          src={image}
          alt=""
          fill
          sizes={sizes ?? "(max-width: 640px) 50vw, 320px"}
          className="object-cover"
          unoptimized
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      ) : (
        <span className="cafe-media-initial" aria-hidden="true">{initialOf(item.name)}</span>
      )}
      {stamp ? <span className="cafe-stamp">{stamp}</span> : null}
    </div>
  )
}

export function PriceBlock({
  item,
  ctrl,
  cta,
}: {
  item: CatalogItem
  ctrl: CatalogueController
  cta?: string
}) {
  const was = ctrl.wasOf(item)
  return (
    <div className="cafe-buy">
      <div className="cafe-price-row">
        {was ? <span className="cafe-was">{was}</span> : null}
        {offPercent(item) > 0 ? (
          <span className="cafe-off">{ctrl.t("discount_percent", { percent: digits(offPercent(item), ctrl.locale) })}</span>
        ) : null}
        <span className="cafe-price">{ctrl.priceOf(item)}</span>
      </div>
      {cta ? <span className="cafe-cta">{cta}</span> : null}
    </div>
  )
}

/** Card props: real link for crawlers / new tabs, but a tap opens the in-page item sheet. */
export function pickProps(ctrl: CatalogueController, item: CatalogItem) {
  return {
    href: itemHref(item, ctrl.qs),
    onClick: (event: React.MouseEvent) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return
      event.preventDefault()
      ctrl.setPicked(item)
    },
  }
}

export function itemHref(item: CatalogItem, qs: Record<string, string | null | undefined>) {
  return `/catalogue/${item.slug}${keepQuery(qs)}`
}

export function soldLabel(ctrl: CatalogueController, item: CatalogItem) {
  if (!item.is_sold_out) return null
  return ctrl.t(ctrl.skin === "cafe-super" ? "stock_gone" : "badge_sold_out")
}

export function CategorySections({
  ctrl,
  items,
  view,
  renderCard,
}: {
  ctrl: CatalogueController
  items: CatalogItem[]
  view: ViewMode
  renderCard: (item: CatalogItem, view: ViewMode) => ReactNode
}) {
  const groups = ctrl.catalog.categories
    .map((cat) => ({ cat, items: items.filter((item) => item.category?.id === cat.id) }))
    .filter((g) => g.items.length > 0)
  const uncategorized = items.filter((item) => !item.category)
  return (
    <div className="cafe-sections">
      {groups.map(({ cat, items: rows }) => (
        <section key={cat.id} id={`cat-${cat.slug}`} data-cat={cat.slug}>
          <header className="cafe-section-head">
            <h2>{cat.name}</h2>
            {cat.description ? <p>{cat.description}</p> : null}
          </header>
          <div className={cn("cafe-grid", view === "list" ? "is-list" : view === "cover" ? "is-cover" : "is-grid")}>
            {rows.map((item) => renderCard(item, (cat.display_mode as ViewMode) || view))}
          </div>
        </section>
      ))}
      {uncategorized.length > 0 && !ctrl.activeCategory ? (
        <div className={cn("cafe-grid", view === "list" ? "is-list" : view === "cover" ? "is-cover" : "is-grid")}>
          {uncategorized.map((item) => renderCard(item, view))}
        </div>
      ) : null}
    </div>
  )
}

export function LogoBadge({ name, mark }: { name?: string | null; mark?: ReactNode }) {
  return <span className="cafe-logo-badge">{mark ?? initialOf(name)}</span>
}

export { menuKind, localizedField, keepQuery, money, digits, initialOf, placeholderFor }
