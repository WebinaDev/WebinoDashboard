import Link from "next/link"
import { getServerTranslations } from "@/lib/server-translations"
import { apiServer } from "@/lib/api-server"

import { Button } from "@/components/ui/button"

import { SiteLogo } from "@/themes/shared/SiteLogo"
import type { SiteChromeProps } from "@/themes/shared/types"
import { resolveSiteBranding } from "@/themes/shared/types"
import type { CafeMenuSettings, CafeVenuePayload } from "../types"

export async function SiteHeader({ siteName, branding }: SiteChromeProps) {
  const t = await getServerTranslations("cafe_starter")
  const tNav = await getServerTranslations("site.nav")
  const resolved = resolveSiteBranding(branding)

  let menuSettings: CafeMenuSettings | null = null
  try {
    const res = await apiServer<{ data: CafeVenuePayload }>("/api/v1/public/cafe/venue", {
      revalidate: 60,
      tags: ["cafe-venue"],
    })
    menuSettings = res?.data?.menu ?? null
  } catch {
    menuSettings = null
  }

  const locale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE === "en" ? "en" : "fa"
  const ctaLabel =
    locale === "fa"
      ? menuSettings?.header_cta_label_fa ?? menuSettings?.header_cta_label_en
      : menuSettings?.header_cta_label_en ?? menuSettings?.header_cta_label_fa
  const ctaUrl = menuSettings?.header_cta_url

  const NAV = [
    { href: "/catalogue", label: t("nav_menu") },
    { href: "/about", label: t("nav_about") },
    { href: "/reservations", label: t("nav_reservations") },
  ]

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40">
      <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4">
        <Link href="/catalogue" className="flex items-center gap-2">
          <SiteLogo
            siteName={siteName}
            logoUrl={resolved.logo_url}
            logoDarkUrl={resolved.logo_dark_url}
          />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Button key={item.href} variant="ghost" size="sm" asChild>
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {ctaLabel && ctaUrl ? (
            <Button size="sm" asChild>
              <Link href={ctaUrl}>{ctaLabel}</Link>
            </Button>
          ) : null}
          <Button size="sm" variant="outline" asChild className="hidden sm:inline-flex">
            <Link href="/login?next=/admin">{tNav("admin")}</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
