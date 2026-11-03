/**
 * Page / theme builder route helpers.
 * Fullscreen chrome is only for the visual editor — not settings, collections, or lists.
 */

const SHELL_SEGMENTS = new Set(["settings", "collections", "site"])

/** Normalize to a dashboard-relative path without locale prefix. */
export function normalizeBuilderHref(href: string): string {
  if (!href) return ""
  let path = href.trim()
  try {
    if (/^https?:\/\//i.test(path)) {
      path = new URL(path).pathname
    }
  } catch {
    /* keep raw */
  }
  path = path.split(/[?#]/)[0] ?? path
  path = path.replace(/^\/(fa|en)(?=\/)/, "")
  if (!path.startsWith("/")) path = `/${path}`
  path = path.replace(/\/{2,}/g, "/")
  if (path === "/builder" || path.startsWith("/builder/")) {
    path = `/dashboard${path}`
  }
  if (path === "/theme-builder" || path.startsWith("/theme-builder/")) {
    path = `/dashboard${path}`
  }
  return path.replace(/\/$/, "") || "/"
}

/** Visual editor surfaces that bypass the dashboard shell. */
export function isPageBuilderFullscreenPath(href: string): boolean {
  const path = normalizeBuilderHref(href)
  if (path === "/dashboard/builder/new") return true
  if (path.startsWith("/dashboard/builder/chrome/")) return true
  if (path.startsWith("/dashboard/builder/product/")) return true
  if (path.startsWith("/dashboard/builder/post/")) return true
  if (path.startsWith("/dashboard/builder/article/")) return true
  if (/^\/dashboard\/builder\/\d+$/.test(path)) return true
  if (/^\/dashboard\/theme-builder\/[^/]+\/[^/]+$/.test(path)) return true
  return false
}

/** Legacy orphan settings URL → open page builder with globals panel. */
export function builderGlobalsHref(): string {
  return "/dashboard/builder/new?panel=globals"
}

export function builderThemeSettingsHref(): string {
  return "/dashboard/settings/site/theme"
}

export function builderMenusSettingsHref(): string {
  return "/dashboard/settings/site/menus"
}

export function isBuilderShellSegment(seg: string): boolean {
  return SHELL_SEGMENTS.has(seg)
}
