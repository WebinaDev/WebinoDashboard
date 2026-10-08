"use client"

import Link from "next/link"
import { Flame, Plus, Search, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CatalogItem } from "../../types"
import { offPercent, useCatalogueController, type CatalogueController } from "../../lib/useCatalogueController"
import { useScrollSpy } from "../../lib/useScrollSpy"
import { digits, initialOf, localizedField } from "../../lib/helpers"
import { CafeShell, CartButton, EmptyMenu, ItemMedia, SchemeCartTools, pickProps, soldLabel } from "../shared"
import "./mash.css"

type Props = Parameters<typeof useCatalogueController>[0]

function ArchMark() {
  return (
    <svg viewBox="0 0 64 44" className="mash-arch" aria-hidden="true">
      <path d="M4 42V24C4 10 10 4 18 4s14 6 14 20c0-14 6-20 14-20s14 6 14 20v18" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    </svg>
  )
}

export function MashCatalogue(props: Props) {
  const ctrl = useCatalogueController(props)
  const groups = ctrl.catalog.categories
    .map((cat) => ({ cat, items: ctrl.filteredItems.filter((i) => i.category?.id === cat.id) }))
    .filter((g) => g.items.length > 0)
  const spy = useScrollSpy(groups.map((g) => g.cat.slug), 76)
  const tagline = ctrl.venue ? localizedField(ctrl.locale, ctrl.venue.venue.tagline_fa, ctrl.venue.venue.tagline_en) : null
  const deals = [...ctrl.discounted, ...ctrl.featured.filter((i) => offPercent(i) === 0)].slice(0, 6)
  const loose = ctrl.filteredItems.filter((i) => !i.category)

  return (
    <CafeShell ctrl={ctrl}>
      <div className="cafe-frame mash-frame">
        <header className="mash-top">
          <span className="mash-brand">
            <ArchMark />
            <strong>{ctrl.venueName || ctrl.t("catalogue_title")}</strong>
          </span>
          <SchemeCartTools ctrl={ctrl} cart="none" />
        </header>

        <section className="mash-hero" style={ctrl.heroImage ? { backgroundImage: `url(${ctrl.heroImage})` } : undefined}>
          <div className="mash-hero-shade">
            <span className={cn("mash-open", ctrl.ordering?.is_open === false && "is-closed")}>
              <Zap className="size-3.5" />
              {ctrl.ordering?.is_open === false ? ctrl.t("status_closed") : ctrl.t("accepting_orders")}
            </span>
            <h1>{ctrl.venueName || ctrl.t("catalogue_title")}</h1>
            {tagline ? <p>{tagline}</p> : null}
            <div className="mash-hero-chips">
              {ctrl.ordering?.prep_minutes ? (
                <span>{ctrl.t("prep_minutes", { count: digits(ctrl.ordering.prep_minutes, ctrl.locale) })}</span>
              ) : null}
              {ctrl.tableNumber ? <span>{ctrl.t("table_label", { number: digits(ctrl.tableNumber, ctrl.locale) })}</span> : null}
            </div>
          </div>
          <ArchMark />
        </section>

        {deals.length > 0 && !ctrl.query ? (
          <section className="mash-deals" aria-label={ctrl.t("deal_banner")}>
            {deals.map((item, index) => (
              <Link key={item.id} {...pickProps(ctrl, item)} className={cn("mash-deal", index === 0 && "is-lead")}>
                <div className="mash-deal-copy">
                  <span className="mash-deal-kicker">
                    <Flame className="size-3.5" />
                    {offPercent(item) > 0
                      ? ctrl.t("discount_percent", { percent: digits(offPercent(item), ctrl.locale) })
                      : ctrl.t("deal_banner")}
                  </span>
                  <h3>{item.name}</h3>
                  <span className="mash-deal-price">{ctrl.priceOf(item)}</span>
                </div>
                <ItemMedia item={item} className="mash-deal-media" />
              </Link>
            ))}
          </section>
        ) : null}

        {ctrl.menu.show_search ? (
          <div className="mash-search">
            <Search className="size-5" />
            <input
              value={ctrl.query}
              onChange={(e) => ctrl.setQuery(e.target.value)}
              placeholder={ctrl.t("search_placeholder")}
              aria-label={ctrl.t("search_placeholder")}
            />
          </div>
        ) : null}

        {ctrl.ordering?.accepting_orders === false ? <p className="cafe-notice">{ctrl.t("orders_paused")}</p> : null}

        <div className="mash-body">
          {ctrl.menu.show_category_bar && groups.length > 0 ? (
            <nav className="mash-rail" ref={spy.navRef as unknown as React.RefObject<HTMLElement>} aria-label={ctrl.t("categories_heading")}>
              {groups.map(({ cat }) => (
                <button
                  key={cat.id}
                  type="button"
                  data-slug={cat.slug}
                  data-on={spy.active === cat.slug ? "true" : "false"}
                  onClick={() => spy.scrollTo(cat.slug)}
                >
                  <span className="mash-rail-icon" style={cat.icon_url || cat.image_url ? { backgroundImage: `url(${cat.icon_url || cat.image_url})` } : undefined}>
                    {cat.icon_url || cat.image_url ? null : initialOf(cat.name)}
                  </span>
                  <span className="mash-rail-label">{cat.name}</span>
                </button>
              ))}
            </nav>
          ) : null}

          <div className="mash-main">
            {groups.length === 0 && loose.length === 0 ? <EmptyMenu t={ctrl.t} /> : null}
            {groups.map(({ cat, items }) => (
              <section key={cat.id} id={`cat-${cat.slug}`} data-cat={cat.slug} className="mash-section">
                <h2>{cat.name}</h2>
                <div className="mash-grid">
                  {items.map((item) => (
                    <MashCard key={item.id} item={item} ctrl={ctrl} />
                  ))}
                </div>
              </section>
            ))}
            {loose.length > 0 ? (
              <div className="mash-grid">
                {loose.map((item) => (
                  <MashCard key={item.id} item={item} ctrl={ctrl} />
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mash-cartbar">
          <CartButton ctrl={ctrl} variant="bar" />
        </div>
      </div>
    </CafeShell>
  )
}

function MashCard({ item, ctrl }: { item: CatalogItem; ctrl: CatalogueController }) {
  const sold = soldLabel(ctrl, item)
  const was = ctrl.wasOf(item)
  return (
    <Link {...pickProps(ctrl, item)} className={cn("mash-card", item.is_sold_out && "is-sold")} data-reveal>
      <ItemMedia item={item} className="mash-card-media" stamp={sold} />
      {item.is_new ? <span className="mash-sticker">{ctrl.t("badge_new")}</span> : null}
      <div className="mash-card-body">
        <h3>{item.name}</h3>
        {item.description ? <p>{item.description}</p> : null}
        <div className="mash-card-foot">
          <div className="mash-price">
            {was ? <s>{was}</s> : null}
            <strong>{ctrl.priceOf(item)}</strong>
          </div>
          <span className="mash-add" aria-hidden="true">
            <Plus className="size-6" strokeWidth={3} />
          </span>
        </div>
      </div>
    </Link>
  )
}
