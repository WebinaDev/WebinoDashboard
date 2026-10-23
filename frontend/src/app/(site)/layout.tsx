import type { Metadata } from "next"
import type { ReactNode } from "react"

import { apiServer } from "@/lib/api-server"
import { hoistDataUrls } from "@/lib/inline-media"
import { globalsCss } from "@/builder/globals"
import { loadPublishedGlobals, loadResolvedTemplate, StorefrontDocument } from "@/builder/public-document"
import { requestPageLang } from "@/builder/page-lang"
import { CustomCodeSlot } from "@/builder/render/custom-code"
import { headers } from "next/headers"
import { requestThemeContext } from "@/builder/theme/request"
import { BuilderRuntimeProvider } from "@/builder/render/runtime"
import { loadThemeComponents } from "@/kernel/theme-loader"
import { SiteBrandingShell } from "@/themes/shared/SiteBrandingShell"
import { resolveSiteBranding } from "@/themes/shared/types"
import { AnalyticsTrackerScript } from "@/components/AnalyticsTrackerScript"
import { BotSiteWidget } from "@/components/BotSiteWidget"
import { JsonLd } from "@/components/seo/JsonLd"
import { cn } from "@/lib/utils"

export const revalidate = 60

type TenantPayload = {
  data: {
    name: string
    store_display_name?: string | null
    active_theme_slug?: string | null
    branding?: Partial<import("@/kernel/theme-types").SiteBranding> | null
    host_mode?: "link-hub" | "primary" | string | null
  }
}

type SeoPayload = {
  data?: {
    meta?: {
      title?: string
      description?: string
      robots?: string
      canonical?: string
      og?: { title?: string; description?: string; image?: string; url?: string; site_name?: string }
      twitter?: { card?: string; title?: string; description?: string; image?: string }
    }
    json_ld?: Record<string, unknown>
  }
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const [tenantRes, seoRes] = await Promise.all([
      apiServer<TenantPayload>("/api/v1/public/tenant", { revalidate: 60, tags: ["tenant"] }),
      apiServer<SeoPayload>("/api/v1/public/seo/meta?path=/", { revalidate: 60, tags: ["seo"] }),
    ])
    const favicon = tenantRes?.data?.branding?.favicon_url
    const meta = seoRes?.data?.meta
    return {
      title: meta?.title || tenantRes?.data?.store_display_name || tenantRes?.data?.name,
      description: meta?.description || undefined,
      robots: meta?.robots || undefined,
      alternates: meta?.canonical ? { canonical: meta.canonical } : undefined,
      openGraph: meta?.og
        ? {
            title: meta.og.title,
            description: meta.og.description,
            images: meta.og.image ? [meta.og.image] : undefined,
            url: meta.og.url,
            siteName: meta.og.site_name,
          }
        : undefined,
      twitter: meta?.twitter
        ? {
            card: (meta.twitter.card as "summary_large_image" | "summary") || "summary_large_image",
            title: meta.twitter.title,
            description: meta.twitter.description,
            images: meta.twitter.image ? [meta.twitter.image] : undefined,
          }
        : undefined,
      icons: favicon ? { icon: favicon } : undefined,
    }
  } catch {
    /* fallback */
  }
  return {}
}

export default async function SiteLayout({ children }: { children: ReactNode }) {
  let tenantName = "Webino"
  let themeSlug = "corporate-default"
  let branding = resolveSiteBranding(null)
  let hostMode: string = "primary"

  try {
    const res = await apiServer<TenantPayload>("/api/v1/public/tenant", {
      revalidate: 60,
      tags: ["tenant"],
    })
    if (res?.data) {
      tenantName = res.data.store_display_name ?? res.data.name ?? tenantName
      themeSlug = res.data.active_theme_slug ?? themeSlug
      branding = resolveSiteBranding(hoistDataUrls(res.data.branding))
      hostMode = res.data.host_mode || "primary"
    }
  } catch {
    /* fallback */
  }

  // LinkHub alias hosts: bare mobile page without storefront chrome.
  if (hostMode === "link-hub") {
    return (
      <div className="min-h-svh bg-slate-100" dir="rtl">
        {children}
        <AnalyticsTrackerScript />
      </div>
    )
  }

  const theme = await loadThemeComponents(themeSlug)
  const { SiteHeader, SiteFooter } = theme
  const themeContext = await requestThemeContext()
  const pageLang = await requestPageLang()
  const requestPath = ((await headers()).get("x-webino-path") ?? "/").split("?")[0]
  const [globals, header, footer] = await Promise.all([
    loadPublishedGlobals(),
    // A published header/footer template replaces the theme chrome on every theme (resolver 404s when none exists).
    loadResolvedTemplate("header", themeContext),
    loadResolvedTemplate("footer", themeContext),
  ])

  return (
    <SiteBrandingShell branding={branding} themeSlug={themeSlug}>
      {/* Theme slug reaches client storefront widgets rendered outside a builder document (wishlist, offers, vendor). */}
      <BuilderRuntimeProvider value={{ themeSlug, siteName: tenantName, logoUrl: branding.logo_url, lang: pageLang?.lang ?? null }}>
      <div
        className={globals ? "wb-site flex min-h-svh flex-1 flex-col" : "flex min-h-svh flex-1 flex-col"}
        {...(pageLang ? { dir: pageLang.dir, lang: pageLang.lang } : {})}
      >
        {globals ? <style>{globalsCss(globals)}</style> : null}
        <CustomCodeSlot entries={globals?.customCode} location="head" path={requestPath} />
        {header ? (
          <StorefrontDocument
            document={header}
            runtime={{ siteName: tenantName, logoUrl: branding.logo_url, themeSlug, lang: pageLang?.lang ?? null }}
            context={themeContext}
          />
        ) : (
          <SiteHeader siteName={tenantName} branding={branding} />
        )}
        <main className={cn("sf-main flex-1")}>{children}</main>
        {footer ? (
          <StorefrontDocument document={footer} runtime={{ siteName: tenantName, themeSlug, lang: pageLang?.lang ?? null }} context={themeContext} />
        ) : (
          <SiteFooter siteName={tenantName} />
        )}
        <SiteJsonLd />
        <CustomCodeSlot entries={globals?.customCode} location="body_end" path={requestPath} />
        <BotSiteWidget />
        <AnalyticsTrackerScript />
      </div>
      </BuilderRuntimeProvider>
    </SiteBrandingShell>
  )
}

async function SiteJsonLd() {
  try {
    const seoRes = await apiServer<SeoPayload>("/api/v1/public/seo/meta?path=/", {
      revalidate: 60,
      tags: ["seo"],
    })
    return <JsonLd data={seoRes?.data?.json_ld ?? null} />
  } catch {
    return null
  }
}
