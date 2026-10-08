"use client"

import Link from "next/link"
import { Coffee, Home, Plus, Search, Store } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CatalogItem } from "../../types"
import { useCatalogueController, type CatalogueController } from "../../lib/useCatalogueController"
import { digits, initialOf, keepQuery, localizedField } from "../../lib/helpers"
import { CafeShell, CartButton, EmptyMenu, ItemMedia, SchemeCartTools, pickProps, soldLabel } from "../shared"
import "./kerase.css"

type Props = Parameters<typeof useCatalogueController>[0]

function CupMark() {
  return (
    <svg viewBox="0 0 48 48" className="ker-cup" aria-hidden="true">
      <path d="M17 6c-2 3 2 4 0 7M24 5c-2 3 2 4 0 7M31 6c-2 3 2 4 0 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 18h28v8a14 14 0 0 1-28 0z" fill="currentColor" />
      <path d="M36 21h3a5 5 0 0 1 0 10h-4" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M6 43h34" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function KeraseCatalogue(props: Props) {
  const ctrl = useCatalogueController(props)
  const tagline = ctrl.venue ? localizedField(ctrl.locale, ctrl.venue.venue.tagline_fa, ctrl.venue.venue.tagline_en) : null
  const picks = ctrl.featured.slice(0, 6)

  return (
    <CafeShell ctrl={ctrl}>
      <div className="cafe-frame ker-frame">
        <header className="ker-top">
          <SchemeCartTools ctrl={ctrl} cart="none" />
          <span className="ker-mark">
            <CupMark />
          </span>
          <Link href="/reservations" className="ker-top-link">
            {ctrl.t("nav_reservations")}
          </Link>
        </header>

        <section className="ker-intro">
          <p className="ker-kicker">{ctrl.ordering?.is_open === false ? ctrl.t("status_closed") : ctrl.t("status_open")}</p>
          <h1>{ctrl.venueName || ctrl.t("catalogue_title")}</h1>
          {tagline ? <p className="ker-tagline">{tagline}</p> : null}
        </section>

        <figure className="ker-hero" style={ctrl.heroImage ? { backgroundImage: `url(${ctrl.heroImage})` } : undefined}>
          <figcaption>
            <Coffee className="size-4" />
            {ctrl.tableNumber
              ? ctrl.t("table_label", { number: digits(ctrl.tableNumber, ctrl.locale) })
              : ctrl.ordering?.prep_minutes
                ? ctrl.t("prep_minutes", { count: digits(ctrl.ordering.prep_minutes, ctrl.locale) })
                : ctrl.t("menu_kicker")}
          </figcaption>
        </figure>

        {ctrl.menu.show_search ? (
          <label className="ker-search">
            <Search className="size-4" />
            <input
              value={ctrl.query}
              onChange={(e) => ctrl.setQuery(e.target.value)}
              placeholder={ctrl.t("search_placeholder")}
              aria-label={ctrl.t("search_placeholder")}
            />
          </label>
        ) : null}

        {ctrl.menu.show_category_bar && ctrl.catalog.categories.length > 0 ? (
          <nav className="ker-bubbles" aria-label={ctrl.t("categories_heading")}>
            <button type="button" data-on={ctrl.activeCategory === null ? "true" : "false"} onClick={() => ctrl.setActiveCategory(null)}>
              <span className="ker-bubble">
                <Coffee className="size-6" />
              </span>
              <span>{ctrl.t("all_categories")}</span>
            </button>
            {ctrl.catalog.categories.map((cat) => {
              const img = cat.icon_url || cat.image_url
              return (
                <button key={cat.id} type="button" data-on={ctrl.activeCategory === cat.slug ? "true" : "false"} onClick={() => ctrl.setActiveCategory(cat.slug)}>
                  <span className="ker-bubble" style={img ? { backgroundImage: `url(${img})` } : undefined}>
                    {img ? null : initialOf(cat.name)}
                  </span>
                  <span>{cat.name}</span>
                </button>
              )
            })}
          </nav>
        ) : null}

        {ctrl.ordering?.accepting_orders === false ? <p className="cafe-notice">{ctrl.t("orders_paused")}</p> : null}

        {picks.length > 0 && !ctrl.activeCategory && !ctrl.query ? (
          <section className="ker-picks">
            <h2>{ctrl.t("section_featured")}</h2>
            <div className="ker-picks-row">
              {picks.map((item) => (
                <Link key={item.id} {...pickProps(ctrl, item)} className="ker-pick">
                  <ItemMedia item={item} className="ker-pick-media" />
                  <div className="ker-pick-copy">
                    <h3>{item.name}</h3>
                    <span>{ctrl.priceOf(item)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <div className="ker-sections">
          {ctrl.filteredItems.length === 0 ? <EmptyMenu t={ctrl.t} /> : null}
          {ctrl.catalog.categories.map((cat) => {
            const items = ctrl.filteredItems.filter((i) => i.category?.id === cat.id)
            if (!items.length) return null
            return (
              <section key={cat.id} id={`cat-${cat.slug}`} data-cat={cat.slug}>
                <header className="ker-section-head">
                  <h2>{cat.name}</h2>
                  {cat.description ? <p>{cat.description}</p> : null}
                </header>
                <div className="ker-grid">
                  {items.map((item) => (
                    <KerCard key={item.id} item={item} ctrl={ctrl} />
                  ))}
                </div>
              </section>
            )
          })}
          {ctrl.filteredItems.some((i) => !i.category) ? (
            <div className="ker-grid">
              {ctrl.filteredItems
                .filter((i) => !i.category)
                .map((item) => (
                  <KerCard key={item.id} item={item} ctrl={ctrl} />
                ))}
            </div>
          ) : null}
        </div>

        <nav className="ker-dock" aria-label={ctrl.t("nav_menu")}>
          <Link href={`/catalogue${keepQuery(ctrl.qs)}`} aria-label={ctrl.t("nav_menu")} data-on="true">
            <Home className="size-5" />
          </Link>
          <CartButton ctrl={ctrl} />
          <Link href="/about" aria-label={ctrl.t("nav_about")}>
            <Store className="size-5" />
          </Link>
        </nav>
      </div>
    </CafeShell>
  )
}

function KerCard({ item, ctrl }: { item: CatalogItem; ctrl: CatalogueController }) {
  const sold = soldLabel(ctrl, item)
  const was = ctrl.wasOf(item)
  return (
    <Link {...pickProps(ctrl, item)} className={cn("ker-card", item.is_sold_out && "is-sold")} data-reveal>
      <ItemMedia item={item} className="ker-card-media" stamp={sold} />
      <div className="ker-card-body">
        <h3>{item.name}</h3>
        {item.description ? <p>{item.description}</p> : null}
        <div className="ker-card-foot">
          <span className="ker-price">
            {was ? <s>{was}</s> : null}
            {ctrl.priceOf(item)}
          </span>
          <span className="ker-plus" aria-hidden="true">
            <Plus className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  )
}
