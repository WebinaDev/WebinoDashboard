import type { Metadata } from "next"

import DashboardLayoutPage from "@/views/DashboardLayoutPage"
import { Toaster } from "@/components/ui/sonner"

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
    <DashboardLayoutPage>
      {children}
      <Toaster richColors closeButton position="top-center" />
    </DashboardLayoutPage>
  )
}
