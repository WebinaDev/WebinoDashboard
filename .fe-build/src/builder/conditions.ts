/** Widget display conditions (Advanced tab), evaluated in the browser on the live site. */
export type DisplayConditions = {
  /** show = render only when conditions pass; hide = render unless they pass. */
  mode?: "show" | "hide"
  match?: "all" | "any"
  login?: "in" | "out"
  /** Gregorian ISO `YYYY-MM-DDTHH:mm` (picked with the Jalali picker). */
  from?: string
  to?: string
  /** JS weekdays (0 = Sunday … 6 = Saturday). */
  days?: number[]
  /** "9-18" (start inclusive, end exclusive, local hours). */
  hours?: string
  cart?: "empty" | "not_empty"
  /** "utm_source=instagram" or just "ref". */
  param?: string
}

export type ConditionContext = { loggedIn: boolean | null; cartCount: number | null; now: Date; search: URLSearchParams }

export function hasConditions(c: DisplayConditions | undefined): c is DisplayConditions {
  return Boolean(c && (c.login || c.from || c.to || c.days?.length || c.hours || c.cart || c.param))
}

export function needsSession(c: DisplayConditions | undefined): boolean {
  return Boolean(c && (c.login || c.cart))
}

/** true/false, or null while session data (login/cart) is still loading. */
export function evaluateConditions(c: DisplayConditions, ctx: ConditionContext): boolean | null {
  const checks: (boolean | null)[] = []
  if (c.login) checks.push(ctx.loggedIn === null ? null : ctx.loggedIn === (c.login === "in"))
  if (c.cart) checks.push(ctx.cartCount === null ? null : c.cart === "empty" ? ctx.cartCount === 0 : ctx.cartCount > 0)
  if (c.from) {
    const from = Date.parse(c.from)
    if (!Number.isNaN(from)) checks.push(ctx.now.getTime() >= from)
  }
  if (c.to) {
    const to = Date.parse(c.to)
    if (!Number.isNaN(to)) checks.push(ctx.now.getTime() < to)
  }
  if (c.days?.length) checks.push(c.days.includes(ctx.now.getDay()))
  if (c.hours) {
    const m = c.hours.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/)
    if (m) {
      const [start, end] = [Number(m[1]), Number(m[2])]
      const h = ctx.now.getHours()
      checks.push(start <= end ? h >= start && h < end : h >= start || h < end)
    }
  }
  if (c.param) {
    const [key, value] = c.param.split("=").map((part) => part.trim())
    if (key) checks.push(value === undefined ? ctx.search.has(key) : ctx.search.get(key) === value)
  }
  if (!checks.length) return true
  let pass: boolean | null
  if (c.match === "any") pass = checks.some((v) => v === true) ? true : checks.includes(null) ? null : false
  else pass = checks.some((v) => v === false) ? false : checks.includes(null) ? null : true
  if (pass === null) return null
  return c.mode === "hide" ? !pass : pass
}
