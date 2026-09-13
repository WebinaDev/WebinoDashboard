import type { ModuleManifest, SiteTypeSlug } from "./types"
import externalRegistry from "../../modules-external/.registry.json"

import { academyManifest } from "../../modules/academy/manifest"
import { analyticsManifest } from "../../modules/analytics/manifest"
import { blogManifest } from "../../modules/blog/manifest"
import { botsManifest } from "../../modules/bots/manifest"
import { cafeManifest } from "../../modules/cafe/manifest"
import { cmsManifest } from "../../modules/cms/manifest"
import { coffeeProfileManifest } from "../../modules/coffee-profile/manifest"
import { commerceManifest } from "../../modules/commerce/manifest"
import { coreManifest } from "../../modules/core/manifest"
import { corporateManifest } from "../../modules/corporate/manifest"
import { magazineManifest } from "../../modules/magazine/manifest"
import { marketingManifest } from "../../modules/marketing/manifest"
import { resumeManifest } from "../../modules/resume/manifest"
import { usersManifest } from "../../modules/users/manifest"

export const SITE_TYPES: {
  slug: SiteTypeSlug
  name_fa: string
  name_en: string
  default_theme_slug: string
}[] = [
  { slug: "ecommerce", name_fa: "فروشگاه اینترنتی", name_en: "E-commerce", default_theme_slug: "ecommerce-starter" },
  { slug: "magazine", name_fa: "مجله آموزشی", name_en: "Educational Magazine", default_theme_slug: "magazine-default" },
  { slug: "cafe", name_fa: "کافه و رستوران", name_en: "Cafe & Restaurant", default_theme_slug: "cafe-starter" },
  { slug: "resume", name_fa: "رزومه", name_en: "Resume", default_theme_slug: "resume-default" },
  { slug: "corporate", name_fa: "شرکتی", name_en: "Corporate", default_theme_slug: "corporate-default" },
]

/** Bundled core manifests always available at build time. */
const BUNDLED_MANIFESTS: ModuleManifest[] = [
  { ...coreManifest, distribution: "bundled" },
  { ...usersManifest, distribution: "bundled" },
  { ...cmsManifest, distribution: "bundled" },
]

/**
 * Git-distributed modules currently still shipped in-monorepo during hybrid transition.
 * After install from org-git they land under modules-external/ (see .registry.json).
 */
const GIT_TRANSITION_MANIFESTS: ModuleManifest[] = [
  { ...commerceManifest, distribution: "git" },
  { ...coffeeProfileManifest, distribution: "git" },
  { ...blogManifest, distribution: "git" },
  { ...marketingManifest, distribution: "git" },
  { ...botsManifest, distribution: "git" },
  { ...analyticsManifest, distribution: "git" },
  { ...magazineManifest, distribution: "git" },
  { ...academyManifest, distribution: "git" },
  { ...cafeManifest, distribution: "git" },
  { ...resumeManifest, distribution: "git" },
  { ...corporateManifest, distribution: "git" },
]

function loadExternalOverrides(): ModuleManifest[] {
  const modules = (externalRegistry as { modules?: { slug: string }[] }).modules
  if (!modules?.length) return []
  // Marker only until FE packs are wired with dynamic imports after rebuild.
  return []
}

export const MODULE_MANIFESTS: ModuleManifest[] = [
  ...BUNDLED_MANIFESTS,
  ...GIT_TRANSITION_MANIFESTS,
  ...loadExternalOverrides(),
]

export function getModuleManifest(slug: string): ModuleManifest | undefined {
  return MODULE_MANIFESTS.find((m) => m.slug === slug)
}

export function getSiteType(slug: string) {
  return SITE_TYPES.find((t) => t.slug === slug)
}

export function isBundledModule(slug: string): boolean {
  return getModuleManifest(slug)?.distribution !== "git"
}
