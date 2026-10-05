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
    { href: "/amazing-offers", label: "پیشنهادها" },
    { href: "/blog", label: t("blog") },
    { href: "/cart", label: "سبد" },
  ]

  return (
    <div>
      <div className="bg-gradient-to-l from-orange-600 to-violet-800 px-4 py-2 text-center text-xs font-bold text-white md:text-sm">
        دمو فروشگاه وبینو — ظاهر متمایز برای پیش‌نمایش قالب
      </div>
      <header className="border-b-0 bg-card shadow-lg shadow-violet-900/10">
        <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4">
          <SiteLogo
            siteName={siteName}
            logoUrl={resolved.logo_url}
            logoDarkUrl={resolved.logo_dark_url}
          />
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-1.5 text-sm font-extrabold text-violet-900 hover:bg-orange-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Button size="sm" className="rounded-full bg-orange-600 font-bold hover:bg-orange-700" asChild>
            <Link href="/shop">خرید کنید</Link>
          </Button>
        </div>
      </header>
    </div>
  )
}
