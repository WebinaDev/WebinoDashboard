/** Public URL prefix for the authenticated control panel (not the API / RBAC role). */
export const DASHBOARD_BASE = "/dashboard" as const

/** Legacy URL prefix — always redirect to DASHBOARD_BASE. */
export const LEGACY_ADMIN_BASE = "/admin" as const

export function dashboardPath(subPath = ""): string {
  const cleaned = subPath.replace(/^\/+|\/+$/g, "").trim()
  return cleaned ? `${DASHBOARD_BASE}/${cleaned}` : DASHBOARD_BASE
}

export function isDashboardPathname(pathname: string): boolean {
  return pathname === DASHBOARD_BASE || pathname.startsWith(`${DASHBOARD_BASE}/`)
}

export function isLegacyAdminPathname(pathname: string): boolean {
  return pathname === LEGACY_ADMIN_BASE || pathname.startsWith(`${LEGACY_ADMIN_BASE}/`)
}

/** Map `/admin/...` → `/dashboard/...` (preserves query via caller). */
export function legacyAdminToDashboardPath(pathname: string): string {
  if (pathname === LEGACY_ADMIN_BASE) return DASHBOARD_BASE
  if (pathname.startsWith(`${LEGACY_ADMIN_BASE}/`)) {
    return `${DASHBOARD_BASE}${pathname.slice(LEGACY_ADMIN_BASE.length)}`
  }
  return pathname
}

/** Strip dashboard base from pathname for route segment resolution. */
export function stripDashboardBase(pathname: string): string {
  if (pathname === DASHBOARD_BASE || pathname === `${DASHBOARD_BASE}/`) return ""
  if (pathname.startsWith(`${DASHBOARD_BASE}/`)) {
    return pathname.slice(DASHBOARD_BASE.length + 1)
  }
  return pathname.replace(/^\//, "")
}
