import { MODULE_MANIFESTS } from "@/kernel/registry"
import { canonicalSiteSegments } from "@/kernel/route-resolver"

/** Resolve a public site URL for a module route pattern with :slug params. */
export function sitePermalink(moduleSlug: string, routePath: string, params: Record<string, string>): string {
  const manifest = MODULE_MANIFESTS.find((m) => m.slug === moduleSlug)
  const pattern = manifest?.siteRoutes?.find((r) => r.path === routePath)?.path ?? routePath
  let path = `/${pattern}`
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`:${key}`, encodeURIComponent(value))
  }
  return path
}

export function blogPostPermalink(slug: string): string {
  return sitePermalink("blog", "blog/:slug", { slug })
}

export function magazineArticlePermalink(slug: string): string {
  return sitePermalink("magazine", "magazine/:slug", { slug })
}

/**
 * Builder/CMS pages live at the root (/<slug>). Only a slug that a native module route already
 * claims (e.g. "blog", "shop") keeps the /pages/<slug> form so it is still reachable.
 */
export function cmsPagePermalink(slug: string): string {
  if (canonicalSiteSegments([slug])[0] === "pages") return `/${encodeURIComponent(slug)}`
  return sitePermalink("cms", "pages/:slug", { slug })
}
