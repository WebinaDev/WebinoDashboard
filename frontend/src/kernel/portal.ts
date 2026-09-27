/** Admin paths under `/dashboard/account/*` (customer / partner portal). */
export function isPortalPath(path: string): boolean {
  const p = path.replace(/^\/+|\/+$/g, "")
  return p === "account" || p.startsWith("account/")
}
