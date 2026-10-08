"use client"

import Link from "next/link"
import { useState } from "react"
import { Check, Minus, Plus, Search, ShoppingBasket } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CatalogItem } from "../../types"
import { useAddToCart } from "../../lib/cart"
import { offPercent, useCatalogueController, type CatalogueController } from "../../lib/useCatalogueController"
import { digits, initialOf, localizedField } from "../../lib/helpers"
import { CafeShell, CartButton, EmptyMenu, ItemMedia, SchemeCartTools, pickProps } from "../shared"
import "./super.css"

type Props = Parameters<typeof useCatalogueController>[0]

export function SuperCatalogue(props: Props) {
  const ctrl = useCatalogueController(props)
  const tagline = ctrl.venue ? localizedField(ctrl.locale, ctrl.venue.venue.tagline_fa, ctrl.venue.venue.tagline_en) : null
  const groups = ctrl.catalog.categories
    .map((cat) => ({ cat, items: ctrl.filteredItems.filter((i) => i.category?.id === cat.id) }))
    .filter((g) => g.items.length > 0)
  const loose = ctrl.filteredItems.filter((i) => !i.category)

  return (
    <CafeShell ctrl={ctrl}>
      <div className="cafe-frame sup-frame">
        <header className="sup-head">
          <div className="sup-head-shapes" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="sup-head-row">
            <div className="sup-badge">
              <ShoppingBasket className="size-6" />
              <span>{ctrl.ordering?.is_open === false ? ctrl.t("status_closed") : ctrl.t("accepting_orders")}</span>
            </div>
            <div className="sup-title">
              <p>{tagline || ctrl.t("super_market")}</p>
              <h1>{ctrl.venueName || ctrl.t("catalogue_title")}</h1>
            </div>
            <SchemeCartTools ctrl={ctrl} cart="pill" />
          </div>
          {ctrl.menu.show_search ? (
            <label className="sup-search">
              <Search className="size-5" />
              <input
                value={ctrl.query}
                onChange={(e) => ctrl.setQuery(e.target.value)}
                placeholder={ctrl.t("search_placeholder")}
                aria-label={ctrl.t("search_placeholder")}
              />
            </label>
          ) : null}
        </header>

        {ctrl.menu.show_category_bar && ctrl.catalog.categories.length > 0 ? (
          <nav className="sup-tiles" aria-label={ctrl.t("categories_heading")}>
            {ctrl.catalog.categories.map((cat) => {
              const img = cat.cover_image_url || cat.image_url || cat.icon_url
              const count = ctrl.catalog.items.filter((i) => i.category?.id === cat.id).length
              return (
                <button
                  key={cat.id}
                  type="button"
                  data-on={ctrl.activeCategory === cat.slug ? "true" : "false"}
                  onClick={() => ctrl.setActiveCategory(ctrl.activeCategory === cat.slug ? null : cat.slug)}
                >
                  <span className="sup-tile-img" style={img ? { backgroundImage: `url(${img})` } : undefined}>
                    {img ? null : initialOf(cat.name)}
                  </span>
                  <span className="sup-tile-name">{cat.name}</span>
                  <span className="sup-tile-count">{ctrl.t("items_count", { count: digits(count, ctrl.locale) })}</span>
                </button>
              )
            })}
          </nav>
        ) : null}

        {ctrl.ordering?.accepting_orders === false ? <p className="cafe-notice">{ctrl.t("orders_paused")}</p> : null}

        {ctrl.discounted.length > 0 && !ctrl.activeCategory && !ctrl.query ? (
          <section className="sup-section sup-offers">
            <header>
              <h2>{ctrl.t("section_discounted")}</h2>
            </header>
            <div className="sup-row">
              {ctrl.discounted.slice(0, 10).map((item) => (
                <SupCard key={item.id} item={item} ctrl={ctrl} />
              ))}
            </div>
          </section>
        ) : null}

        {groups.length === 0 && loose.length === 0 ? <EmptyMenu t={ctrl.t} /> : null}
        {groups.map(({ cat, items }) => (
          <section key={cat.id} id={`cat-${cat.slug}`} data-cat={cat.slug} className="sup-section">
            <header>
              <h2>{cat.name}</h2>
              <span>{ctrl.t("items_count", { count: digits(items.length, ctrl.locale) })}</span>
            </header>
            <div className="sup-grid">
              {items.map((item) => (
                <SupCard key={item.id} item={item} ctrl={ctrl} />
              ))}
            </div>
          </section>
        ))}
        {loose.length > 0 ? (
          <div className="sup-grid">
            {loose.map((item) => (
              <SupCard key={item.id} item={item} ctrl={ctrl} />
            ))}
          </div>
        ) : null}

        <div className="sup-cartbar">
          <CartButton ctrl={ctrl} variant="bar" />
        </div>
      </div>
    </CafeShell>
  )
}

