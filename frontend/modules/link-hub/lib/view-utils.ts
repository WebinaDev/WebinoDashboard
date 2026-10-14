import type { LinkHubTheme } from "./types"

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"

/** Latin and Arabic-Indic digits to Persian digits. */
export function faDigits(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)])
    .replace(/[٠-٩]/g, (d) => FA_DIGITS["٠١٢٣٤٥٦٧٨٩".indexOf(d)])
}

export const DAY_LABELS: Record<string, string> = {
  saturday: "شنبه",
  sunday: "یکشنبه",
  monday: "دوشنبه",
  tuesday: "سه‌شنبه",
  wednesday: "چهارشنبه",
  thursday: "پنجشنبه",
  friday: "جمعه",
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function normalizeTheme(raw: unknown): Required<Pick<LinkHubTheme, "mode" | "font" | "hero_gradient" | "card_style" | "radius">> &
  LinkHubTheme & { accent: string; background: string } {
  const t = (raw && typeof raw === "object" ? raw : {}) as LinkHubTheme
  const dark = t.mode === "dark"
  return {
    ...t,
    accent: typeof t.accent === "string" && HEX.test(t.accent) ? t.accent : "#0f766e",
    background:
      typeof t.background === "string" && HEX.test(t.background) ? t.background : dark ? "#0b1220" : "#f1f5f9",
    mode: dark ? "dark" : "light",
    font: t.font === "system" ? "system" : "yekan-bakh",
    hero_gradient: (["none", "accent", "aurora", "ocean", "sunset", "night"] as const).includes(
      t.hero_gradient as never,
    )
      ? (t.hero_gradient as NonNullable<LinkHubTheme["hero_gradient"]>)
      : "accent",
    card_style: (["soft", "outline", "glass", "solid"] as const).includes(t.card_style as never)
      ? (t.card_style as NonNullable<LinkHubTheme["card_style"]>)
      : "soft",
    radius: typeof t.radius === "number" ? Math.max(0, Math.min(32, t.radius)) : 18,
  }
}

export function heroGradient(kind: string, accent: string): string {
  switch (kind) {
    case "none":
      return accent
    case "aurora":
      return `linear-gradient(135deg, ${accent} 0%, #7c3aed 55%, #06b6d4 100%)`
    case "ocean":
      return `linear-gradient(135deg, #0ea5e9 0%, ${accent} 55%, #0b1f4d 100%)`
    case "sunset":
      return `linear-gradient(135deg, #f97316 0%, #db2777 55%, ${accent} 100%)`
    case "night":
      return `linear-gradient(135deg, #0f172a 0%, ${accent} 100%)`
    default:
      return `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 62%, #000) 100%)`
  }
}

/** Minutes since midnight in a timezone, plus the weekday key used by hours blocks. */
export function nowIn(timezone: string): { day: string; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date())
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
    const hour = Number(get("hour")) % 24
    return { day: get("weekday").toLowerCase(), minutes: hour * 60 + Number(get("minute")) }
  } catch {
    const d = new Date()
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    return { day: days[d.getDay()], minutes: d.getHours() * 60 + d.getMinutes() }
  }
}

export function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

export function osmDirections(lat: number, lng: number, zoom = 17): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`
}
