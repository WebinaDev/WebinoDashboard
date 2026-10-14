"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useState, type CSSProperties } from "react"
import { useTranslations } from "next-intl"

import { LoginForm } from "@/components/login-04/login-form"
import { api } from "@/lib/api"
import type { ClassicThemeSettings } from "@/kernel/theme-types"
import { classicText } from "@/themes/ecommerce-classic/lib/texts"

type PublicTenant = {
  name?: string
  store_display_name?: string | null
  active_theme_slug?: string | null
  branding?: { logo_url?: string | null; appearance?: ClassicThemeSettings | null } | null
}

/** Storefront customers come from shop pages; staff go to the dashboard. */
function isStorefrontNext(next: string | null): boolean {
  if (!next) return false
  return !next.startsWith("/dashboard") && !next.startsWith("/setup") && !next.startsWith("/admin")
}

export default function LoginPage() {
  const t = useTranslations("common")
  const params = useSearchParams()
  const next = params.get("next")
  const [tenant, setTenant] = useState<PublicTenant | null>(null)

  useEffect(() => {
    let cancel = false
    void api<{ data?: PublicTenant } | PublicTenant>("/api/v1/public/tenant")
      .then((r) => {
        if (cancel) return
        const body = (r && typeof r === "object" && "data" in r ? r.data : r) as PublicTenant
        setTenant(body ?? null)
      })
      .catch(() => {
        if (!cancel) setTenant(null)
      })
    return () => {
      cancel = true
    }
  }, [])

  const classic = tenant?.active_theme_slug === "ecommerce-classic" && isStorefrontNext(next)

  if (!classic) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
        <div className="flex w-full flex-col items-center gap-6">
          <p className="text-muted-foreground text-sm font-medium">{t("appName")}</p>
          <LoginForm />
        </div>
      </div>
    )
  }

  const appearance = tenant?.branding?.appearance ?? {}
  const texts = appearance.texts
  const siteName = tenant?.store_display_name || tenant?.name || ""
  const logo = tenant?.branding?.logo_url || ""
  const primary = appearance.primary_color || "#e775ae"
  const navy = appearance.navy_color || appearance.secondary_color || "#021959"

  return (
    <div
      dir="rtl"
      className="sfc-login-page flex min-h-svh flex-col"
      style={{ "--sfc-pink": primary, "--sfc-navy": navy, background: appearance.surface_color || "#f3f5f8" } as CSSProperties}
    >
      <header className="flex items-center justify-between border-b bg-white px-4 py-3 md:px-8" style={{ borderColor: appearance.border_color || "#e8edf3" }}>
        <Link href="/" className="flex items-center gap-2 font-bold" style={{ color: navy }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={siteName} className="h-9 w-auto" />
          ) : (
            <span>{siteName}</span>
          )}
        </Link>
        <Link href={next || "/"} className="text-sm font-semibold" style={{ color: primary }}>
          {classicText(texts, "cart.back_title")}
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <div className="text-center">
          <h1 className="text-xl font-bold" style={{ color: navy }}>
            {classicText(texts, "pages.login_title")}
          </h1>
          {classicText(texts, "pages.login_text") ? (
            <p className="mt-1 text-sm text-muted-foreground">{classicText(texts, "pages.login_text")}</p>
          ) : null}
        </div>
        <LoginForm preferOtp className="w-full max-w-sm" />
      </main>
    </div>
  )
}
