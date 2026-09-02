"use client"

import { AdminResourcePage } from "@/views/AdminResourcePage"

export function TeamAdminPage() {
  return (
    <AdminResourcePage
      titleKey="site_admin:team_title"
      listPath="/api/v1/team/members"
      createPath="/api/v1/team/members"
      fields={[
        { key: "name", labelKey: "site_admin:field_name" },
        { key: "role", labelKey: "site_admin:field_role" },
        { key: "bio", labelKey: "site_admin:field_body", type: "textarea" },
      ]}
    />
  )
}
