import { dashboardPath, isLegacyAdminPathname, legacyAdminToDashboardPath } from "@/kernel/paths"

const STAFF_ROLES = ["admin", "staff", "shop_manager", "seller", "accountant", "author", "editor"]

export function isStaffRole(role?: string | null): boolean {
  return Boolean(role && STAFF_ROLES.includes(role))
}

const CUSTOMER_REWRITES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^\/dashboard\/tickets\/(\d+)$/, (m) => dashboardPath(`account/tickets/${m[1]}`)],
  [/^\/dashboard\/tickets$/, () => dashboardPath("account/tickets")],
  [/^\/dashboard\/orders\/(\d+)(?:\/edit)?$/, (m) => dashboardPath(`account/orders/${m[1]}`)],
  [/^\/dashboard\/orders$/, () => dashboardPath("account/orders")],
  [/^\/dashboard\/notifications$/, () => dashboardPath("account/notifications")],
  [/^\/(?:my-account|account)\/view-order\/(\d+)$/, (m) => dashboardPath(`account/orders/${m[1]}`)],
  [/^\/(?:my-account|account)(?:\/(.*))?$/, (m) => dashboardPath(`account/${m[1] ?? ""}`)],
]

const STAFF_REWRITES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^\/dashboard\/account\/tickets\/(\d+)$/, (m) => dashboardPath(`tickets/${m[1]}`)],
  [/^\/dashboard\/account\/orders\/(\d+)$/, (m) => dashboardPath(`orders/${m[1]}`)],
  [/^\/dashboard\/account\/notifications$/, () => dashboardPath("notifications")],
  [/^\/dashboard\/product-reviews$/, () => dashboardPath("settings/shop/reviews")],
]

export function toNotificationNavPath(link: string | null | undefined, role?: string | null): string {
  const raw = (link ?? "").trim()
  if (!raw || !raw.startsWith("/")) return raw
  const [pathPart, ...rest] = raw.split(/(?=[?#])/)
  const suffix = rest.join("")
  let path = pathPart.replace(/\/+$/, "") || "/"
  if (isLegacyAdminPathname(path)) path = legacyAdminToDashboardPath(path)
  const rules = isStaffRole(role) ? STAFF_REWRITES : CUSTOMER_REWRITES
  for (const [re, to] of rules) {
    const m = path.match(re)
    if (m) return to(m) + suffix
  }
  return path + suffix
}
