import Link from "next/link"
import { CalendarClock, Coffee, ShoppingBasket, Store, UtensilsCrossed } from "lucide-react"

import { apiServer } from "@/lib/api-server"
import { getServerTranslations } from "@/lib/server-translations"
import { SiteLogo } from "@/themes/shared/SiteLogo"
import type { SiteChromeProps } from "@/themes/shared/types"
import { resolveSiteBranding } from "@/themes/shared/types"

import type { CafeMenuSkin } from "../skin"
import type { CafeVenuePayload } from "../types"
import "../menu.css"
import "./chrome.css"

const MARKS: Record<CafeMenuSkin, typeof Coffee> = {
  "cafe-reyhoon": UtensilsCrossed,
  "cafe-mash-donald": UtensilsCrossed,
  "cafe-kerase": Coffee,
  "cafe-super": ShoppingBasket,
  "cafe-menew": Store,
  "cafe-signature": Coffee,
}

async function venueSettings(): Promise<CafeVenuePayload | null> {
  try {
    const res = await apiServer<{ data: CafeVenuePayload }>("/api/v1/public/cafe/venue", {
      revalidate: 60,
      tags: ["cafe-venue"],
    })
    return res?.data ?? null
  } catch {
    return null
  }
}

/**
 * Skin-styled site header for /about, /reservations and item pages. On the catalogue itself every skin draws its own
 * app chrome, so this header hides there (see `chrome.css`).
 */
export async function CafeSkinHeader({ siteName, branding, skin }: SiteChromeProps & { skin: CafeMenuSkin }) {
  const t = await getServerTranslations("cafe_starter")
  const tNav = await getServerTranslations("site.nav")
  const resolved = resolveSiteBranding(branding)
  const venue = await venueSettings()
  const menu = venue?.menu
  const locale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE === "en" ? "en" : "fa"
  const ctaLabel = locale === "fa" ? menu?.header_cta_label_fa ?? menu?.header_cta_label_en : menu?.header_cta_label_en ?? menu?.header_cta_label_fa
  const ctaUrl = menu?.header_cta_url
  const Mark = MARKS[skin]

  return (
    <header className="cafe-chrome cafe-chrome-head" data-skin={skin} data-hide-on-catalogue="true">
      <div className="cafe-chrome-inner">
        <div className="cafe-chrome-brand">
          {resolved.logo_url ? null : (
            <span className="cafe-chrome-mark" aria-hidden="true">
              <Mark className="size-4" />
            </span>
          )}
          <SiteLogo siteName={siteName} logoUrl={resolved.logo_url} logoDarkUrl={resolved.logo_dark_url} href="/catalogue" />
        </div>
        <nav className="cafe-chrome-nav" aria-label={t("nav_menu")}>
          <Link href="/catalogue">{t("nav_menu")}</Link>
          <Link href="/about">{t("nav_about")}</Link>
          <Link href="/reservations">{t("nav_reservations")}</Link>
        </nav>
        <div className="cafe-chrome-actions">
          {ctaLabel && ctaUrl ? (
            <Link href={ctaUrl} className="cafe-chrome-cta">
              {ctaLabel}
            </Link>
          ) : (
            <Link href="/reservations" className="cafe-chrome-cta">
              <CalendarClock className="size-4" />
              <span>{t("reservations_cta")}</span>
            </Link>
          )}
          <Link href="/login?next=/dashboard" className="cafe-chrome-admin">
            {tNav("admin")}
          </Link>
        </div>
      </div>
    </header>
  )
}

export async function CafeSkinFooter({ siteName, skin }: { siteName: string; skin: CafeMenuSkin }) {
  const t = await getServerTranslations("cafe_starter")
  const venue = await venueSettings()
  const locale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE === "en" ? "en" : "fa"
  const address = locale === "fa" ? venue?.venue.address_fa ?? venue?.venue.address_en : venue?.venue.address_en ?? venue?.venue.address_fa
  const hideOnCatalogue = skin !== "cafe-menew"

  return (
    <footer className="cafe-chrome cafe-chrome-foot" data-skin={skin} data-hide-on-catalogue={hideOnCatalogue ? "true" : "false"}>
      <div className="cafe-chrome-inner">
        <div>
          <p className="cafe-chrome-foot-name">{siteName}</p>
          {address ? <p className="cafe-chrome-foot-meta">{address}</p> : null}
        </div>
        <nav className="cafe-chrome-nav" aria-label={t("nav_menu")}>
          <Link href="/catalogue">{t("nav_menu")}</Link>
          <Link href="/about">{t("nav_about")}</Link>
          <Link href="/reservations">{t("nav_reservations")}</Link>
        </nav>
        <p className="cafe-chrome-foot-meta">{t("footer_powered")}</p>
      </div>
    </footer>
  )
}
