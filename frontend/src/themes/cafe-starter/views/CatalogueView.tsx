"use client"

import Image from "next/image"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { Grid2x2, LayoutTemplate, List, MapPin, Moon, Search, Share2, Sun, Clock3 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toLocaleDigits } from "@/lib/locale"
import { formatShopPrice, type ShopCurrencyDisplay } from "@/lib/format"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"

import { CafeCartDrawer } from "../components/CafeCartDrawer"
import { PhoneGateDialog } from "../components/PhoneGateDialog"
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

export function CatalogueView({ catalog, venue, initialQuery = "", tableNumber, branchSlug, menuSlug }: Props) {
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

  const ordering = venue?.ordering
  const hours = catalog.hours ?? venue?.hours
  const accent = menu.accent_color || undefined
  const banners = (catalog.banners ?? []).filter((b) => b.is_active !== false).slice(0, 3)
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
      data-scheme={scheme}
      data-season={menu.seasonal_theme && menu.seasonal_theme !== "none" ? menu.seasonal_theme : undefined}
      data-font={menu.font_preset || "sans"}
      style={accent ? ({ ["--cafe-accent" as string]: accent } as React.CSSProperties) : undefined}
    >
      <PhoneGateDialog engagement={catalog.engagement} />
      <div className="mx-auto max-w-6xl px-4 py-5">
        <section className="cafe-hero">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <p className="cafe-kicker">{t("menu_kicker")}</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-5xl">{venueName || t("catalogue_title")}</h1>
              {tagline ? <p className="mt-2 text-sm" style={{ color: "var(--c-muted)" }}>{tagline}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {ordering?.is_open != null ? (
                  <Badge variant={ordering.is_open ? "default" : "secondary"}>
                    {ordering.is_open ? t("status_open") : t("status_closed")}
                  </Badge>
                ) : null}
                {ordering?.prep_minutes ? <Badge variant="outline">{t("prep_minutes", { count: ordering.prep_minutes })}</Badge> : null}
                {tableNumber ? <Badge variant="outline">{t("table_label", { number: toLocaleDigits(tableNumber, locale === "fa" ? "fa" : "en") })}</Badge> : null}
                {activeOrder ? (
                  <Badge>{t("active_order", { number: String(activeOrder.number), status: t(`kitchen.${activeOrder.kitchen_status}`) })}</Badge>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-sm" style={{ color: "var(--c-muted)" }}>
                {address ? <span className="inline-flex items-center gap-1"><MapPin className="size-4" />{address}</span> : null}
                {hours?.days?.length ? <span className="inline-flex items-center gap-1"><Clock3 className="size-4" />{t("hours_hint")}</span> : null}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={toggleScheme} aria-label={t("toggle_theme")}>
                {scheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              {menu.teaser_video_url ? (
                <video src={menu.teaser_video_url} controls playsInline className="h-36 w-56 rounded-2xl bg-black object-cover" />
              ) : null}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
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
        </section>

        {banners.length > 0 ? (
          <section className="mt-4 flex snap-x gap-3 overflow-x-auto pb-1">
            {banners.map((banner) => (
              <BannerCard key={banner.id} banner={banner} locale={locale} t={t} />
            ))}
          </section>
        ) : null}

        {(catalog.menus?.length ?? 0) > 1 ? (
          <div className="mt-4 flex gap-2 overflow-x-auto">
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

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          {menu.show_search ? (
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 opacity-60" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search_placeholder")} className="ps-9" aria-label={t("search_placeholder")} />
            </div>
          ) : <div className="flex-1" />}
          <div className="flex items-center gap-2">
            <CafeCartDrawer tableNumber={tableNumber} branchSlug={branchSlug} ordering={ordering} currency={catalog.items[0]?.currency} currencyDisplay={currencyDisplay} />
            <Button type="button" size="sm" variant={view === "grid" ? "default" : "outline"} onClick={() => setView("grid")} aria-label={t("view_grid")}><Grid2x2 className="size-4" /></Button>
            <Button type="button" size="sm" variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")} aria-label={t("view_list")}><List className="size-4" /></Button>
            <Button type="button" size="sm" variant={view === "cover" ? "default" : "outline"} onClick={() => setView("cover")} aria-label={t("view_cover")}><LayoutTemplate className="size-4" /></Button>
          </div>
        </div>

        {menu.show_category_bar && catalog.categories.length > 0 ? (
          <div className="sticky top-0 z-20 -mx-4 mt-4 flex gap-2 overflow-x-auto bg-[var(--c-bg)]/90 px-4 py-3 backdrop-blur">
            <button type="button" className="cafe-chip" data-on={activeCategory === null ? "true" : "false"} onClick={() => setActiveCategory(null)}>{t("all_categories")}</button>
            {catalog.categories.map((cat) => (
              <button key={cat.id} type="button" className="cafe-chip inline-flex items-center gap-1.5" data-on={activeCategory === cat.slug ? "true" : "false"} onClick={() => setActiveCategory(cat.slug)}>
                {cat.icon_url ? <Image src={cat.icon_url} alt="" width={16} height={16} className="rounded-full" unoptimized /> : null}
                {cat.name}
              </button>
            ))}
          </div>
        ) : null}

        {ordering?.accepting_orders === false ? (
          <p className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "var(--c-line)" }}>{t("orders_paused")}</p>
        ) : null}

        {featured.length > 0 ? <SmartRow title={t("section_featured")} items={featured} view={view} locale={locale} menu={menu} t={t} currencyDisplay={currencyDisplay} qs={qs} /> : null}
        {discounted.length > 0 ? <SmartRow title={t("section_discounted")} items={discounted} view="list" locale={locale} menu={menu} t={t} currencyDisplay={currencyDisplay} qs={qs} /> : null}
        {newest.length > 0 ? <SmartRow title={t("section_new")} items={newest} view="list" locale={locale} menu={menu} t={t} currencyDisplay={currencyDisplay} qs={qs} /> : null}

        {filteredItems.length === 0 ? (
          <p className="py-16 text-center text-sm" style={{ color: "var(--c-muted)" }}>{t("empty_menu")}</p>
        ) : (
          <CategorySections
            categories={catalog.categories}
            items={filteredItems}
            view={view}
            locale={locale}
            menu={menu}
            t={t}
            activeCategory={activeCategory}
            currencyDisplay={currencyDisplay}
            qs={qs}
          />
        )}

        {venue?.venue.mini_site_enabled !== false ? (
          <div className="mt-10 flex justify-center gap-3">
            <Button asChild variant="outline"><Link href="/about">{t("about_cta")}</Link></Button>
          </div>
        ) : null}
      </div>
    </div>
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
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-bold">{props.title}</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {props.items.slice(0, 8).map((item) => (
          <div key={`${props.title}-${item.id}`} className="w-64 shrink-0">
            <ItemCard item={item} view="grid" locale={props.locale} menu={props.menu} t={props.t} currencyDisplay={props.currencyDisplay} qs={props.qs} />
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
          <ItemGrid items={items} view={(cat.display_mode as ViewMode) || props.view} locale={props.locale} menu={props.menu} t={props.t} currencyDisplay={props.currencyDisplay} qs={props.qs} />
        </section>
      ))}
      {uncategorized.length > 0 && !props.activeCategory ? (
        <ItemGrid items={uncategorized} view={props.view} locale={props.locale} menu={props.menu} t={props.t} currencyDisplay={props.currencyDisplay} qs={props.qs} />
      ) : null}
    </div>
  )
}

