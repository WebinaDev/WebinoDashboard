import type { Metadata } from "next"

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
  return <DashboardLayoutPage>{children}</DashboardLayoutPage>
}
