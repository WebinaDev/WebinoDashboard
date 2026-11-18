"use client"

import { AdminResourcePage } from "@/views/AdminResourcePage"

export function PortfolioAdminPage() {
  return (
    <AdminResourcePage
      titleKey="site_admin:portfolio_title"
      listPath="/api/v1/portfolio/items"
      createPath="/api/v1/portfolio/items"
      fields={[
        { key: "title", labelKey: "site_admin:field_title" },
        { key: "description", labelKey: "site_admin:field_description", type: "textarea" },
        { key: "published", labelKey: "site_admin:published", type: "checkbox" },
      ]}
    />
  )
}
