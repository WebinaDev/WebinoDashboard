"use client"

import Image from "next/image"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { Grid2x2, List, Search, Share2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { CafeCartDrawer } from "../components/CafeCartDrawer"
import { PhoneGateDialog } from "../components/PhoneGateDialog"
import type {
  CafeMenuSettings,
  CafeVenuePayload,
  CatalogCategory,
  CatalogItem,
  CatalogPayload,
  CatalogVariant,
  MenuBanner,
} from "../types"

type Props = {
  catalog: CatalogPayload
  venue: CafeVenuePayload | null
  initialQuery?: string
  tableNumber?: string | null
  branchSlug?: string | null
}

function formatPrice(amount: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount / 10)
  } catch {
    return `${amount}`
  }
}

function localizedField(locale: string, fa?: string | null, en?: string | null): string | null {
  const value = locale === "fa" ? fa ?? en : en ?? fa
  return value?.trim() ? value : null
}

function isOpenNow(hours: CafeVenuePayload["hours"] | CatalogPayload["hours"]): boolean | null {
  if (!hours?.days?.length) return null
  const now = new Date()
  const dayIndex = now.getDay()
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const today = hours.days.find((d) => d.day.toLowerCase() === dayNames[dayIndex])
  if (!today || today.closed || !today.open || !today.close) return today ? false : null
  const [oh, om] = today.open.split(":").map(Number)
  const [ch, cm] = today.close.split(":").map(Number)
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins >= oh * 60 + om && mins <= ch * 60 + cm
}

