import type { ModuleManifest, SiteTypeSlug } from "./types"

import { academyManifest } from "../../modules/academy/manifest"
import { analyticsManifest } from "../../modules/analytics/manifest"
import { blogManifest } from "../../modules/blog/manifest"
import { cafeManifest } from "../../modules/cafe/manifest"
import { cmsManifest } from "../../modules/cms/manifest"
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
  { slug: "ecommerce", name_fa: "فروشگاه اینترنتی", name_en: "E-commerce", default_theme_slug: "ecommerce-default" },
  { slug: "magazine", name_fa: "مجله آموزشی", name_en: "Educational Magazine", default_theme_slug: "magazine-default" },
  { slug: "cafe", name_fa: "کافه و رستوران", name_en: "Cafe & Restaurant", default_theme_slug: "cafe-starter" },
  { slug: "resume", name_fa: "رزومه", name_en: "Resume", default_theme_slug: "resume-default" },
  { slug: "corporate", name_fa: "شرکتی", name_en: "Corporate", default_theme_slug: "corporate-default" },
]

export const MODULE_MANIFESTS: ModuleManifest[] = [
  coreManifest,
  commerceManifest,
  usersManifest,
  cmsManifest,
  blogManifest,
  marketingManifest,
  analyticsManifest,
  magazineManifest,
  academyManifest,
  cafeManifest,
  resumeManifest,
  corporateManifest,
]

export function getModuleManifest(slug: string): ModuleManifest | undefined {
  return MODULE_MANIFESTS.find((m) => m.slug === slug)
}

export function getSiteType(slug: string) {
  return SITE_TYPES.find((t) => t.slug === slug)
}
