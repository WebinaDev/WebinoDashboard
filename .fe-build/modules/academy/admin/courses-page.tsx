"use client"

import type { ResolvedAdminRoute } from "@/kernel/types"
import { AdminResourcePage } from "@/views/AdminResourcePage"

/** Academy courses admin — wired to `/api/v1/academy/courses`. */
export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return (
    <AdminResourcePage
      titleKey="site_admin:academy_title"
      listPath="/api/v1/academy/courses"
      createPath="/api/v1/academy/courses"
      fields={[
        { key: "title", labelKey: "site_admin:field_title" },
        { key: "description", labelKey: "site_admin:field_description", type: "textarea" },
        { key: "cover_url", labelKey: "site_admin:field_cover_url" },
        { key: "published", labelKey: "site_admin:published", type: "checkbox" },
      ]}
    />
  )
}
