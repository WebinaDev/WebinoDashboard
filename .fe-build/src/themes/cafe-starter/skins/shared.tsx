"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { Cake, Coffee, Croissant, CupSoda, Grid2x2, LayoutTemplate, List, Moon, Soup, Sun, Utensils, Wine } from "lucide-react"
import { cn } from "@/lib/utils"
import { CafeCartDrawer } from "../components/CafeCartDrawer"
import { ClipboardList, FileDown } from "lucide-react"
import { peekGuestToken } from "../lib/cart"
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
import { GuestOrdersSheet } from "../components/GuestOrdersSheet"

export function CafeShell({
  ctrl,
  children,
  className,
  statusChip = false,
}: {
  ctrl: CatalogueController
  children: ReactNode
  className?: string
  /** Render the open/closes-soon/next-open chip above the menu contents. */
  statusChip?: boolean
}) {
  const style = ctrl.accent
    ? ({
        ["--cafe-accent" as string]: ctrl.accent,
        ["--c-soft" as string]: `color-mix(in srgb, ${ctrl.accent} 14%, white)`,
        ["--c-line" as string]: `color-mix(in srgb, ${ctrl.accent} 18%, transparent)`,
      } as CSSProperties)
    : undefined
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
      <PhoneGateDialog engagement={ctrl.catalog.engagement} skin={ctrl.skin} scheme={ctrl.scheme} />
      {statusChip ? (
        <div className="cafe-status-bar">
          <OpenStatusChip ctrl={ctrl} />
        </div>
      ) : null}
      {children}
      <ItemSheet ctrl={ctrl} item={ctrl.picked} onClose={() => ctrl.setPicked(null)} />
    </div>
  )
}

/**
 * «سفارش‌های من» button: appears only once this browser has an order to show, so a
 * first-time guest is not asked to prove a phone number before ordering anything.
 */
/**
 * Open-state chip for the menu header. «بسته می‌شود تا …» warns a guest who is still
 * browsing, and when the cafe is shut it says when it opens next instead of a bare «تعطیل».
 */
export function OpenStatusChip({ ctrl, className }: { ctrl: CatalogueController; className?: string }) {
  const ordering = ctrl.ordering
  if (!ordering) return null
  const today = ordering.today
  const closed = ordering.is_open === false || today?.closed === true

  if (closed) {
    return (
      <span className={cn("cafe-status-chip is-closed", className)}>
        <span className="cafe-status-dot" aria-hidden="true" />
        {ctrl.t("status_closed")}
        {today?.next_open ? (
          <span className="cafe-status-extra">
            ·{" "}
            {ctrl.t("opens_next", {
              day: relativeDay(ctrl.locale, today.next_open.day, today.next_open.date, ctrl.t),
              at: digits(today.next_open.at, ctrl.locale),
            })}
          </span>
        ) : null}
      </span>
    )
  }

  return (
    <span className={cn("cafe-status-chip", today?.closes_soon && "is-soon", className)}>
      <span className="cafe-status-dot" aria-hidden="true" />
      {ctrl.t("status_open")}
      {today?.closes_soon && today.today_close ? (
        <span className="cafe-status-extra">
          · {ctrl.t("closes_in", { at: digits(today.today_close, ctrl.locale) })}
        </span>
      ) : null}
    </span>
  )
}

/**
 * «امروز»/«فردا» read far better than a weekday name when the cafe reopens within a day.
 * Comparison is done on the cafe's own Y-m-d string, so no timezone maths is needed.
 */
function relativeDay(
  locale: string,
  day: string,
  date: string | undefined,
  t: (key: string) => string,
): string {
  if (date) {
    const today = new Date()
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    if (date === iso(today)) return t("today")
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (date === iso(tomorrow)) return t("tomorrow")
  }
  return weekdayLabel(locale, day)
}

function weekdayLabel(locale: string, day: string): string {
  const index = WEEKDAY_INDEX[day.toLowerCase()]
  return index == null ? day : new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { weekday: "long" }).format(new Date(2024, 0, 7 + index))
}

