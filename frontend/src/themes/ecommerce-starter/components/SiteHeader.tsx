import Link from "next/link"
import { getServerTranslations } from "@/lib/server-translations"

import { SiteLogo } from "@/themes/shared/SiteLogo"
import type { SiteChromeProps } from "@/themes/shared/types"
import { resolveSiteBranding } from "@/themes/shared/types"

export async function SiteHeader({ siteName, branding }: SiteChromeProps) {
  const t = await getServerTranslations("site.nav")
  const resolved = resolveSiteBranding(branding)

  const NAV = [
    { href: "/", label: t("home") },
    { href: "/shop", label: "فروشگاه" },
    { href: "/blog", label: t("blog") },
    { href: "/cart", label: "سبد" },
  ]

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="container mx-auto flex h-12 items-center justify-between gap-4 px-4">
        <SiteLogo
          siteName={siteName}
          logoUrl={resolved.logo_url}
          logoDarkUrl={resolved.logo_dark_url}
        />
        <nav className="flex items-center gap-4 text-xs font-semibold uppercase tracking-wide text-zinc-700">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-zinc-950">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
