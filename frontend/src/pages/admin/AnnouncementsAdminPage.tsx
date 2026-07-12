"use client"

import { AdminResourcePage } from "@/pages/AdminResourcePage"

export function AnnouncementsAdminPage() {
  return (
    <AdminResourcePage
      titleKey="site_admin:announcements_title"
      listPath="/api/v1/announcements"
      createPath="/api/v1/announcements"
      fields={[
        { key: "title", labelKey: "site_admin:field_title" },
        { key: "body", labelKey: "site_admin:field_body", type: "textarea" },
      ]}
    />
  )
}