export function CatalogueView({ catalog, venue, initialQuery = "", tableNumber, branchSlug }: Props) {
  const t = useTranslations("cafe_starter")
  const locale = useLocale()
  const menu: CafeMenuSettings = venue?.menu ?? {
    default_view: "grid",
    show_search: true,
    show_category_bar: true,
    show_new_badge: true,
  }

  const [view, setView] = useState<"grid" | "list">(menu.default_view)
  const [query, setQuery] = useState(initialQuery)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [activeBranch, setActiveBranch] = useState<string | null>(branchSlug ?? null)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)

  const hours = catalog.hours ?? venue?.hours
  const openStatus = isOpenNow(hours)

  const filteredItems = useMemo(() => {
    let items = catalog.items
    if (activeCategory) {
      items = items.filter((item) => item.category?.slug === activeCategory)
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.description ?? "").toLowerCase().includes(q),
      )
    }
    return items
  }, [catalog.items, activeCategory, query])

  const featured = filteredItems.filter((i) => i.is_featured)
  const discounted = filteredItems.filter((i) => i.discount_percent > 0)
  const newest = filteredItems.filter((i) => i.is_new)

  const tagline = venue ? localizedField(locale, venue.venue.tagline_fa, venue.venue.tagline_en) : null
  const banners = (catalog.banners ?? []).filter((b) => b.is_active !== false)

  return (
    <div className="bg-background min-h-[60vh]">
      <PhoneGateDialog engagement={catalog.engagement} />

      <section className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-8">
          {tagline ? <p className="text-muted-foreground text-center text-sm">{tagline}</p> : null}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <h1 className="text-center text-3xl font-bold tracking-tight">{t("catalogue_title")}</h1>
            {openStatus !== null ? (
              <Badge variant={openStatus ? "default" : "secondary"}>
                {openStatus ? t("status_open") : t("status_closed")}
              </Badge>
            ) : null}
            {tableNumber ? (
              <Badge variant="outline">{t("table_label", { number: tableNumber })}</Badge>
            ) : null}
          </div>
        </div>
      </section>

      {banners.length > 0 ? (
        <section className="container mx-auto px-4 py-4">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {banners.map((banner) => (
              <BannerCard key={banner.id} banner={banner} locale={locale} t={t} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="container mx-auto px-4 py-6">
        {(catalog.menus?.length ?? 0) > 1 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <Button size="sm" variant={activeMenu === null ? "default" : "outline"} onClick={() => setActiveMenu(null)}>
              {t("all_menus")}
            </Button>
            {catalog.menus!.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant={activeMenu === m.slug ? "default" : "outline"}
                onClick={() => setActiveMenu(m.slug)}
                asChild
              >
                <Link href={`/catalogue?menu=${encodeURIComponent(m.slug)}`}>{m.name}</Link>
              </Button>
            ))}
          </div>
        ) : null}

        {(catalog.branches?.length ?? 0) > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <Button size="sm" variant={activeBranch === null ? "default" : "outline"} onClick={() => setActiveBranch(null)}>
              {t("all_branches")}
            </Button>
            {catalog.branches!.map((b) => (
              <Button
                key={b.id}
                size="sm"
                variant={activeBranch === b.slug ? "default" : "outline"}
                onClick={() => setActiveBranch(b.slug)}
                asChild
              >
                <Link href={`/catalogue?branch=${encodeURIComponent(b.slug)}`}>
                  {localizedField(locale, b.name_fa, b.name_en)}
                </Link>
              </Button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {menu.show_search ? (
            <div className="relative max-w-md flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search_placeholder")}
                className="pl-9"
                aria-label={t("search_placeholder")}
              />
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <CafeCartDrawer tableNumber={tableNumber} branchSlug={activeBranch ?? branchSlug} />
            <Button type="button" size="sm" variant={view === "grid" ? "default" : "outline"} onClick={() => setView("grid")} aria-label={t("view_grid")}>
              <Grid2x2 className="size-4" />
            </Button>
            <Button type="button" size="sm" variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")} aria-label={t("view_list")}>
              <List className="size-4" />
            </Button>
          </div>
        </div>

        {menu.show_category_bar && catalog.categories.length > 0 ? (
          <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
            <Button type="button" size="sm" variant={activeCategory === null ? "default" : "outline"} onClick={() => setActiveCategory(null)}>
              {t("all_categories")}
            </Button>
            {catalog.categories.map((cat) => (
              <Button key={cat.id} type="button" size="sm" variant={activeCategory === cat.slug ? "default" : "outline"} onClick={() => setActiveCategory(cat.slug)} className="shrink-0">
                {cat.icon_url ? (
                  <Image src={cat.icon_url} alt="" width={16} height={16} className="mr-1.5 rounded-full" unoptimized />
                ) : null}
                {cat.name}
              </Button>
            ))}
          </div>
        ) : null}

        {featured.length > 0 ? (
          <SmartSection title={t("section_featured")} items={featured} view={view} locale={locale} menu={menu} t={t} />
        ) : null}
        {discounted.length > 0 ? (
          <SmartSection title={t("section_discounted")} items={discounted} view={view} locale={locale} menu={menu} t={t} />
        ) : null}
        {newest.length > 0 ? (
          <SmartSection title={t("section_new")} items={newest} view={view} locale={locale} menu={menu} t={t} />
        ) : null}

        {filteredItems.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center text-sm">{t("empty_menu")}</p>
        ) : (
          <CategorySections
            categories={catalog.categories}
            items={filteredItems}
            view={view}
            locale={locale}
            menu={menu}
            t={t}
            activeCategory={activeCategory}
          />
        )}

        {venue?.venue.mini_site_enabled !== false ? (
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            <Button asChild variant="outline">
              <Link href="/about">{t("about_cta")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/reservations">{t("reservations_cta")}</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function BannerCard({
  banner,
  locale,
  t,
}: {
  banner: MenuBanner
  locale: string
  t: ReturnType<typeof useTranslations<"cafe_starter">>
}) {
  const title = localizedField(locale, banner.title_fa, banner.title_en)
  const shareUrl = typeof window !== "undefined" ? window.location.href : banner.link_url ?? ""

  return (
    <div className="relative min-w-[280px] shrink-0 overflow-hidden rounded-xl border">
      <div className="relative aspect-[21/9] w-full min-w-[280px] sm:min-w-[360px]">
        <Image src={banner.image_url} alt={title ?? ""} fill className="object-cover" unoptimized />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-3">
        {title ? <span className="text-sm font-medium text-white">{title}</span> : <span />}
        <div className="flex gap-1">
          {banner.link_url ? (
            <Button size="sm" variant="secondary" asChild>
              <a href={banner.link_url}>{t("banner_cta")}</a>
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="secondary"
            aria-label={t("share_banner")}
            onClick={() => {
              if (navigator.share) {
                void navigator.share({ title: title ?? t("catalogue_title"), url: shareUrl })
              }
            }}
          >
            <Share2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function SmartSection({
  title,
  items,
  view,
  locale,
  menu,
  t,
}: {
  title: string
  items: CatalogItem[]
  view: "grid" | "list"
  locale: string
  menu: CafeMenuSettings
  t: ReturnType<typeof useTranslations<"cafe_starter">>
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className={cn("gap-4", view === "grid" ? "grid sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-3")}>
        {items.slice(0, 6).map((item) => (
          <ItemCard key={`smart-${item.id}`} item={item} view={view} locale={locale} showNewBadge={menu.show_new_badge} t={t} />
        ))}
      </div>
    </section>
  )
}

function CategorySections({
  categories,
  items,
  view,
  locale,
  menu,
  t,
  activeCategory,
}: {
  categories: CatalogCategory[]
  items: CatalogItem[]
  view: "grid" | "list"
  locale: string
  menu: CafeMenuSettings
  t: ReturnType<typeof useTranslations<"cafe_starter">>
  activeCategory: string | null
}) {
  const groups = activeCategory
    ? categories.filter((c) => c.slug === activeCategory)
    : categories

  if (groups.length === 0) {
    return (
      <div className={cn("mt-8", view === "grid" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-3")}>
        {items.map((item) => (
          <ItemCard key={item.id} item={item} view={view} locale={locale} showNewBadge={menu.show_new_badge} t={t} />
        ))}
      </div>
    )
  }

  return (
    <>
      {groups.map((cat) => {
        const catItems = items.filter((i) => i.category?.slug === cat.slug)
        if (catItems.length === 0) return null
        const catView = cat.display_mode === "list" ? "list" : cat.display_mode === "cover" ? "grid" : view

        return (
          <section key={cat.id} className="mt-10">
            {cat.cover_image_url ? (
              <div className="relative mb-4 aspect-[3/1] overflow-hidden rounded-xl">
                <Image src={cat.cover_image_url} alt={cat.name} fill className="object-cover" unoptimized />
                <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-4">
                  <h2 className="text-xl font-bold text-white">{cat.name}</h2>
                </div>
              </div>
            ) : (
              <h2 className="mb-4 text-lg font-semibold">{cat.name}</h2>
            )}
            <div className={cn("gap-4", catView === "grid" ? "grid sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-3")}>
              {catItems.map((item) => (
                <ItemCard key={item.id} item={item} view={catView} locale={locale} showNewBadge={menu.show_new_badge} t={t} coverMode={cat.display_mode === "cover"} />
              ))}
            </div>
          </section>
        )
      })}
    </>
  )
}

function ItemCard({
  item,
  view,
  locale,
  showNewBadge,
  t,
  coverMode = false,
}: {
  item: CatalogItem
  view: "grid" | "list"
  locale: string
  showNewBadge: boolean
  t: ReturnType<typeof useTranslations<"cafe_starter">>
  coverMode?: boolean
}) {
  const hasDiscount = item.discount_percent > 0
  const price = formatPrice(item.discounted_price_minor, item.currency, locale)
  const original = hasDiscount ? formatPrice(item.price_minor, item.currency, locale) : null
  const image = item.cover_image_url ?? item.image_url

  return (
    <Link href={`/catalogue/${item.slug}`} className="block">
      <article
        className={cn(
          "border-border/60 overflow-hidden rounded-xl border bg-card shadow-sm transition hover:shadow-md",
          view === "list" && "flex gap-4 p-3",
          view === "grid" && "flex flex-col",
          (!item.is_available || item.is_sold_out) && "opacity-60",
        )}
      >
        {image ? (
          <div className={cn("bg-muted relative overflow-hidden", view === "grid" ? (coverMode ? "aspect-square w-full" : "aspect-[4/3] w-full") : "size-24 shrink-0 rounded-lg")}>
            <Image src={image} alt={item.name} fill className="object-cover" sizes={view === "grid" ? "(max-width: 768px) 100vw, 33vw" : "96px"} unoptimized />
            {item.video_url ? (
              <Badge className="absolute top-2 right-2" variant="secondary">{t("has_video")}</Badge>
            ) : null}
          </div>
        ) : null}

        <div className={cn("flex flex-1 flex-col", view === "grid" && "p-4")}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">{item.name}</h3>
              {item.category ? <p className="text-muted-foreground mt-0.5 text-xs">{item.category.name}</p> : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {showNewBadge && item.is_new ? <Badge variant="secondary">{t("badge_new")}</Badge> : null}
              {item.is_sold_out ? <Badge variant="outline">{t("badge_sold_out")}</Badge> : null}
              {!item.is_available ? <Badge variant="outline">{t("badge_unavailable")}</Badge> : null}
            </div>
          </div>

          {item.description ? <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">{item.description}</p> : null}

          {item.allergens && item.allergens.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.allergens.map((a) => (
                <Badge key={a.id} variant="outline" className="text-xs font-normal">
                  {localizedField(locale, a.name_fa, a.name_en)}
                </Badge>
              ))}
            </div>
          ) : null}

          {item.variants && item.variants.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.variants.map((v: CatalogVariant) => (
                <Badge key={v.id} variant="outline" className="text-xs font-normal">{v.name}</Badge>
              ))}
            </div>
          ) : null}

          <div className="mt-auto flex items-baseline gap-2 pt-3">
            <span className="text-lg font-bold">{price}</span>
            {original ? <span className="text-muted-foreground text-sm line-through">{original}</span> : null}
            {hasDiscount ? (
              <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">
                {t("discount_percent", { percent: item.discount_percent })}
              </Badge>
            ) : null}
          </div>
        </div>
      </article>
    </Link>
  )
}
