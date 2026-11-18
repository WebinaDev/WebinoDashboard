import Link from "next/link"
import { getServerTranslations } from "@/lib/server-translations"

import type { SiteChromeProps } from "../shared/types"
import { resolveBrandPalette } from "./branding"
import { resolveSiteBranding } from "../shared/types"

export async function SiteFooter({ siteName, branding }: SiteChromeProps) {
  const t = await getServerTranslations("site.footer")
  const resolved = resolveSiteBranding(branding)
  const palette = resolveBrandPalette(resolved)
  const primary = palette.primary
  const deep = palette.navy ?? palette.secondary
  const soft = palette.surface

  const links = [
    { href: "/academy", label: "دوره‌ها" },
    { href: "/pages/teachers", label: "اساتید" },
    { href: "/pages/about", label: t("about") },
    { href: "/pages/contact", label: t("contact") },
  ]

  return (
    <footer
      className="relative overflow-hidden border-t"
      style={{
        background: `radial-gradient(90% 80% at 10% 0%, color-mix(in srgb, ${primary} 22%, transparent), transparent 55%), linear-gradient(165deg, ${deep} 0%, color-mix(in srgb, ${deep} 82%, #000) 100%)`,
        borderColor: `color-mix(in srgb, ${primary} 28%, transparent)`,
        color: "#f4f7fb",
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${primary}, transparent)` }}
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 md:flex-row md:items-end md:justify-between">
        <div className="max-w-md space-y-3">
          <p className="text-xl font-black tracking-tight">{siteName}</p>
          <p className="text-sm leading-relaxed text-white/70">
            مسیر یادگیری شفاف، کلاس‌های هدفمند و همراهی واقعی تا تسلط.
          </p>
          <Link
            href="/pages/enroll"
            className="inline-flex rounded-full px-4 py-2 text-sm font-extrabold text-white"
            style={{
              background: `linear-gradient(135deg, ${primary}, ${palette.accent})`,
              boxShadow: `0 12px 28px color-mix(in srgb, ${primary} 35%, transparent)`,
            }}
          >
            شروع ثبت‌نام
          </Link>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-white/80">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-white">
              {l.label}
            </Link>
          ))}
        </div>
      </div>
      <div
        className="relative border-t px-4 py-4 text-center text-xs text-white/55 md:text-start"
        style={{ borderColor: "rgba(255,255,255,0.1)", background: `color-mix(in srgb, ${soft} 6%, transparent)` }}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {siteName}
          </p>
          <p className="opacity-80">طراحی و توسعه توسط وبینا</p>
        </div>
      </div>
    </footer>
  )
}
