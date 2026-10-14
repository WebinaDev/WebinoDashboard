/** Popup display rules (pure, testable). Storage is passed in so node tests can fake it. */
export type PopupRules = {
  frequency: "always" | "session" | "once" | "days"
  days: number
  minPageViews: number
  minSessions: number
  referrer: string
  device: "all" | "desktop" | "mobile"
}

export type PopupState = { lastShown: number | null; sessionShown: boolean; pageViews: number; sessions: number; referrer: string; isMobile: boolean; now: number }

export function rulesAllow(rules: PopupRules, state: PopupState): boolean {
  if (rules.device === "desktop" && state.isMobile) return false
  if (rules.device === "mobile" && !state.isMobile) return false
  if (state.pageViews < rules.minPageViews) return false
  if (state.sessions < rules.minSessions) return false
  if (rules.referrer && !state.referrer.toLowerCase().includes(rules.referrer.toLowerCase())) return false
  switch (rules.frequency) {
    case "session":
      return !state.sessionShown
    case "once":
      return state.lastShown === null
    case "days":
      return state.lastShown === null || state.now - state.lastShown >= Math.max(1, rules.days) * 86_400_000
    default:
      return true
  }
}

export function readRules(props: Record<string, unknown>): PopupRules {
  const num = (key: string, fallback: number) => (typeof props[key] === "number" ? (props[key] as number) : Number(props[key]) || fallback)
  const freq = String(props.frequency ?? "session")
  const device = String(props.device ?? "all")
  return {
    frequency: (["always", "session", "once", "days"].includes(freq) ? freq : "session") as PopupRules["frequency"],
    days: num("frequencyDays", 7),
    minPageViews: num("minPageViews", 0),
    minSessions: num("minSessions", 0),
    referrer: typeof props.referrer === "string" ? props.referrer.trim() : "",
    device: (["all", "desktop", "mobile"].includes(device) ? device : "all") as PopupRules["device"],
  }
}
