import type { ModuleManifest } from "@/kernel/types"

export const resumeManifest: ModuleManifest = {
  slug: "resume",
  nameFa: "رزومه",
  nameEn: "Resume",
  siteTypes: ["resume"],
  submodules: ["profile", "experience", "education", "skills", "projects", "contact"],
  adminNav: { section: "resume", order: 16 },
  adminRoutes: [
    { path: "resume", submodule: "profile", labelKey: "nav.resume", section: "resume", order: 16 },
  ],
  siteRoutes: [
    { path: "resume", submodule: "profile", labelKey: "site.resume" },
  ],
}
