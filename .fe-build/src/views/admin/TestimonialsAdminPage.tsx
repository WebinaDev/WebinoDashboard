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
        { key: "role", labelKey: "site_admin:field_role" },
        { key: "company", labelKey: "site_admin:field_company" },
        { key: "quote", labelKey: "site_admin:field_quote", type: "textarea" },
        { key: "rating", labelKey: "site_admin:field_rating" },
        { key: "avatar_url", labelKey: "site_admin:field_avatar_url" },
        { key: "sort_order", labelKey: "site_admin:field_sort_order" },
        { key: "published", labelKey: "site_admin:published", type: "checkbox" },
      ]}
    />
  )
}
