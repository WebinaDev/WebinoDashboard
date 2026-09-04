/**
 * Exact match for `/` and `/admin`; prefix match for nested routes.
 * Mirrors WebinoERP `pathIsActive` so dashboard never highlights every child of `/admin`.
 */
export function pathIsActive(pathname: string, path: string): boolean {
  const cleanPath = path.replace(/\/+$/, "") || "/"
  const cleanPathname = pathname.replace(/\/+$/, "") || "/"

  if (cleanPath === "/" || cleanPath === "/admin") {
    return cleanPathname === cleanPath
  }

  return cleanPathname === cleanPath || cleanPathname.startsWith(`${cleanPath}/`)
}
