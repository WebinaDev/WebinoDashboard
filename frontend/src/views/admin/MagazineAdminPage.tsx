"use client"

import { AdminResourcePage } from "@/views/AdminResourcePage"

export function MagazineAdminPage() {
  return (
    <AdminResourcePage
      titleKey="site_admin:magazine_title"
      listPath="/api/v1/magazine/articles"
      createPath="/api/v1/magazine/articles"
      fields={[
        { key: "title", labelKey: "site_admin:field_title" },
        { key: "excerpt", labelKey: "site_admin:field_body", type: "textarea" },
        { key: "body", labelKey: "site_admin:field_message", type: "textarea" },
      ]}
    />
  )
}