const WEEKDAY_INDEX: Record<string, number> = {
  saturday: 6,
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  sat: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
}

export function OrdersButton({ ctrl, label }: { ctrl: CatalogueController; label: string }) {
  const [open, setOpen] = useState(false)
  // Null on the server: the button appears after hydration, so markup never mismatches.
  const [hasGuest, setHasGuest] = useState<boolean | null>(null)
  useEffect(() => {
    setHasGuest(peekGuestToken() !== "")
  }, [])
  if (hasGuest !== true) return null

  return (
    <>
      <button type="button" className="cafe-icon-btn cafe-orders-btn" onClick={() => setOpen(true)} aria-label={label} title={label}>
        <ClipboardList className="size-4" aria-hidden="true" />
      </button>
      <GuestOrdersSheet
        open={open}
        onOpenChange={setOpen}
        skin={ctrl.skin}
        scheme={ctrl.scheme}
        locale={ctrl.locale}
        currency={ctrl.catalog.items[0]?.currency}
        currencyDisplay={ctrl.currencyDisplay}
        orderingStatus={ctrl.ordering?.accepting_orders === false ? "closed" : "open"}
      />
    </>
  )
}


/**
 * «غذای روز» rail: today's featured dish, shown above the full list on every skin so a
 * regular can find the day's plate without scrolling. Hidden when the cafe marks none.
 */
export function DishOfDayRail({ ctrl }: { ctrl: CatalogueController }) {
  if (ctrl.dishOfDay.length === 0) return null
  return (
    <section className="cafe-dish-day" aria-label={ctrl.t("dish_of_day")}>
      <header className="cafe-dish-day-head">
        <span className="cafe-dish-day-badge" aria-hidden="true">
          <Utensils className="size-4" />
        </span>
        <div>
          <h2>{ctrl.t("dish_of_day")}</h2>
          <p>{ctrl.t("dish_of_day_hint")}</p>
        </div>
      </header>
      <div className="cafe-dish-day-row">
        {ctrl.dishOfDay.slice(0, 6).map((item) => (
          <button
            key={item.id}
            type="button"
            className="cafe-dish-day-card"
            onClick={() => ctrl.setPicked(item)}
            aria-label={item.name}
          >
            <ItemMedia item={item} className="cafe-dish-day-media" />
            <span className="cafe-dish-day-name">{item.name}</span>
            <span className="cafe-dish-day-price">{ctrl.priceOf(item)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export function SchemeCartTools({
  ctrl,
  extra,
  cart = "icon",
  orders = true,
}: {
  ctrl: CatalogueController
  extra?: ReactNode
  cart?: "icon" | "pill" | "none"
  /** Show «سفارش‌های من» next to the theme toggle. */
  orders?: boolean
}) {
  return (
    <div className="cafe-tool-cluster">
      <button type="button" className="cafe-icon-btn" onClick={ctrl.toggleScheme} aria-label={ctrl.t("toggle_theme")}>
        {ctrl.scheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
      {orders ? <OrdersButton ctrl={ctrl} label={ctrl.t("my_orders")} /> : null}
      <MenuPdfButton ctrl={ctrl} label={ctrl.t("menu_pdf")} />
      {cart !== "none" ? <CartButton ctrl={ctrl} variant={cart} /> : null}
      {extra}
    </div>
  )
}

/**
 * «منوی PDF»: the same public printable menu the QR poster links to, opened in a new tab
 * so a guest can keep or print it without losing the cart.
 */
export function MenuPdfButton({ ctrl, label }: { ctrl: CatalogueController; label: string }) {
  const [href, setHref] = useState("")
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    const params = new URLSearchParams({ inline: "1" })
    if (ctrl.locale === "en") params.set("lang", "en")
    const query = params.toString()
    setHref(`${base.replace(/\/$/, "")}/api/v1/cafe/menu-pdf${query ? `?${query}` : ""}`)
  }, [ctrl.locale])
  if (!href) return null
  return (
    <a className="cafe-icon-btn" href={href} target="_blank" rel="noreferrer" aria-label={label} title={label} download>
      <FileDown className="size-4" aria-hidden="true" />
    </a>
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
