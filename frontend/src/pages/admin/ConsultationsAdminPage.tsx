"use client"

import { AdminResourcePage } from "@/pages/AdminResourcePage"

export function ConsultationsAdminPage() {
  return (
    <AdminResourcePage
      titleKey="site_admin:consultations_title"
      listPath="/api/v1/consultations"
      createPath="/api/v1/consultations"
      fields={[]}
    />
  )
}
