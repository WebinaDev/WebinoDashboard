"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowDown, CalendarClock, Clock3, AtSign, MapPin, Phone, Plus, Search, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CatalogItem } from "../../types"
import { offPercent, useCatalogueController, type CatalogueController } from "../../lib/useCatalogueController"
import { useScrollSpy } from "../../lib/useScrollSpy"
import { digits, localizedField } from "../../lib/helpers"
import { CafeShell, CartButton, EmptyMenu, ItemMedia, SchemeCartTools, pickProps, soldLabel } from "../shared"
import "./signature.css"

type Props = Parameters<typeof useCatalogueController>[0]

export function SignatureCatalogue(props: Props) {
  const ctrl = useCatalogueController({ ...props, defaultDark: true })
  const [searchOpen, setSearchOpen] = useState(Boolean(props.initialQuery))
  const [ready, setReady] = useState(false)
  const groups = useMemo(
    () =>
      ctrl.catalog.categories
        .map((cat) => ({ cat, items: ctrl.filteredItems.filter((i) => i.category?.id === cat.id) }))
        .filter((g) => g.items.length > 0),
    [ctrl.catalog.categories, ctrl.filteredItems],
  )
  const loose = ctrl.filteredItems.filter((i) => !i.category)
  const spy = useScrollSpy(groups.map((g) => g.cat.slug), 132)

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  const venue = ctrl.venue?.venue
  const tagline = venue ? localizedField(ctrl.locale, venue.tagline_fa, venue.tagline_en) : null
  const about = venue ? localizedField(ctrl.locale, venue.about_fa, venue.about_en) : null
  const address = venue ? localizedField(ctrl.locale, venue.address_fa, venue.address_en) : null
  const picks = (ctrl.featured.length ? ctrl.featured : ctrl.filteredItems.slice(0, 6)).slice(0, 8)
  const open = ctrl.ordering?.is_open !== false
  const name = ctrl.venueName || ctrl.t("catalogue_title")

  return (
    <CafeShell ctrl={ctrl} className={cn(ready && "is-ready")}>
      <section className="sig-hero">
        <div className="sig-hero-media" style={ctrl.heroImage ? { backgroundImage: `url(${ctrl.heroImage})` } : undefined} />
        <div className="sig-hero-grain" aria-hidden="true" />
        <div className="sig-hero-top">
          <span className="sig-monogram" aria-hidden="true">
            {ctrl.logoText}
          </span>
          <SchemeCartTools ctrl={ctrl} cart="none" />
        </div>
        <div className="sig-hero-copy">
          <span className={cn("sig-status", !open && "is-closed")}>
            <i aria-hidden="true" />
            {open ? ctrl.t("status_open") : ctrl.t("status_closed")}
            {ctrl.ordering?.prep_minutes ? (
              <>
                <b aria-hidden="true">·</b>
                {ctrl.t("prep_minutes", { count: digits(ctrl.ordering.prep_minutes, ctrl.locale) })}
              </>
            ) : null}
          </span>
          <h1>{name}</h1>
          {tagline ? <p className="sig-tagline">{tagline}</p> : null}
          <div className="sig-hero-actions">
            <button
              type="button"
              className="sig-btn is-primary"
              onClick={() => document.getElementById("sig-menu")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              {ctrl.t("scroll_to_menu")}
              <ArrowDown className="size-4" />
            </button>
            <Link href="/reservations" className="sig-btn is-ghost">
              <CalendarClock className="size-4" />
              {ctrl.t("reservations_cta")}
            </Link>
          </div>
          <dl className="sig-stats">
            <div>
              <dt>{ctrl.t("menu_label")}</dt>
              <dd>{ctrl.t("items_count", { count: digits(ctrl.catalog.items.length, ctrl.locale) })}</dd>
            </div>
            <div>
              <dt>{ctrl.t("categories_heading")}</dt>
              <dd>{digits(ctrl.catalog.categories.length, ctrl.locale)}</dd>
            </div>
            {ctrl.tableNumber ? (
              <div>
                <dt>{ctrl.t("table_label", { number: "" }).trim()}</dt>
                <dd>{digits(ctrl.tableNumber, ctrl.locale)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
        <span className="sig-hero-cue" aria-hidden="true">
          {ctrl.t("hero_cue")}
        </span>
      </section>

      <div id="sig-menu" className="sig-body">
        <nav className={cn("sig-nav", searchOpen && "is-search")} aria-label={ctrl.t("categories_heading")}>
          {searchOpen ? (
            <label className="sig-search">
              <Search className="size-4" />
              <input
                autoFocus
                value={ctrl.query}
                onChange={(e) => ctrl.setQuery(e.target.value)}
                placeholder={ctrl.t("search_placeholder")}
                aria-label={ctrl.t("search_placeholder")}
              />
              <button
                type="button"
                onClick={() => {
                  ctrl.setQuery("")
                  setSearchOpen(false)
                }}
                aria-label={ctrl.t("close")}
              >
                <X className="size-4" />
              </button>
            </label>
          ) : (
            <>
              {ctrl.menu.show_search ? (
                <button type="button" className="sig-nav-search" onClick={() => setSearchOpen(true)} aria-label={ctrl.t("search_placeholder")}>
                  <Search className="size-4" />
                </button>
              ) : null}
              <div className="sig-nav-track" ref={spy.navRef}>
                {groups.map(({ cat, items }) => (
                  <button
                    key={cat.id}
                    type="button"
                    data-slug={cat.slug}
                    data-on={spy.active === cat.slug ? "true" : "false"}
                    onClick={() => spy.scrollTo(cat.slug)}
                  >
                    {cat.name}
                    <small>{digits(items.length, ctrl.locale)}</small>
                  </button>
                ))}
              </div>
            </>
          )}
        </nav>

        {ctrl.ordering?.accepting_orders === false ? <p className="cafe-notice">{ctrl.t("orders_paused")}</p> : null}

        {picks.length > 0 && !ctrl.query ? (
          <section className="sig-picks">
            <header className="sig-head">
              <Sparkles className="size-4" />
              <h2>{ctrl.t("section_featured")}</h2>
            </header>
            <div className="sig-picks-row">
              {picks.map((item, index) => (
                <Link
                  key={item.id}
                  {...pickProps(ctrl, item)}
                  className="sig-pick"
                  style={{ ["--i" as string]: index } as React.CSSProperties}
                >
                  <ItemMedia item={item} className="sig-pick-media" sizes="(max-width: 640px) 78vw, 340px" />
                  <div className="sig-pick-copy">
                    {offPercent(item) > 0 ? (
                      <span className="sig-chip is-hot">{ctrl.t("discount_percent", { percent: digits(offPercent(item), ctrl.locale) })}</span>
                    ) : item.is_new ? (
                      <span className="sig-chip">{ctrl.t("badge_new")}</span>
                    ) : null}
                    <h3>{item.name}</h3>
                    <span>{ctrl.priceOf(item)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <div className="sig-sections">
          {groups.length === 0 && loose.length === 0 ? <EmptyMenu t={ctrl.t} /> : null}
          {groups.map(({ cat, items }) => (
            <section key={cat.id} id={`cat-${cat.slug}`} data-cat={cat.slug} className="sig-section">
              <header className="sig-section-head">
                <div>
                  <h2>{cat.name}</h2>
                  {cat.description ? <p>{cat.description}</p> : null}
                </div>
                <span>{ctrl.t("items_count", { count: digits(items.length, ctrl.locale) })}</span>
              </header>
              <div className="sig-list">
                {items.map((item) => (
                  <SigCard key={item.id} item={item} ctrl={ctrl} />
                ))}
              </div>
            </section>
          ))}
          {loose.length > 0 ? (
            <div className="sig-list">
              {loose.map((item) => (
                <SigCard key={item.id} item={item} ctrl={ctrl} />
              ))}
            </div>
          ) : null}
        </div>

        <footer className="sig-foot">
          <span className="sig-monogram is-lg" aria-hidden="true">
            {ctrl.logoText}
          </span>
          <h2>{name}</h2>
          {about ? <p className="sig-foot-about">{about}</p> : null}
          <ul>
            {address ? (
              <li>
                <MapPin className="size-4" />
                {venue?.map_url ? <a href={venue.map_url}>{address}</a> : address}
              </li>
            ) : null}
            {venue?.phone ? (
              <li>
                <Phone className="size-4" />
                <a href={`tel:${venue.phone}`} dir="ltr">
                  {digits(venue.phone, ctrl.locale)}
                </a>
              </li>
            ) : null}
            {ctrl.hours?.days?.length ? (
              <li>
                <Clock3 className="size-4" />
                <Link href="/about">{ctrl.t("hours_heading")}</Link>
              </li>
            ) : null}
            {venue?.instagram ? (
              <li>
                <AtSign className="size-4" />
                <a href={venue.instagram.startsWith("http") ? venue.instagram : `https://instagram.com/${venue.instagram.replace(/^@/, "")}`} dir="ltr">
                  {venue.instagram}
                </a>
              </li>
            ) : null}
          </ul>
          <p className="sig-powered">{ctrl.t("footer_powered")}</p>
        </footer>
      </div>

      <div className="sig-cart-float">
        <CartButton ctrl={ctrl} variant="pill" />
      </div>
    </CafeShell>
  )
}

function SigCard({ item, ctrl }: { item: CatalogItem; ctrl: CatalogueController }) {
  const sold = soldLabel(ctrl, item)
  const was = ctrl.wasOf(item)
  const off = offPercent(item)
  return (
    <Link {...pickProps(ctrl, item)} className={cn("sig-card", item.is_sold_out && "is-sold")} data-reveal>
      <div className="sig-card-copy">
        <div className="sig-card-tags">
          {item.is_featured ? <span className="sig-chip">{ctrl.t("badge_featured")}</span> : null}
          {item.is_new ? <span className="sig-chip">{ctrl.t("badge_new")}</span> : null}
          {off > 0 ? <span className="sig-chip is-hot">{ctrl.t("discount_percent", { percent: digits(off, ctrl.locale) })}</span> : null}
        </div>
        <h3>{item.name}</h3>
        {item.description ? <p>{item.description}</p> : null}
        <div className="sig-card-price">
          <strong>{ctrl.priceOf(item)}</strong>
          {was ? <s>{was}</s> : null}
        </div>
      </div>
      <div className="sig-card-visual">
        <ItemMedia item={item} className="sig-card-media" stamp={sold} sizes="132px" />
        {!sold ? (
          <span className="sig-card-add" aria-hidden="true">
            <Plus className="size-4" strokeWidth={2.5} />
          </span>
        ) : null}
      </div>
    </Link>
  )
}
