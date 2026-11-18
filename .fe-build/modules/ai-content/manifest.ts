import type { ModuleManifest } from "@/kernel/types"

const SECTIONS = [
  "overview",
  "jobs",
  "calendar",
  "blog",
  "products",
  "titles",
  "pages",
  "taxonomies",
  "attributes",
  "settings",
] as const

export const aiContentManifest: ModuleManifest = {
  slug: "ai-content",
  nameFa: "هوش مصنوعی",
  nameEn: "AI Content",
  siteTypes: ["ecommerce", "magazine", "cafe", "corporate"],
  submodules: ["studio"],
  adminNav: { section: "tools", order: 61 },
  adminRoutes: SECTIONS.map((section, i) => ({
    path: section === "overview" ? "ai-content" : `ai-content/${section}`,
    submodule: "studio",
    page: "ai-shell",
    labelKey: `nav.ai_${section}`,
    section: "tools",
    order: 61,
    navGroup: "ai_content",
    navOrder: i,
    capability: "content.manage",
  })),
  siteRoutes: [],
}
