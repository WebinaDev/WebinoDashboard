"use client"

import Image from "next/image"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { Grid2x2, List, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import type { CafeMenuSettings, CafeVenuePayload, CatalogItem, CatalogPayload, CatalogCategory, CatalogVariant } from "../types"

type Props = {
  catalog: CatalogPayload
  venue: CafeVenuePayload | null
  initialQuery?: string
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

function localizedField(
  locale: string,
  fa?: string | null,
  en?: string | null,
): string | null {
  const value = locale === "fa" ? fa ?? en : en ?? fa
  return value?.trim() ? value : null
}

export function CatalogueView({ catalog, venue, initialQuery = "" }: Props) {
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

  const filteredItems = useMemo(() => {
    let items = catalog.items
    if (activeCategory) {
      items = items.filter((item: CatalogItem) => item.category?.slug === activeCategory)
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      items = items.filter(
        (item: CatalogItem) =>
          item.name.toLowerCase().includes(q) ||
          (item.description ?? "").toLowerCase().includes(q),
      )
    }
    return items
  }, [catalog.items, activeCategory, query])

  const tagline = venue
    ? localizedField(locale, venue.venue.tagline_fa, venue.venue.tagline_en)
    : null

  return (
    <div className="bg-background min-h-[60vh]">
      <section className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-8">
          {tagline ? (
            <p className="text-muted-foreground text-center text-sm">{tagline}</p>
          ) : null}
          <h1 className="mt-2 text-center text-3xl font-bold tracking-tight">{t("catalogue_title")}</h1>
        </div>
      </section>

      <div className="container mx-auto px-4 py-6">
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
            <Button
              type="button"
              size="sm"
              variant={view === "grid" ? "default" : "outline"}
              onClick={() => setView("grid")}
              aria-label={t("view_grid")}
            >
              <Grid2x2 className="size-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "list" ? "default" : "outline"}
              onClick={() => setView("list")}
              aria-label={t("view_list")}
            >
              <List className="size-4" />
            </Button>
          </div>
        </div>

        {menu.show_category_bar && catalog.categories.length > 0 ? (
          <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
            <Button
              type="button"
              size="sm"
              variant={activeCategory === null ? "default" : "outline"}
              onClick={() => setActiveCategory(null)}
            >
              {t("all_categories")}
            </Button>
            {catalog.categories.map((cat: CatalogCategory) => (
              <Button
                key={cat.id}
                type="button"
                size="sm"
                variant={activeCategory === cat.slug ? "default" : "outline"}
                onClick={() => setActiveCategory(cat.slug)}
                className="shrink-0"
              >
                {cat.icon_url ? (
                  <Image
                    src={cat.icon_url}
                    alt=""
                    width={16}
                    height={16}
                    className="mr-1.5 rounded-full"
                    unoptimized
                  />
                ) : null}
                {cat.name}
              </Button>
            ))}
          </div>
        ) : null}

        {filteredItems.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center text-sm">{t("empty_menu")}</p>
        ) : (
          <div
            className={cn(
              "mt-8",
              view === "grid"
                ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                : "flex flex-col gap-3",
            )}
          >
            {filteredItems.map((item: CatalogItem) => (
              <ItemCard
                key={item.id}
                item={item}
                view={view}
                locale={locale}
                showNewBadge={menu.show_new_badge}
                t={t}
              />
            ))}
          </div>
        )}

        {venue?.venue.mini_site_enabled !== false ? (
          <div className="mt-12 text-center">
            <Button asChild variant="outline">
              <Link href="/about">{t("about_cta")}</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ItemCard({
  item,
  view,
  locale,
  showNewBadge,
  t,
}: {
  item: CatalogItem
  view: "grid" | "list"
  locale: string
  showNewBadge: boolean
  t: ReturnType<typeof useTranslations<"cafe_starter">>
}) {
  const hasDiscount = item.discount_percent > 0
  const price = formatPrice(item.discounted_price_minor, item.currency, locale)
  const original = hasDiscount
    ? formatPrice(item.price_minor, item.currency, locale)
    : null

  return (
    <article
      className={cn(
        "border-border/60 overflow-hidden rounded-xl border bg-card shadow-sm transition hover:shadow-md",
        view === "list" && "flex gap-4 p-3",
        view === "grid" && "flex flex-col",
        !item.is_available && "opacity-60",
      )}
    >
      {item.image_url ? (
        <div
          className={cn(
            "bg-muted relative overflow-hidden",
            view === "grid" ? "aspect-[4/3] w-full" : "size-24 shrink-0 rounded-lg",
          )}
        >
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover"
            sizes={view === "grid" ? "(max-width: 768px) 100vw, 33vw" : "96px"}
            unoptimized
          />
        </div>
      ) : null}

      <div className={cn("flex flex-1 flex-col", view === "grid" && "p-4")}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">{item.name}</h3>
            {item.category ? (
              <p className="text-muted-foreground mt-0.5 text-xs">{item.category.name}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {showNewBadge && item.is_new ? (
              <Badge variant="secondary">{t("badge_new")}</Badge>
            ) : null}
            {!item.is_available ? (
              <Badge variant="outline">{t("badge_unavailable")}</Badge>
            ) : null}
          </div>
        </div>

        {item.description ? (
          <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">{item.description}</p>
        ) : null}

        {item.variants && item.variants.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.variants.map((v: CatalogVariant) => (
              <Badge key={v.id} variant="outline" className="text-xs font-normal">
                {v.name}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex items-baseline gap-2 pt-3">
          <span className="text-lg font-bold">{price}</span>
          {original ? (
            <span className="text-muted-foreground text-sm line-through">{original}</span>
          ) : null}
          {hasDiscount ? (
            <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">
              {t("discount_percent", { percent: item.discount_percent })}
            </Badge>
          ) : null}
        </div>
      </div>
    </article>
  )
}
