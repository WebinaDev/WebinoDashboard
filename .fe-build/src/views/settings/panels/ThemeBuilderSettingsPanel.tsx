"use client"

import ThemeBuilderPage from "../../../../modules/cms/admin/theme-builder-page"
import type { ResolvedAdminRoute } from "@/kernel/types"

const STUB_ROUTE: ResolvedAdminRoute = {
  moduleSlug: "cms",
  path: "settings/site/theme",
  submodule: "pages",
  labelKey: "nav.theme_builder",
  section: "admin",
  order: 0,
  fullPath: "/dashboard/settings/site/theme",
}

/** Theme builder (پوسته‌ساز) list/library under site settings. */
export function ThemeBuilderSettingsPanel() {
  return <ThemeBuilderPage route={STUB_ROUTE} />
}
