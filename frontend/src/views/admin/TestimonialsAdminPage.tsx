"use client"

import { AdminResourcePage } from "@/views/AdminResourcePage"

export function TestimonialsAdminPage() {
  return (
    <AdminResourcePage
      titleKey="site_admin:testimonials_title"
      listPath="/api/v1/testimonials"
      createPath="/api/v1/testimonials"
      fields={[
        { key: "author", labelKey: "site_admin:field_author" },
        { key: "quote", labelKey: "site_admin:field_quote", type: "textarea" },
        { key: "published", labelKey: "site_admin:published", type: "checkbox" },
      ]}
    />
  )
}
