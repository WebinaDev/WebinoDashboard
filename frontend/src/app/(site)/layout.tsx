import type { Metadata } from "next"
import type { ReactNode } from "react"

import { apiServer } from "@/lib/api-server"
import { globalsCss } from "@/builder/globals"
import { loadPublishedGlobals, loadResolvedTemplate, StorefrontDocument } from "@/builder/public-document"
import { requestThemeContext } from "@/builder/theme/request"
import { loadThemeComponents } from "@/kernel/theme-loader"
import { SiteBrandingShell } from "@/themes/shared/SiteBrandingShell"
import { resolveSiteBranding } from "@/themes/shared/types"
import { AnalyticsTrackerScript } from "@/components/AnalyticsTrackerScript"
import { JsonLd } from "@/components/seo/JsonLd"

export const revalidate = 60

type TenantPayload = {
  data: {
    name: string
    store_display_name?: string | null
    active_theme_slug?: string | null
    branding?: Partial<import("@/kernel/theme-types").SiteBranding> | null
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

  try {
    const res = await apiServer<TenantPayload>("/api/v1/public/tenant", {
      revalidate: 60,
      tags: ["tenant"],
    })
    if (res?.data) {
      tenantName = res.data.store_display_name ?? res.data.name ?? tenantName
      themeSlug = res.data.active_theme_slug ?? themeSlug
      branding = resolveSiteBranding(res.data.branding)
    }
  } catch {
    /* fallback */
  }

  const theme = await loadThemeComponents(themeSlug)
  const { SiteHeader, SiteFooter } = theme
  const themeContext = await requestThemeContext()
  const [globals, header, footer] = await Promise.all([
    loadPublishedGlobals(),
    loadResolvedTemplate("header", themeContext),
    loadResolvedTemplate("footer", themeContext),
  ])

  return (
    <SiteBrandingShell branding={branding}>
        <div className={globals ? "wb-site flex min-h-svh flex-1 flex-col" : "flex min-h-svh flex-1 flex-col"}>
        {globals ? <style>{globalsCss(globals)}</style> : null}
        {header ? (
          <StorefrontDocument document={header} runtime={{ siteName: tenantName, logoUrl: branding.logo_url }} context={themeContext} />
        ) : (
          <SiteHeader siteName={tenantName} branding={branding} />
        )}
        <main className={themeSlug === "ecommerce-classic" ? "sf-classic flex-1" : "flex-1"}>{children}</main>
        {footer ? (
          <StorefrontDocument document={footer} runtime={{ siteName: tenantName }} context={themeContext} />
        ) : (
          <SiteFooter siteName={tenantName} />
        )}
        <SiteJsonLd />
        <AnalyticsTrackerScript />
      </div>
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
