import { DASHBOARD_BASE } from "@/kernel/paths"

/**
 * Exact match for `/` and dashboard home; prefix match for nested routes.
 */
export function pathIsActive(pathname: string, path: string): boolean {
  const cleanPath = path.replace(/\/+$/, "") || "/"
  const cleanPathname = pathname.replace(/\/+$/, "") || "/"

  if (cleanPath === "/" || cleanPath === DASHBOARD_BASE) {
    return cleanPathname === cleanPath
  }

  return cleanPathname === cleanPath || cleanPathname.startsWith(`${cleanPath}/`)
}
