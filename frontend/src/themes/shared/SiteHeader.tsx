import Link from "next/link"
import { getServerTranslations } from "@/lib/server-translations"

import { SiteLogo } from "../shared/SiteLogo"
import type { SiteChromeProps } from "../shared/types"
import { resolveBrandPalette } from "./branding"
import { resolveSiteBranding } from "../shared/types"

/** Academy / education magazine chrome — atmospheric, brand-token driven. */
export async function SiteHeader({ siteName, branding }: SiteChromeProps) {
  const t = await getServerTranslations("site.nav")
  const resolved = resolveSiteBranding(branding)
  const palette = resolveBrandPalette(resolved)
  const primary = palette.primary
  const navy = palette.navy ?? palette.secondary
  const soft = palette.surface
  const text = palette.text

  const NAV = [
    { href: "/", label: t("home") },
    { href: "/academy", label: "دوره‌ها" },
    { href: "/pages/teachers", label: "اساتید" },
    { href: "/blog", label: t("blog") },
    { href: "/pages/contact", label: t("consultation") },
  ]

  return (
    <header
      className="wax-chrome-header sticky top-0 z-40 border-b backdrop-blur-xl"
      style={{
        background: `color-mix(in srgb, ${soft} 82%, transparent)`,
        borderColor: `color-mix(in srgb, ${primary} 22%, ${palette.border})`,
        color: text,
        boxShadow: `0 10px 40px color-mix(in srgb, ${navy} 6%, transparent)`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${primary}, transparent)` }}
        aria-hidden
      />
      <div className="relative mx-auto flex h-[4.25rem] max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-2.5 font-black tracking-tight" style={{ color: navy }}>
          <SiteLogo siteName={siteName} logoUrl={resolved.logo_url} logoDarkUrl={resolved.logo_dark_url} />
        </div>
        <nav className="hidden items-center gap-0.5 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3.5 py-2 text-sm font-bold transition-colors hover:bg-black/[0.04]"
              style={{ color: text }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/pages/enroll"
          className="hidden rounded-full px-4 py-2 text-sm font-extrabold text-white transition-transform hover:-translate-y-0.5 sm:inline-flex"
          style={{
            background: `linear-gradient(135deg, ${primary}, ${palette.accent})`,
            boxShadow: `0 12px 28px color-mix(in srgb, ${primary} 35%, transparent)`,
          }}
        >
          ثبت‌نام
        </Link>
      </div>
    </header>
  )
}
