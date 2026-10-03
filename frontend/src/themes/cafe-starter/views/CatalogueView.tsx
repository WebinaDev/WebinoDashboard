"use client"

import Image from "next/image"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { Cake, ChevronDown, Clock3, Coffee, Croissant, CupSoda, Grid2x2, Home, LayoutTemplate, List, MapPin, Moon, Search, Share2, Soup, Store, Sun, Utensils, Wine } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toLocaleDigits } from "@/lib/locale"
import { formatShopPrice, type ShopCurrencyDisplay } from "@/lib/format"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"

import { CafeCartDrawer } from "../components/CafeCartDrawer"
import { PhoneGateDialog } from "../components/PhoneGateDialog"
import { cafeSkinLayout, resolveCafeSkin } from "../skin"
import "../menu.css"
import type {
  CafeMenuSettings,
  CafeVenuePayload,
  CatalogCategory,
  CatalogItem,
  CatalogPayload,
  MenuBanner,
} from "../types"

type ViewMode = "grid" | "list" | "cover"

type Props = {
  catalog: CatalogPayload
  venue: CafeVenuePayload | null
  initialQuery?: string
  tableNumber?: string | null
  branchSlug?: string | null
  menuSlug?: string | null
  activeThemeSlug?: string | null
}

const SCHEME_KEY = "cafe_menu_scheme"

function money(amount: number, currency: string, display: ShopCurrencyDisplay | null | undefined, locale: string) {
  const formatted = formatShopPrice(amount / 10, { ...display, currency: display?.currency || currency }, currency)
  return toLocaleDigits(formatted, locale === "fa" ? "fa" : "en")
}

function localizedField(locale: string, fa?: string | null, en?: string | null): string | null {
  const value = locale === "fa" ? fa ?? en : en ?? fa
  return value?.trim() ? value : null
}

function keepQuery(params: Record<string, string | null | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}

