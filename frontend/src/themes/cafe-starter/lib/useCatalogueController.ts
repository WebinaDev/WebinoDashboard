"use client"

import { useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { api } from "@/lib/api"
import type { ShopCurrencyDisplay } from "@/lib/format"
import { cafeSkinLayout, resolveCafeSkin } from "../skin"
import type {
  CafeMenuSettings,
  CafeVenuePayload,
  CatalogItem,
  CatalogPayload,
} from "../types"
import { initialOf, localizedField, money, readScheme, writeScheme, type ViewMode } from "./helpers"

// re-export helpers used by skins
export { keepQuery, money, type ViewMode } from "./helpers"
export { localizedField, digits, placeholderFor, initialOf, menuKind } from "./helpers"

type Args = {
  catalog: CatalogPayload
  venue: CafeVenuePayload | null
  initialQuery?: string
  tableNumber?: string | null
  branchSlug?: string | null
  menuSlug?: string | null
  activeThemeSlug?: string | null
  /** Follow the OS dark preference when the guest has not chosen a scheme yet. */
  defaultDark?: boolean
}

const DEFAULT_ACCENT = "#c46b3a"

/** Percent off from either the percent field or a scheduled sale price. */
export function offPercent(item: CatalogItem): number {
  if (item.discount_percent > 0) return item.discount_percent
  if (item.price_minor > 0 && item.discounted_price_minor < item.price_minor) {
    return Math.round((1 - item.discounted_price_minor / item.price_minor) * 100)
  }
  return 0
}

export function useCatalogueController({
  catalog,
  venue,
  initialQuery = "",
  tableNumber,
  branchSlug,
  menuSlug,
  activeThemeSlug,
  defaultDark = false,
}: Args) {
  const t = useTranslations("cafe_starter")
  const locale = useLocale()
  const menu: CafeMenuSettings = {
    default_view: "grid",
    show_search: true,
    show_category_bar: true,
    show_new_badge: true,
    ...(venue?.menu ?? {}),
  }
  const [view, setView] = useState<ViewMode>(
    menu.default_view === "list" || menu.default_view === "cover" ? menu.default_view : "grid",
  )
  const [query, setQuery] = useState(initialQuery)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [scheme, setScheme] = useState<"light" | "dark">("light")
  const [activeOrder, setActiveOrder] = useState<{ number: string | number; kitchen_status: string } | null>(null)
  const [openMenuId, setOpenMenuId] = useState<number | null>(catalog.menus?.[0]?.id ?? null)
  const [hydrated, setHydrated] = useState(false)
  const [picked, setPicked] = useState<CatalogItem | null>(null)

  useEffect(() => {
    const stored = readScheme()
    const preferred =
      stored ??
      (defaultDark && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : null)
    if (preferred) setScheme(preferred)
    setHydrated(true)
  }, [defaultDark])

  useEffect(() => {
    // Lets the server-rendered skin header/footer follow the menu's light/dark choice.
    document.documentElement.dataset.cafeScheme = scheme
  }, [scheme])

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
  // The settings default (#c46b3a) used to repaint every skin; only a custom pick overrides the skin palette.
  const accent =
    menu.accent_color && menu.accent_color.toLowerCase() !== DEFAULT_ACCENT ? menu.accent_color : undefined
  const banners = (catalog.banners ?? []).filter((b) => b.is_active !== false).slice(0, 4)
  // A venue photo reads better behind the brand than a promo banner.
  const heroImage =
    venue?.gallery?.images?.[0]?.url ||
    banners[0]?.image_url ||
    catalog.items.find((item) => item.cover_image_url || item.image_url)?.cover_image_url ||
    catalog.items.find((item) => item.image_url)?.image_url ||
    null
  const currencyDisplay = catalog.currency_display as ShopCurrencyDisplay | null | undefined
  const venueName = venue?.tenant.name
  // Short monogram for logo badges: the configured placeholder text when it is short, else the first letter of the name.
  const placeholderText = localizedField(locale, menu.placeholder_logo_text_fa, menu.placeholder_logo_text_en)
  const logoText =
    placeholderText && Array.from(placeholderText.replace(/[\u064B-\u0652]/g, "")).length <= 4
      ? placeholderText
      : initialOf(venueName)

  const filteredItems = useMemo(() => {
    let items = catalog.items
    if (activeCategory) items = items.filter((item) => item.category?.slug === activeCategory)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      items = items.filter(
        (item) => item.name.toLowerCase().includes(q) || (item.description ?? "").toLowerCase().includes(q),
      )
    }
    return items
  }, [catalog.items, activeCategory, query])

  const featured = filteredItems.filter((i) => i.is_featured)
  const discounted = filteredItems.filter((i) => offPercent(i) > 0)
  const newest = menu.show_new_badge ? filteredItems.filter((i) => i.is_new) : []
  const qs = { table: tableNumber, branch: branchSlug ?? null, menu: menuSlug }

  function toggleScheme() {
    const next = scheme === "dark" ? "light" : "dark"
    setScheme(next)
    writeScheme(next)
  }

  function moneyOf(minor: number) {
    return money(minor, catalog.items[0]?.currency || "IRT", currencyDisplay, locale)
  }

  function priceOf(item: CatalogItem) {
    return money(item.discounted_price_minor, item.currency, currencyDisplay, locale)
  }

  function wasOf(item: CatalogItem) {
    return offPercent(item) > 0 ? money(item.price_minor, item.currency, currencyDisplay, locale) : null
  }

  return {
    t,
    locale,
    menu,
    view,
    setView,
    query,
    setQuery,
    activeCategory,
    setActiveCategory,
    scheme,
    toggleScheme,
    activeOrder,
    openMenuId,
    setOpenMenuId,
    hydrated,
    skin,
    layout,
    ordering,
    hours,
    accent,
    banners,
    heroImage,
    currencyDisplay,
    venueName,
    logoText,
    filteredItems,
    featured,
    discounted,
    newest,
    qs,
    catalog,
    venue,
    tableNumber,
    branchSlug,
    menuSlug,
    priceOf,
    wasOf,
    moneyOf,
    picked,
    setPicked,
  }
}

export type CatalogueController = ReturnType<typeof useCatalogueController>
