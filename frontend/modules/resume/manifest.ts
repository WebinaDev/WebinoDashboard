import type { ModuleManifest } from "@/kernel/types"

/**
 * Resume module: LinkedIn-like content sections only.
 * Courses, highlight stats, and theme/display are separate top-level admin modules
 * (own URLs + nav sections) that still use resume.profile activation + resume APIs.
 */
export const resumeManifest: ModuleManifest = {
  slug: "resume",
  nameFa: "رزومه",
  nameEn: "Resume",
  siteTypes: ["resume", "corporate", "blog", "magazine"],
  submodules: ["profile", "experience", "education", "skills", "projects", "contact"],
  adminNav: { section: "resume", order: 16 },
  adminRoutes: [
    { path: "resume", submodule: "profile", page: "overview", labelKey: "nav.resume_overview", section: "resume", order: 16, navGroup: "resume", navOrder: 0, capability: "content.manage" },
    { path: "resume/identity", submodule: "profile", page: "section", labelKey: "nav.resume_identity", section: "resume", order: 16, navGroup: "resume", navOrder: 1, capability: "content.manage" },
    { path: "resume/about", submodule: "profile", page: "section", labelKey: "nav.resume_about", section: "resume", order: 16, navGroup: "resume", navOrder: 2, capability: "content.manage" },
    { path: "resume/contacts", submodule: "profile", page: "section", labelKey: "nav.resume_contacts", section: "resume", order: 16, navGroup: "resume", navOrder: 3, capability: "content.manage" },
    { path: "resume/experiences", submodule: "profile", page: "section", labelKey: "nav.resume_experiences", section: "resume", order: 16, navGroup: "resume", navOrder: 4, capability: "content.manage" },
    { path: "resume/educations", submodule: "profile", page: "section", labelKey: "nav.resume_educations", section: "resume", order: 16, navGroup: "resume", navOrder: 5, capability: "content.manage" },
    { path: "resume/honors", submodule: "profile", page: "section", labelKey: "nav.resume_honors", section: "resume", order: 16, navGroup: "resume", navOrder: 6, capability: "content.manage" },
    { path: "resume/publications", submodule: "profile", page: "section", labelKey: "nav.resume_publications", section: "resume", order: 16, navGroup: "resume", navOrder: 7, capability: "content.manage" },
    { path: "resume/certifications", submodule: "profile", page: "section", labelKey: "nav.resume_certifications", section: "resume", order: 16, navGroup: "resume", navOrder: 8, capability: "content.manage" },
    { path: "resume/skills", submodule: "profile", page: "section", labelKey: "nav.resume_skills", section: "resume", order: 16, navGroup: "resume", navOrder: 9, capability: "content.manage" },
    { path: "resume/languages", submodule: "profile", page: "section", labelKey: "nav.resume_languages", section: "resume", order: 16, navGroup: "resume", navOrder: 10, capability: "content.manage" },
    { path: "resume/projects", submodule: "profile", page: "section", labelKey: "nav.resume_projects", section: "resume", order: 16, navGroup: "resume", navOrder: 11, capability: "content.manage" },
    { path: "resume/volunteering", submodule: "profile", page: "section", labelKey: "nav.resume_volunteering", section: "resume", order: 16, navGroup: "resume", navOrder: 12, capability: "content.manage" },
    { path: "resume/testimonials", submodule: "profile", page: "section", labelKey: "nav.resume_testimonials", section: "resume", order: 16, navGroup: "resume", navOrder: 13, capability: "content.manage" },
    { path: "resume/legacy", submodule: "profile", page: "profile", labelKey: "nav.resume", section: "resume", order: 16, navHidden: true, capability: "content.manage" },
  ],
  siteRoutes: [
    { path: "resume", submodule: "profile", labelKey: "site.resume" },
  ],
}
