import type { ReactNode } from "react"

import { SiteFooter } from "@/themes/corporate-demo-v1/components/SiteFooter"
import { SiteHeader } from "@/themes/corporate-demo-v1/components/SiteHeader"
import { getPublicTenant } from "@/lib/api-server"

export default async function SiteLayout({ children }: { children: ReactNode }) {
  let tenantName = "Webino"
  try {
    const res = await getPublicTenant()
    tenantName = res.data.store_display_name ?? res.data.name ?? tenantName
  } catch {
    /* fallback */
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <SiteHeader siteName={tenantName} />
      <main className="flex-1">{children}</main>
      <SiteFooter siteName={tenantName} />
    </div>
  )
}
