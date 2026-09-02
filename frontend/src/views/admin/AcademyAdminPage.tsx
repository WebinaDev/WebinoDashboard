"use client"

import { AdminResourcePage } from "@/views/AdminResourcePage"

export function AcademyAdminPage() {
  return (
    <AdminResourcePage
      titleKey="site_admin:academy_title"
      listPath="/api/v1/academy/courses"
      createPath="/api/v1/academy/courses"
      fields={[
        { key: "title", labelKey: "site_admin:field_title" },
        { key: "description", labelKey: "site_admin:field_description", type: "textarea" },
        { key: "published", labelKey: "site_admin:published", type: "checkbox" },
      ]}
    />
  )
}
