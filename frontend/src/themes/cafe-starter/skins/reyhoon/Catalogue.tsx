"use client"

import Link from "next/link"
import { Home, MapPin, Search, Share2, Sparkles, Store } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CatalogItem } from "../../types"
import { useCatalogueController, type CatalogueController } from "../../lib/useCatalogueController"
import { digits, keepQuery, localizedField, money } from "../../lib/helpers"
import {
  BannerStrip,
  CafeShell,
  CategorySections,
  EmptyMenu,
  ItemMedia,
  LogoBadge,
  PriceBlock,
  SchemeCartTools,
  pickProps,
  soldLabel,
} from "../shared"
import "./reyhoon.css"

type Props = Parameters<typeof useCatalogueController>[0]

export function ReyhoonCatalogue(props: Props) {
  const ctrl = useCatalogueController(props)
  const tagline = ctrl.venue ? localizedField(ctrl.locale, ctrl.venue.venue.tagline_fa, ctrl.venue.venue.tagline_en) : null
  const address = ctrl.venue ? localizedField(ctrl.locale, ctrl.venue.venue.address_fa, ctrl.venue.venue.address_en) : null
  const delivery =
    ctrl.ordering
      ? money(
          ctrl.ordering.delivery_fee_minor,
          ctrl.catalog.items[0]?.currency || "IRT",
          ctrl.currencyDisplay,
          ctrl.locale,
        )
      : null

  return (
    <CafeShell ctrl={ctrl}>
      <div className="cafe-frame rey-frame">
        <header className="rey-topbar">
          <Link href="/login?next=/dashboard" className="rey-login">
            {ctrl.t("login_cta")}
          </Link>
          <SchemeCartTools ctrl={ctrl} />
        </header>

        <section className="rey-hero">
          <div className="rey-hero-photo" style={ctrl.heroImage ? { backgroundImage: `url(${ctrl.heroImage})` } : undefined}>
            <LogoBadge name={ctrl.venueName} mark={ctrl.logoText} />
          </div>
          <div className="rey-hero-body">
            <div className="rey-title-row">
              <h1>{ctrl.venueName || ctrl.t("catalogue_title")}</h1>
              <span className={cn("rey-status", ctrl.ordering?.is_open === false && "is-closed")}>
                {ctrl.ordering?.is_open === false ? ctrl.t("status_closed") : ctrl.t("accepting_orders")}
              </span>
            </div>
            {tagline ? <p className="rey-tagline">{tagline}</p> : null}
            <div className="rey-meta">
              {delivery ? <span>{ctrl.t("delivery_fee", { amount: delivery })}</span> : null}
              <Link href="/about">{ctrl.t("info_reviews")}</Link>
              {address ? (
                <span>
                  <MapPin className="inline size-3.5" /> {address}
                </span>
              ) : null}
              {ctrl.tableNumber ? <span>{ctrl.t("table_label", { number: digits(ctrl.tableNumber, ctrl.locale) })}</span> : null}
            </div>
          </div>
        </section>

        <BannerStrip banners={ctrl.banners} locale={ctrl.locale} t={ctrl.t} />

        {ctrl.menu.show_search ? (
          <div className="rey-search">
            <Search className="size-4 opacity-50" />
            <input
              value={ctrl.query}
              onChange={(e) => ctrl.setQuery(e.target.value)}
              placeholder={ctrl.t("search_placeholder")}
              aria-label={ctrl.t("search_placeholder")}
            />
          </div>
        ) : null}

        {ctrl.menu.show_category_bar && ctrl.catalog.categories.length > 0 ? (
          <nav className="rey-cats" aria-label={ctrl.t("all_categories")}>
            <button type="button" data-on={ctrl.activeCategory === null ? "true" : "false"} onClick={() => ctrl.setActiveCategory(null)}>
              {ctrl.t("all_categories")}
            </button>
            {ctrl.catalog.categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                data-on={ctrl.activeCategory === cat.slug ? "true" : "false"}
                onClick={() => ctrl.setActiveCategory(cat.slug)}
              >
                {cat.name}
              </button>
            ))}
          </nav>
        ) : null}

        {ctrl.ordering?.accepting_orders === false ? <p className="cafe-notice">{ctrl.t("orders_paused")}</p> : null}

        {ctrl.discounted.length > 0 && !ctrl.activeCategory ? (
          <section className="rey-party">
            <header>
              <Sparkles className="size-4" />
              <h2>{ctrl.t("section_discounted")}</h2>
            </header>
            <div className="rey-party-row">
              {ctrl.discounted.slice(0, 8).map((item) => (
                <Link key={item.id} {...pickProps(ctrl, item)} className="rey-party-card">
                  <ItemMedia item={item} className="rey-party-media" />
                  <h3>{item.name}</h3>
                  <PriceBlock item={item} ctrl={ctrl} cta={ctrl.t("add_to_cart")} />
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <div className="rey-list">
          {ctrl.filteredItems.length === 0 ? (
            <EmptyMenu t={ctrl.t} />
          ) : (
            <CategorySections
              ctrl={ctrl}
              items={ctrl.filteredItems}
              view="list"
              renderCard={(item) => <ReyCard key={item.id} item={item} ctrl={ctrl} />}
            />
          )}
        </div>

        <button
          type="button"
          className="rey-fab"
          aria-label={ctrl.t("share_banner")}
          onClick={() => {
            if (navigator.share) void navigator.share({ title: ctrl.venueName || "", url: window.location.href })
            else void navigator.clipboard.writeText(window.location.href)
          }}
        >
          <Share2 className="size-5" />
        </button>

        <nav className="cafe-dock rey-dock" aria-label={ctrl.t("nav_menu")}>
          <Link href={`/catalogue${keepQuery(ctrl.qs)}`} aria-label={ctrl.t("nav_menu")}>
            <Home className="size-5" />
          </Link>
          <Link href="/about" aria-label={ctrl.t("nav_about")}>
            <Store className="size-5" />
          </Link>
        </nav>
      </div>
    </CafeShell>
  )
}

function ReyCard({ item, ctrl }: { item: CatalogItem; ctrl: CatalogueController }) {
  const sold = soldLabel(ctrl, item)
  return (
    <Link {...pickProps(ctrl, item)} className={cn("rey-card", item.is_sold_out && "is-sold")} data-reveal>
      <ItemMedia item={item} className="rey-card-media" stamp={sold} />
      <div className="rey-card-body">
        <div className="rey-badges">
          {item.is_featured ? <span>{ctrl.t("badge_featured")}</span> : null}
          {item.is_new ? <span>{ctrl.t("badge_new")}</span> : null}
        </div>
        <h3>{item.name}</h3>
        {item.description ? <p>{item.description}</p> : null}
        <PriceBlock item={item} ctrl={ctrl} cta={sold || ctrl.t("select_cta")} />
      </div>
    </Link>
  )
}
