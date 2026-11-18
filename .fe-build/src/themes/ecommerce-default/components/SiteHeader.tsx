import Link from "next/link"
import { getServerTranslations } from "@/lib/server-translations"

import { Button } from "@/components/ui/button"
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
    { href: "/cart", label: "سبد خرید" },
    { href: "/account", label: "حساب" },
  ]

  return (
    <header className="border-b-2 border-teal-700 bg-background">
      <div className="container mx-auto flex h-14 items-center justify-between gap-4 px-4">
        <SiteLogo
          siteName={siteName}
          logoUrl={resolved.logo_url}
          logoDarkUrl={resolved.logo_dark_url}
        />
        <nav className="hidden items-center gap-0.5 md:flex">
          {NAV.map((item) => (
            <Button key={item.href} variant="ghost" size="sm" asChild className="rounded-sm text-sm font-semibold">
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </nav>
        <Button size="sm" className="rounded-sm bg-teal-700 hover:bg-teal-800" asChild>
          <Link href="/shop">فروشگاه</Link>
        </Button>
      </div>
    </header>
  )
}
