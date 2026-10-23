"use client"

import Link from "next/link"
import { useLocale } from "next-intl"
import type { CSSProperties } from "react"

import { LoginForm } from "@/components/login-04/login-form"
import type { ClassicThemeSettings } from "@/kernel/theme-types"
import { classicText } from "@/themes/ecommerce-classic/lib/texts"
import { optImg } from "@/lib/image-url"

/**
 * Classic-skin sign-in / sign-up page (1.6): store logo + colours, editable title/text
 * (Theme Settings → متن‌ها → pages.login_*), optional side image (general.login_image_url),
 * OTP-first form with password fallback. Dark mode follows data-sf-scheme via CSS vars.
 */
export function ClassicLogin({
  appearance,
  siteName,
  logo,
  next,
}: {
  appearance: ClassicThemeSettings
  siteName: string
  logo: string
  next: string | null
}) {
  const locale = useLocale()
  const texts = appearance.texts
  const tx = (id: string) => classicText(texts, id, undefined, locale)
  const primary = appearance.primary_color || "#e775ae"
  const navy = appearance.navy_color || appearance.secondary_color || "#021959"
  const sideImage = appearance.general?.login_image_url || ""
  const rtl = !locale || locale.toLowerCase().startsWith("fa")

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      className="sfc-login-page flex min-h-svh flex-col"
      style={{ "--sfc-pink": primary, "--sfc-navy": navy, background: appearance.surface_color || "var(--sf-surface, #f3f5f8)" } as CSSProperties}
    >
      <header
        className="flex items-center justify-between border-b px-4 py-3 md:px-8"
        style={{ borderColor: appearance.border_color || "#e8edf3", background: "var(--sf-card, #fff)" }}
      >
        <Link href="/" className="flex items-center gap-2 font-bold" style={{ color: navy }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img loading="lazy" decoding="async" {...optImg(logo)} alt={siteName} className="h-9 w-auto" />
          ) : (
            <span>{siteName}</span>
          )}
        </Link>
        <Link href={next || "/"} className="text-sm font-semibold" style={{ color: primary }}>
          {tx("cart.back_title")}
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center p-4 md:p-8">
        <div
          className={`grid w-full overflow-hidden rounded-3xl shadow-sm ${sideImage ? "max-w-4xl md:grid-cols-2" : "max-w-md"}`}
          style={{ background: "var(--sf-card, #fff)" }}
        >
          {sideImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img loading="lazy" decoding="async" {...optImg(sideImage)} alt="" aria-hidden className="hidden h-full min-h-80 w-full object-cover md:block" />
          ) : null}
          <div className="flex flex-col gap-4 p-6 md:p-8">
            <div className="text-center">
              <h1 className="text-xl font-bold" style={{ color: navy }}>
                {tx("pages.login_title")}
              </h1>
              {tx("pages.login_text") ? <p className="mt-1 text-sm text-muted-foreground">{tx("pages.login_text")}</p> : null}
            </div>
            <LoginForm preferOtp className="w-full" />
          </div>
        </div>
      </main>
    </div>
  )
}