function SupCard({ item, ctrl }: { item: CatalogItem; ctrl: CatalogueController }) {
  const [qty, setQty] = useState(1)
  const [done, setDone] = useState(false)
  const add = useAddToCart(ctrl.tableNumber, ctrl.branchSlug)
  const off = offPercent(item)
  const was = ctrl.wasOf(item)
  const needsChoice = (item.modifiers ?? []).some((m) => m.is_required) || (item.variants?.length ?? 0) > 1
  const blocked = item.is_sold_out || !item.is_available || ctrl.ordering?.accepting_orders === false
  const saved = off > 0 ? ctrl.moneyOf(item.price_minor - item.discounted_price_minor) : null

  function quickAdd(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (needsChoice) {
      ctrl.setPicked(item)
      return
    }
    add.mutate(
      { productId: item.id, quantity: qty, optionIds: [], variantId: null },
      {
        onSuccess: () => {
          setDone(true)
          setQty(1)
          window.setTimeout(() => setDone(false), 1200)
        },
      },
    )
  }

  return (
    <article className={cn("sup-card", item.is_sold_out && "is-sold")} data-reveal>
      <Link {...pickProps(ctrl, item)} className="sup-card-link">
        <ItemMedia item={item} className="sup-card-media" />
        {off > 0 ? <span className="sup-off">{digits(off, ctrl.locale)}٪</span> : null}
        {item.is_sold_out ? <span className="sup-gone">{ctrl.t("stock_gone")}</span> : null}
        <h3>{item.name}</h3>
      </Link>
      <div className="sup-meta">
        <span className={cn("sup-stock", item.is_sold_out && "is-out")}>
          {item.is_sold_out ? ctrl.t("stock_gone") : ctrl.t("in_stock")}
        </span>
        {saved ? <span className="sup-save">{ctrl.t("save_amount", { amount: saved })}</span> : null}
      </div>
      <div className="sup-price">
        {was ? <s>{was}</s> : null}
        <strong>{ctrl.priceOf(item)}</strong>
      </div>
      <div className="sup-actions">
        {!needsChoice && !blocked ? (
          <div className="sup-qty" aria-label={ctrl.t("qty")}>
            <button type="button" onClick={() => setQty((q) => Math.min(50, q + 1))} aria-label={ctrl.t("quick_add")}>
              <Plus className="size-3.5" />
            </button>
            <span>{digits(qty, ctrl.locale)}</span>
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label={ctrl.t("qty")} disabled={qty <= 1}>
              <Minus className="size-3.5" />
            </button>
          </div>
        ) : null}
        <button type="button" className={cn("sup-add", done && "is-done")} disabled={blocked || add.isPending} onClick={quickAdd}>
          {done ? <Check className="size-4" /> : blocked ? ctrl.t("stock_gone") : needsChoice ? ctrl.t("select_cta") : ctrl.t("add_to_cart")}
        </button>
      </div>
    </article>
  )
}
