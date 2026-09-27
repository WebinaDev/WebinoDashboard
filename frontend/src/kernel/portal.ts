/** Admin paths a customer may open (portal home + `/dashboard/account/*`). */
export function isPortalPath(path: string): boolean {
  const p = path.replace(/^\/+|\/+$/g, "")
  return p === "" || p === "account" || p.startsWith("account/")
}
