import Link from "next/link"
import { getServerTranslations } from "@/lib/server-translations"

import { Button } from "@/components/ui/button"

import { SiteLogo } from "../shared/SiteLogo"
import type { SiteChromeProps } from "../shared/types"
import { resolveSiteBranding } from "../shared/types"

export async function SiteHeader({ siteName, branding }: SiteChromeProps) {
  const t = await getServerTranslations("site.nav")
  const resolved = resolveSiteBranding(branding)

  const NAV = [
    { href: "/", label: t("home") },
    { href: "/blog", label: t("blog") },
    { href: "/portfolio", label: t("portfolio") },
    { href: "/team", label: t("team") },
    { href: "/consultation", label: t("consultation") },
  ]

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4">
        <SiteLogo siteName={siteName} logoUrl={resolved.logo_url} />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Button key={item.href} variant="ghost" size="sm" asChild>
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </nav>
        <Button size="sm" variant="outline" asChild className="hidden sm:inline-flex">
          <Link href="/admin">{t("admin")}</Link>
        </Button>
      </div>
    </header>
  )
}
