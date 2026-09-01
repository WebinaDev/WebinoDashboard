import type { Metadata } from "next"
import type { ReactNode } from "react"

import { apiServer } from "@/lib/api-server"
import { loadThemeComponents } from "@/kernel/theme-loader"
import { SiteBrandingShell } from "@/themes/shared/SiteBrandingShell"
import { resolveSiteBranding } from "@/themes/shared/types"

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

  return (
    <SiteBrandingShell branding={branding}>
      <SiteHeader siteName={tenantName} branding={branding} />
      <main className="flex-1">{children}</main>
      <SiteFooter siteName={tenantName} />
    </SiteBrandingShell>
  )
}