export function CatalogueView({ catalog, venue, initialQuery = "", tableNumber, branchSlug, menuSlug, activeThemeSlug }: Props) {
  const t = useTranslations("cafe_starter")
  const locale = useLocale()
  const menu: CafeMenuSettings = {
    default_view: "grid",
    show_search: true,
    show_category_bar: true,
    show_new_badge: true,
    ...(venue?.menu ?? {}),
  }
  const [view, setView] = useState<ViewMode>(menu.default_view === "list" || menu.default_view === "cover" ? menu.default_view : "grid")
  const [query, setQuery] = useState(initialQuery)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [scheme, setScheme] = useState<"light" | "dark">("light")
  const [activeOrder, setActiveOrder] = useState<{ number: string | number; kitchen_status: string } | null>(null)
  const [openMenuId, setOpenMenuId] = useState<number | null>(catalog.menus?.[0]?.id ?? null)

  useEffect(() => {
    const stored = localStorage.getItem(SCHEME_KEY)
    if (stored === "dark" || stored === "light") setScheme(stored)
  }, [])

  useEffect(() => {
    const token = localStorage.getItem("cafe_guest_token")
    if (!token) return
    let stop = false
    api<{ number: string | number; kitchen_status: string } | null>(
      `/api/v1/public/cafe/order-status?guest_token=${encodeURIComponent(token)}`,
    )
      .then((row) => {
        if (!stop && row) setActiveOrder(row)
      })
      .catch(() => undefined)
    return () => {
      stop = true
    }
  }, [])

  const skin = resolveCafeSkin(activeThemeSlug ?? venue?.tenant.active_theme_slug)
  const layout = cafeSkinLayout(skin)
  const ordering = venue?.ordering
  const hours = catalog.hours ?? venue?.hours
  const accent = menu.accent_color || undefined
  const banners = (catalog.banners ?? []).filter((b) => b.is_active !== false).slice(0, 3)
  const heroImage =
    banners[0]?.image_url ||
    venue?.gallery?.images?.[0]?.url ||
    catalog.items.find((item) => item.cover_image_url || item.image_url)?.cover_image_url ||
    catalog.items.find((item) => item.image_url)?.image_url ||
    null
  const currencyDisplay = catalog.currency_display
  const tagline = venue ? localizedField(locale, venue.venue.tagline_fa, venue.venue.tagline_en) : null
  const address = venue ? localizedField(locale, venue.venue.address_fa, venue.venue.address_en) : null
  const venueName = venue?.tenant.name

  const filteredItems = useMemo(() => {
    let items = catalog.items
    if (activeCategory) items = items.filter((item) => item.category?.slug === activeCategory)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      items = items.filter((item) => item.name.toLowerCase().includes(q) || (item.description ?? "").toLowerCase().includes(q))
    }
    return items
  }, [catalog.items, activeCategory, query])

  const featured = filteredItems.filter((i) => i.is_featured)
  const discounted = filteredItems.filter((i) => i.discount_percent > 0)
  const newest = menu.show_new_badge ? filteredItems.filter((i) => i.is_new) : []
  const qs = { table: tableNumber, branch: branchSlug ?? null, menu: menuSlug }

  function toggleScheme() {
    const next = scheme === "dark" ? "light" : "dark"
    setScheme(next)
    localStorage.setItem(SCHEME_KEY, next)
  }

  return (
    <div
      className="cafe-shell"
      data-skin={skin}
      data-layout={layout}
      data-scheme={scheme}
      data-season={menu.seasonal_theme && menu.seasonal_theme !== "none" ? menu.seasonal_theme : undefined}
      data-font={menu.font_preset || "sans"}
      style={accent ? ({ ["--cafe-accent" as string]: accent } as React.CSSProperties) : undefined}
    >
      <PhoneGateDialog engagement={catalog.engagement} />
      <div className="cafe-frame px-4 py-5">
        {skin === "cafe-menew" ? (
          <section className="cafe-cine" style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}>
            <div className="cafe-cine-shade">
              <p className="cafe-kicker">{t("menu_kicker")}</p>
              <h1>{venueName || t("catalogue_title")}</h1>
              {tagline ? <p>{tagline}</p> : null}
              <p>{t("browse_hint")}</p>
            </div>
          </section>
        ) : (
          <section className="cafe-hero">
            {skin !== "cafe-super" && heroImage ? (
              <div className="cafe-hero-photo" style={{ backgroundImage: `url(${heroImage})` }}>
                <span className="cafe-logo-badge">{(venueName || t("catalogue_title")).slice(0, 1)}</span>
                {skin === "cafe-mash-donald" ? <span className="cafe-arches" aria-hidden="true"><i /><i /></span> : null}
                {skin === "cafe-kerase" ? <span className="cafe-cup" aria-hidden="true" /> : null}
              </div>
            ) : null}
            {skin === "cafe-super" ? (
              <div className="cafe-market-head">
                <div className="cafe-market-badge">{ordering?.is_open === false ? t("status_closed") : t("accepting_orders")}</div>
                <div>
                  <p className="text-xs font-bold" style={{ color: "var(--c-muted)" }}>{t("super_market")}</p>
                  <h1 className="text-2xl font-black">{venueName || t("catalogue_title")}</h1>
                </div>
              </div>
            ) : (
              <div className={heroImage ? "pt-6" : undefined}>
                <p className={ordering?.is_open === false ? undefined : "cafe-open-line"}>
                  {ordering?.is_open === false ? t("status_closed") : t("accepting_orders")}
                </p>
                <h1 className="mt-1 text-3xl font-black tracking-tight">{venueName || t("catalogue_title")}</h1>
                {tagline ? <p className="mt-2 text-sm" style={{ color: "var(--c-muted)" }}>{tagline}</p> : null}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {ordering?.prep_minutes ? <Badge variant="outline">{t("prep_minutes", { count: ordering.prep_minutes })}</Badge> : null}
              {tableNumber ? <Badge variant="outline">{t("table_label", { number: toLocaleDigits(tableNumber, locale === "fa" ? "fa" : "en") })}</Badge> : null}
              {activeOrder ? (
                <Badge>{t("active_order", { number: String(activeOrder.number), status: t(`kitchen.${activeOrder.kitchen_status}`) })}</Badge>
              ) : null}
            </div>
            <div className="cafe-meta-row">
              <Link href="/about" className="cafe-meta-pill">{t("info_reviews")}</Link>
              {ordering ? (
                <span className="cafe-meta-pill">{t("delivery_fee", { amount: money(ordering.delivery_fee_minor, catalog.items[0]?.currency || "IRT", currencyDisplay, locale) })}</span>
              ) : null}
              {address ? <span className="cafe-meta-pill"><MapPin className="me-1 inline size-3.5" />{address}</span> : null}
              {hours?.days?.length ? <span className="cafe-meta-pill"><Clock3 className="me-1 inline size-3.5" />{t("hours_hint")}</span> : null}
            </div>
            <div className="cafe-hero-actions mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm"><Link href={`/catalogue${keepQuery(qs)}`}>{t("order_cta")}</Link></Button>
              <Button asChild size="sm" variant="outline"><Link href="/reservations">{t("reservations_cta")}</Link></Button>
              {venue?.venue.whatsapp_url ? <Button asChild size="sm" variant="outline"><a href={venue.venue.whatsapp_url}>{t("whatsapp")}</a></Button> : null}
              {venue?.venue.telegram_url ? <Button asChild size="sm" variant="outline"><a href={venue.venue.telegram_url}>{t("telegram")}</a></Button> : null}
              {venue?.venue.bill_pay_url ? <Button asChild size="sm" variant="outline"><a href={venue.venue.bill_pay_url}>{t("bill_pay")}</a></Button> : null}
              {venue?.venue.map_url ? <Button asChild size="sm" variant="outline"><a href={venue.venue.map_url}>{t("map_cta")}</a></Button> : null}
              {menu.header_cta_url ? (
                <Button asChild size="sm"><a href={menu.header_cta_url}>{localizedField(locale, menu.header_cta_label_fa, menu.header_cta_label_en) || t("order_cta")}</a></Button>
              ) : null}
            </div>
            {menu.teaser_video_url ? (
              <video src={menu.teaser_video_url} controls playsInline className="mt-4 h-36 w-full rounded-2xl bg-black object-cover" />
            ) : null}
          </section>
        )}

        {banners.length > 0 ? (
          <section className="cafe-banners mt-4 flex snap-x gap-3 overflow-x-auto pb-1">
            {banners.map((banner) => (
              <BannerCard key={banner.id} banner={banner} locale={locale} t={t} />
            ))}
          </section>
        ) : null}

        {(catalog.menus?.length ?? 0) > 1 ? (
          <div className="cafe-menu-switch mt-4 flex gap-2 overflow-x-auto">
            <Link className="cafe-chip" data-on={menuSlug ? "false" : "true"} href={`/catalogue${keepQuery({ ...qs, menu: null })}`}>{t("all_menus")}</Link>
            {catalog.menus!.map((m) => (
              <Link key={m.id} className="cafe-chip" data-on={menuSlug === m.slug ? "true" : "false"} href={`/catalogue${keepQuery({ ...qs, menu: m.slug })}`}>
                {m.name}
              </Link>
            ))}
          </div>
        ) : null}
        {menuSlug && catalog.menus?.find((m) => m.slug === menuSlug)?.description ? (
          <p className="mt-2 text-sm" style={{ color: "var(--c-muted)" }}>{catalog.menus.find((m) => m.slug === menuSlug)?.description}</p>
        ) : null}

        {(catalog.branches?.length ?? 0) > 0 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            <Link className="cafe-chip" data-on={branchSlug ? "false" : "true"} href={`/catalogue${keepQuery({ ...qs, branch: null })}`}>{t("all_branches")}</Link>
            {catalog.branches!.map((b) => (
              <Link key={b.id} className="cafe-chip" data-on={branchSlug === b.slug ? "true" : "false"} href={`/catalogue${keepQuery({ ...qs, branch: b.slug })}`}>
                {localizedField(locale, b.name_fa, b.name_en)}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="cafe-stage mt-4">
        <div className="cafe-tools flex flex-col gap-3 sm:flex-row sm:items-center">
          {menu.show_search ? (
            <div className="cafe-search relative flex-1">
              <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 opacity-60" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search_placeholder")} className="ps-9" aria-label={t("search_placeholder")} />
            </div>
          ) : <div className="flex-1" />}
          <div className="cafe-views flex flex-col items-stretch gap-1">
            {skin === "cafe-menew" ? <span className="cafe-view-label">{t("view_modes")}</span> : null}
            <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={toggleScheme} aria-label={t("toggle_theme")}>
              {scheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <CafeCartDrawer tableNumber={tableNumber} branchSlug={branchSlug} ordering={ordering} currency={catalog.items[0]?.currency} currencyDisplay={currencyDisplay} />
            <Button type="button" size="sm" variant={view === "grid" ? "default" : "outline"} onClick={() => setView("grid")} aria-label={t("view_grid")}><Grid2x2 className="size-4" /></Button>
            <Button type="button" size="sm" variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")} aria-label={t("view_list")}><List className="size-4" /></Button>
            <Button type="button" size="sm" variant={view === "cover" ? "default" : "outline"} onClick={() => setView("cover")} aria-label={t("view_cover")}><LayoutTemplate className="size-4" /></Button>
            </div>
          </div>
        </div>

        {menu.show_category_bar && catalog.categories.length > 0 ? (
          <div className="cafe-cats sticky top-0 z-20 -mx-4 mt-4 bg-[var(--c-bg)]/90 px-4 py-3 backdrop-blur">
            <button type="button" className="cafe-chip" data-on={activeCategory === null ? "true" : "false"} onClick={() => setActiveCategory(null)}>
              <span className="cafe-cat-icon"><span>{t("all_categories").slice(0, 1)}</span></span>
              <span className="cafe-cat-label">{t("all_categories")}</span>
            </button>
            {catalog.categories.map((cat) => (
              <button key={cat.id} type="button" className="cafe-chip" data-on={activeCategory === cat.slug ? "true" : "false"} onClick={() => setActiveCategory(cat.slug)}>
                <span className="cafe-cat-icon">
                  {cat.icon_url || cat.image_url ? <Image src={(cat.icon_url || cat.image_url) as string} alt="" width={48} height={48} className="h-full w-full object-cover" unoptimized /> : <span>{cat.name.slice(0, 1)}</span>}
                </span>
                <span className="cafe-cat-label">{cat.name}</span>
              </button>
            ))}
          </div>
        ) : null}

        {ordering?.accepting_orders === false ? (
          <p className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "var(--c-line)" }}>{t("orders_paused")}</p>
        ) : null}

        <div className="cafe-stage-main">
        {featured.length > 0 ? <SmartRow title={t("section_featured")} items={featured} view={view} locale={locale} menu={menu} t={t} currencyDisplay={currencyDisplay} qs={qs} skin={skin} /> : null}
        {discounted.length > 0 ? <SmartRow title={t("section_discounted")} items={discounted} view="list" locale={locale} menu={menu} t={t} currencyDisplay={currencyDisplay} qs={qs} skin={skin} /> : null}
        {newest.length > 0 ? <SmartRow title={t("section_new")} items={newest} view="list" locale={locale} menu={menu} t={t} currencyDisplay={currencyDisplay} qs={qs} skin={skin} /> : null}

        <MenuPanels
          skin={skin}
          menus={catalog.menus}
          categories={catalog.categories}
          items={filteredItems}
          openMenuId={openMenuId}
          onToggleMenu={(id) => setOpenMenuId((current) => (current === id ? null : id))}
          view={view}
          locale={locale}
          menu={menu}
          t={t}
          activeCategory={activeCategory}
          currencyDisplay={currencyDisplay}
          qs={qs}
        />
        </div>
        </div>

        {venue?.venue.mini_site_enabled !== false ? (
          <div className="mt-10 flex justify-center gap-3">
            <Button asChild variant="outline"><Link href="/about">{t("about_cta")}</Link></Button>
          </div>
        ) : null}
        {layout === "phone" ? (
          <nav className="cafe-dock" aria-label={t("nav_menu")}>
            <Link href={`/catalogue${keepQuery(qs)}`} aria-label={t("nav_menu")}><Home className="size-5" /></Link>
            <Link href="/about" aria-label={t("nav_about")}><Store className="size-5" /></Link>
          </nav>
        ) : null}
      </div>
    </div>
  )
}


function menuKind(menu: { name: string; slug: string; menu_type?: string | null }): "bar" | "cafe" | "restaurant" {
  const blob = `${menu.name} ${menu.slug} ${menu.menu_type ?? ""}`.toLowerCase()
  if (blob.includes("بار") || blob.includes("bar")) return "bar"
  if (blob.includes("کافه") || blob.includes("cafe") || blob.includes("coffee")) return "cafe"
  return "restaurant"
}

function MenuGlyphs({ kind }: { kind: "bar" | "cafe" | "restaurant" }) {
  const icons = kind === "bar" ? [Wine, CupSoda] : kind === "cafe" ? [Coffee, Croissant, Cake] : [Utensils, Soup, Cake]
  return (
    <span className="cafe-acc-glyphs" aria-hidden="true">
      {icons.map((Icon, index) => <Icon key={index} className="size-5" />)}
    </span>
  )
}


function MenuPanels(props: {
  skin: string
  menus?: CatalogPayload["menus"]
  categories: CatalogCategory[]
  items: CatalogItem[]
  openMenuId: number | null
  onToggleMenu: (id: number) => void
  view: ViewMode
  locale: string
  menu: CafeMenuSettings
  t: ReturnType<typeof useTranslations>
  activeCategory: string | null
  currencyDisplay?: ShopCurrencyDisplay | null
  qs: Record<string, string | null | undefined>
}) {
  const menus = props.menus ?? []
  const tagged = props.items.some((item) => item.menu_id != null)
  if (props.skin === "cafe-menew" && menus.length > 0) {
    return (
      <div className="cafe-acc">
        <p className="text-end text-sm font-bold">{props.t("categories_heading")}</p>
        {menus.map((entry) => {
          const kind = menuKind(entry)
          const scoped = props.items.filter((item) => item.menu_id === entry.id)
          const rows = scoped.length > 0 ? scoped : !tagged && menus[0]?.id === entry.id ? props.items : []
          const open = props.openMenuId === entry.id
          const blurb = entry.description || props.t(kind === "bar" ? "menu_blurb_bar" : kind === "cafe" ? "menu_blurb_cafe" : "menu_blurb_restaurant")
          return (
            <section key={entry.id}>
              <button type="button" className="cafe-acc-head" aria-expanded={open} onClick={() => props.onToggleMenu(entry.id)}>
                <span className="cafe-acc-copy">
                  <strong>{entry.name}</strong>
                  <small>{blurb}</small>
                </span>
                <MenuGlyphs kind={kind} />
                <ChevronDown className={cn("size-5 shrink-0 transition", open && "rotate-180")} />
              </button>
              {open ? (
                <div className="cafe-acc-body">
                  {rows.length === 0 ? (
                    <p className="py-8 text-center text-sm" style={{ color: "var(--c-muted)" }}>{props.t("empty_menu")}</p>
                  ) : (
                    <CategorySections
                      categories={props.categories}
                      items={rows}
                      view={props.view}
                      locale={props.locale}
                      menu={props.menu}
                      t={props.t}
                      activeCategory={props.activeCategory}
                      currencyDisplay={props.currencyDisplay}
                      qs={props.qs}
                      skin={props.skin}
                    />
                  )}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>
    )
  }
  if (props.items.length === 0) {
    return <p className="py-16 text-center text-sm" style={{ color: "var(--c-muted)" }}>{props.t("empty_menu")}</p>
  }
  return (
    <CategorySections
      categories={props.categories}
      items={props.items}
      view={props.view}
      locale={props.locale}
      menu={props.menu}
      t={props.t}
      activeCategory={props.activeCategory}
      currencyDisplay={props.currencyDisplay}
      qs={props.qs}
      skin={props.skin}
    />
  )
}

function BannerCard({ banner, locale, t }: { banner: MenuBanner; locale: string; t: (key: string) => string }) {
  const title = localizedField(locale, banner.title_fa, banner.title_en)
  const share = () => {
    const url = banner.link_url || window.location.href
    if (navigator.share) void navigator.share({ title: title || "", url })
    else void navigator.clipboard.writeText(url)
  }
  return (
    <article className="cafe-card relative h-40 w-72 shrink-0 snap-start">
      <Image src={banner.image_url} alt={title ?? ""} fill className="object-cover" unoptimized />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 text-white">
        <div>
          {title ? <p className="font-semibold">{title}</p> : null}
          {banner.link_url ? <a className="text-xs underline" href={banner.link_url}>{t("banner_cta")}</a> : null}
        </div>
        <button type="button" aria-label={t("share_banner")} onClick={share} className="rounded-full bg-white/20 p-2"><Share2 className="size-4" /></button>
      </div>
    </article>
  )
}

function SmartRow(props: {
  title: string
  items: CatalogItem[]
  view: ViewMode
  locale: string
  menu: CafeMenuSettings
  t: ReturnType<typeof useTranslations>
  currencyDisplay?: ShopCurrencyDisplay | null
  qs: Record<string, string | null | undefined>
  skin: string
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-bold">{props.title}</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {props.items.slice(0, 8).map((item) => (
          <div key={`${props.title}-${item.id}`} className="w-64 shrink-0">
            <ItemCard item={item} view="grid" locale={props.locale} menu={props.menu} t={props.t} currencyDisplay={props.currencyDisplay} qs={props.qs} skin={props.skin} />
          </div>
        ))}
      </div>
    </section>
  )
}

function CategorySections(props: {
  categories: CatalogCategory[]
  items: CatalogItem[]
  view: ViewMode
  locale: string
  menu: CafeMenuSettings
  t: ReturnType<typeof useTranslations>
  activeCategory: string | null
  currencyDisplay?: ShopCurrencyDisplay | null
  qs: Record<string, string | null | undefined>
  skin: string
}) {
  const groups = props.categories
    .map((cat) => ({ cat, items: props.items.filter((item) => item.category?.id === cat.id) }))
    .filter((group) => group.items.length > 0)
  const uncategorized = props.items.filter((item) => !item.category)
  return (
    <div className="mt-8 space-y-10">
      {groups.map(({ cat, items }) => (
        <section key={cat.id} id={`cat-${cat.slug}`}>
          <div className="mb-3">
            <h2 className="text-xl font-bold">{cat.name}</h2>
            {cat.description ? <p className="text-sm" style={{ color: "var(--c-muted)" }}>{cat.description}</p> : null}
          </div>
          <ItemGrid items={items} view={(cat.display_mode as ViewMode) || props.view} locale={props.locale} menu={props.menu} t={props.t} currencyDisplay={props.currencyDisplay} qs={props.qs} skin={props.skin} />
        </section>
      ))}
      {uncategorized.length > 0 && !props.activeCategory ? (
        <ItemGrid items={uncategorized} view={props.view} locale={props.locale} menu={props.menu} t={props.t} currencyDisplay={props.currencyDisplay} qs={props.qs} skin={props.skin} />
      ) : null}
    </div>
  )
}

function ItemGrid({ items, view, ...rest }: { items: CatalogItem[]; view: ViewMode } & Omit<Parameters<typeof ItemCard>[0], "item" | "view">) {
  return (
    <div className={cn("cafe-grid", view === "list" ? "is-list" : view === "cover" ? "is-cover" : "is-grid")}>
      {items.map((item) => <ItemCard key={item.id} item={item} view={view} {...rest} />)}
    </div>
  )
}

function ItemCard({
  item,
  view,
  locale,
  menu,
  t,
  currencyDisplay,
  qs,
  skin,
}: {
  item: CatalogItem
  view: ViewMode
  locale: string
  menu: CafeMenuSettings
  t: ReturnType<typeof useTranslations>
  currencyDisplay?: ShopCurrencyDisplay | null
  qs: Record<string, string | null | undefined>
  skin: string
}) {
  const image = item.cover_image_url || item.image_url
  const href = `/catalogue/${item.slug}${keepQuery(qs)}`
  const price = money(item.discounted_price_minor, item.currency, currencyDisplay, locale)
  const was = item.discount_percent > 0 ? money(item.price_minor, item.currency, currencyDisplay, locale) : null
  const body = (
    <>
      <div className="flex flex-wrap gap-1">
        {item.is_featured ? <Badge>{t("badge_featured")}</Badge> : null}
        {menu.show_new_badge && item.is_new ? <Badge variant="secondary">{t("badge_new")}</Badge> : null}
        {item.discount_percent > 0 ? <Badge variant="outline">{t("discount_percent", { percent: item.discount_percent })}</Badge> : null}
        {item.video_url ? <Badge variant="outline">{t("has_video")}</Badge> : null}
      </div>
      <h3 className="mt-2 font-bold leading-snug">{item.name}</h3>
      {item.description ? <p className="cafe-desc mt-1 line-clamp-2 text-xs" style={{ color: "var(--c-muted)" }}>{item.description}</p> : null}
      <div className="cafe-buy">
        <div className="cafe-price-row">
          {was ? <span className="cafe-was">{was}</span> : null}
          {item.discount_percent > 0 ? <span className="cafe-off">{t("discount_percent", { percent: item.discount_percent })}</span> : null}
          <span className="cafe-price">{price}</span>
        </div>
        <span className="cafe-cta">{item.is_sold_out ? t(skin === "cafe-super" ? "stock_gone" : "badge_sold_out") : t("select_cta")}</span>
      </div>
      {item.allergens && item.allergens.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.allergens.slice(0, 4).map((a) => (
            <span key={a.id} className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: "var(--c-line)" }}>
              {localizedField(locale, a.name_fa, a.name_en)}
            </span>
          ))}
        </div>
      ) : null}
    </>
  )

  if (view === "cover") {
    return (
      <Link href={href} className={cn("cafe-card cafe-cover relative block", item.is_sold_out && "is-sold")} style={{ backgroundImage: image ? `url(${image})` : undefined }}>
        {item.is_sold_out ? <span className="cafe-stamp">{t(skin === "cafe-super" ? "stock_gone" : "badge_sold_out")}</span> : null}
        <div className="shade cafe-card-body">{body}</div>
      </Link>
    )
  }

  if (view === "list") {
    return (
      <Link href={href} className={cn("cafe-card flex gap-3 p-3", item.is_sold_out && "is-sold")}>
        <div className="cafe-media relative size-20 shrink-0 overflow-hidden rounded-2xl bg-black/5">
          {image ? <Image src={image} alt="" fill className="object-cover" unoptimized /> : null}
          {item.is_sold_out ? <span className="cafe-stamp">{t(skin === "cafe-super" ? "stock_gone" : "badge_sold_out")}</span> : null}
        </div>
        <div className="cafe-card-body min-w-0 flex-1">{body}</div>
      </Link>
    )
  }

  return (
    <Link href={href} className={cn("cafe-card block", item.is_sold_out && "is-sold")}>
      <div className="cafe-media relative aspect-[4/3] bg-black/5">
        {image ? <Image src={image} alt="" fill className="object-cover" unoptimized /> : null}
        {item.is_sold_out ? <span className="cafe-stamp">{t(skin === "cafe-super" ? "stock_gone" : "badge_sold_out")}</span> : null}
      </div>
      <div className="cafe-card-body p-3">{body}</div>
    </Link>
  )
}
