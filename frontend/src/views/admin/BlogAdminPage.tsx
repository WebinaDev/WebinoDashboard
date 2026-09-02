"use client"

import { AdminResourcePage } from "@/views/AdminResourcePage"

export function BlogAdminPage() {
  return (
    <AdminResourcePage
      titleKey="site_admin:blog_title"
      listPath="/api/v1/blog/posts"
      createPath="/api/v1/blog/posts"
      fields={[
        { key: "title", labelKey: "site_admin:field_title" },
        { key: "excerpt", labelKey: "site_admin:field_body", type: "textarea" },
        { key: "body", labelKey: "site_admin:field_message", type: "textarea" },
      ]}
    />
  )
}
