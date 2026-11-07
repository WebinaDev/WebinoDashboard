import type { ShopCurrencyDisplay } from "@/lib/format"
import { toLocaleDigits } from "@/lib/locale"

export type ViewMode = "grid" | "list" | "cover"

const IRANIAN = new Set(["IRT", "IRR", "TOMAN", "IRHT", "IRHR"])

/**
 * Digits-only cafe amount (no «تومان» / «ریال» word). Pair with `<CafeMoney>` / CurrencyMark for the glyph.
 * `price_minor` is stored in Rial; Toman shops show amount / 10.
 */
export function formatCafeAmount(
  amount: number,
  currency: string | null | undefined,
  display: ShopCurrencyDisplay | null | undefined,
  locale: string,
) {
  const stored = (currency || "").toUpperCase()
  const code = (display?.currency || (!stored || IRANIAN.has(stored) ? "IRT" : stored)).toUpperCase()
  const lang = locale === "fa" ? "fa" : "en"
  const major = code === "IRR" ? amount : amount / 10
  const sep = display?.thousand_separator ?? ","
  const grouped = Math.round(Math.max(0, major))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, sep)
  return toLocaleDigits(grouped, lang)
}

/** @deprecated Prefer `<CafeMoney>` — kept for string-only slots (aria, analytics). Digits only. */
export function money(
  amount: number,
  currency: string,
  display: ShopCurrencyDisplay | null | undefined,
  locale: string,
) {
  return formatCafeAmount(amount, currency, display, locale)
}

export function digits(value: string | number, locale: string) {
  return toLocaleDigits(String(value), locale === "fa" ? "fa" : "en")
}

export function localizedField(locale: string, fa?: string | null, en?: string | null): string | null {
  const value = locale === "fa" ? fa ?? en : en ?? fa
  return value?.trim() ? value : null
}

export function keepQuery(params: Record<string, string | null | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}

export function menuKind(menu: { name: string; slug: string; menu_type?: string | null }): "bar" | "cafe" | "restaurant" {
  const blob = `${menu.name} ${menu.slug} ${menu.menu_type ?? ""}`.toLowerCase()
  if (blob.includes("بار") || blob.includes("bar")) return "bar"
  if (blob.includes("کافه") || blob.includes("cafe") || blob.includes("coffee")) return "cafe"
  return "restaurant"
}

export const SCHEME_KEY = "cafe_menu_scheme"

export function readScheme(): "light" | "dark" | null {
  if (typeof window === "undefined") return null
  const stored = localStorage.getItem(SCHEME_KEY)
  return stored === "dark" || stored === "light" ? stored : null
}

export function writeScheme(next: "light" | "dark") {
  localStorage.setItem(SCHEME_KEY, next)
}

const HUES = [22, 30, 14, 160, 35, 8, 190]

/** Tasteful gradient placeholder for products without a photo. */
export function placeholderFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % 997
  const hue = HUES[h % HUES.length]
  return `radial-gradient(120% 90% at 20% 15%, hsl(${hue} 55% 82%), transparent 60%), linear-gradient(150deg, hsl(${hue} 40% 62%), hsl(${(hue + 24) % 360} 35% 34%))`
}

export function initialOf(text?: string | null) {
  const value = (text ?? "").trim()
  return value ? Array.from(value)[0] : "•"
}