function ItemGrid({ items, view, ...rest }: { items: CatalogItem[]; view: ViewMode } & Omit<Parameters<typeof ItemCard>[0], "item" | "view">) {
  return (
    <div className={cn(view === "list" ? "space-y-3" : view === "cover" ? "grid gap-4 md:grid-cols-2" : "grid grid-cols-2 gap-3 md:grid-cols-3")}>
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
}: {
  item: CatalogItem
  view: ViewMode
  locale: string
  menu: CafeMenuSettings
  t: ReturnType<typeof useTranslations>
  currencyDisplay?: ShopCurrencyDisplay | null
  qs: Record<string, string | null | undefined>
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
      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold leading-snug">{item.name}</h3>
          {item.description ? <p className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--c-muted)" }}>{item.description}</p> : null}
        </div>
        <div className="text-end">
          <span className="cafe-price">{price}</span>
          {was ? <div className="mt-1 text-xs line-through opacity-60">{was}</div> : null}
        </div>
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
        {item.is_sold_out ? <span className="cafe-stamp">{t("badge_sold_out")}</span> : null}
        <div className="shade">{body}</div>
      </Link>
    )
  }

  if (view === "list") {
    return (
      <Link href={href} className={cn("cafe-card flex gap-3 p-3", item.is_sold_out && "is-sold")}>
        <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-black/5">
          {image ? <Image src={image} alt="" fill className="object-cover" unoptimized /> : null}
          {item.is_sold_out ? <span className="cafe-stamp">{t("badge_sold_out")}</span> : null}
        </div>
        <div className="min-w-0 flex-1">{body}</div>
      </Link>
    )
  }

  return (
    <Link href={href} className={cn("cafe-card block", item.is_sold_out && "is-sold")}>
      <div className="relative aspect-[4/3] bg-black/5">
        {image ? <Image src={image} alt="" fill className="object-cover" unoptimized /> : null}
        {item.is_sold_out ? <span className="cafe-stamp">{t("badge_sold_out")}</span> : null}
      </div>
      <div className="p-3">{body}</div>
    </Link>
  )
}
