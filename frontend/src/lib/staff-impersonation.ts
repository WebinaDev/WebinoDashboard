/** Query param ERP appends to the magic-login URL. */
export const STAFF_IMPERSONATION_QUERY = "impersonate_token"

/** Short-lived cookie ERP may set on this host before redirecting to /login. */
export const STAFF_IMPERSONATION_COOKIE = "webino_staff_impersonate"

/** Login flag meaning "read the impersonation cookie"; the token stays out of the URL. */
export const STAFF_IMPERSONATION_EXCHANGE_FLAG = "staff_impersonation"

export type StaffImpersonationCustomer = {
  id?: string
  name?: string
  email?: string
}

export type StaffImpersonationSite = {
  site_id: string
  name: string
  domain: string
  customer?: StaffImpersonationCustomer | null
  current?: boolean
}

export type StaffImpersonationSession = {
  active: true
  staff_id: string
  staff_name: string
  site_id: string
  site_name: string
  domain: string
  customer?: StaffImpersonationCustomer | null
  sites: StaffImpersonationSite[]
}

export type StaffImpersonationRedirect =
  | { action: "none" }
  | { action: "stay" }
  | { action: "redirect-query"; token: string }
  | { action: "redirect-cookie" }

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

export function isStaffImpersonationJwt(value: string | null | undefined): value is string {
  if (!value || value.length > 24576) return false
  return JWT_RE.test(value)
}

export function staffImpersonationRedirect(input: {
  pathname: string
  queryToken: string | null
  hasImpersonationCookie: boolean
}): StaffImpersonationRedirect {
  const onLogin = input.pathname === "/login"
  const token = isStaffImpersonationJwt(input.queryToken) ? input.queryToken : null
  if (token) {
    return onLogin ? { action: "stay" } : { action: "redirect-query", token }
  }
  if (input.hasImpersonationCookie) {
    return onLogin ? { action: "stay" } : { action: "redirect-cookie" }
  }
  return { action: "none" }
}

/** http(s) only, no embedded credentials. Used for ERP return and site switch URLs. */
export function safeNavigationUrl(value: string | null | undefined): string | null {
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.username || url.password) return null
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  return url.toString()
}
