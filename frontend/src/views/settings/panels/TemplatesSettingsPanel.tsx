"use client"

import ThemesPageClient from "../../../../modules/core/admin/themes-page-client"
import type { ResolvedAdminRoute } from "@/kernel/types"

const STUB_ROUTE: ResolvedAdminRoute = {
  moduleSlug: "core",
  path: "settings/site/templates",
  submodule: "themes",
  labelKey: "nav.themes",
  section: "admin",
  order: 0,
  fullPath: "/dashboard/settings/site/templates",
}

/** Customer-facing site templates gallery under settings (preview / default / activate). */
export function TemplatesSettingsPanel() {
  return <ThemesPageClient route={STUB_ROUTE} />
}
