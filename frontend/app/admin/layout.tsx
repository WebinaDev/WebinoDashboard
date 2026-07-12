import type { Metadata } from "next"

import { EnsureSetupComplete } from "@/components/EnsureSetupComplete"
import { DashboardPrefetch } from "@/components/DashboardPrefetch"
import DashboardLayoutPage from "@/pages/DashboardLayoutPage"

export const metadata: Metadata = {
  title: "Webino Admin",
  description: "Site and business administration",
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <EnsureSetupComplete>
      <DashboardPrefetch />
      <DashboardLayoutPage>{children}</DashboardLayoutPage>
    </EnsureSetupComplete>
  )
}
