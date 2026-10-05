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

export const revalidate = 60

type TenantPayload = {
  data: {
    name: string
    store_display_name?: string | null
    active_theme_slug?: string | null
    branding?: Partial<import("@/kernel/theme-types").SiteBranding> | null
  }
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const res = await apiServer<TenantPayload>("/api/v1/public/tenant", {
      revalidate: 60,
      tags: ["tenant"],
    })
    const favicon = res?.data?.branding?.favicon_url
    if (favicon) {
      return { icons: { icon: favicon } }
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
        <main className={themeSlug === "ecommerce-ishop" ? "ishop-store flex-1" : "flex-1"}>{children}</main>
        {footer ? (
          <StorefrontDocument document={footer} runtime={{ siteName: tenantName }} context={themeContext} />
        ) : (
          <SiteFooter siteName={tenantName} />
        )}
        <AnalyticsTrackerScript />
      </div>
    </SiteBrandingShell>
  )
}
