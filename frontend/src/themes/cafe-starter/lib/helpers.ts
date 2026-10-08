import { formatShopPrice, type ShopCurrencyDisplay } from "@/lib/format"
import { toLocaleDigits } from "@/lib/locale"

export type ViewMode = "grid" | "list" | "cover"

const CURRENCY_WORDS: Record<string, { fa: string; en: string }> = {
  IRT: { fa: "تومان", en: "Toman" },
  IRR: { fa: "ریال", en: "Rial" },
}

/**
 * Menu price. `price_minor` is stored in Rial; Toman shops show amount / 10. Iranian currencies print as a word after the
 * number ("۸۵,۰۰۰ تومان") instead of the raw ISO code the generic shop formatter emits.
 */
export function money(
  amount: number,
  currency: string,
  display: ShopCurrencyDisplay | null | undefined,
  locale: string,
) {
  // Product rows carry the storage unit (IRR by default); the shop display setting decides Toman vs Rial, Toman when unset.
  const stored = (currency || "").toUpperCase()
  const code = (display?.currency || (!stored || CURRENCY_WORDS[stored] ? "IRT" : stored)).toUpperCase()
  const lang = locale === "fa" ? "fa" : "en"
  const word = CURRENCY_WORDS[code]
  if (!word) {
    return toLocaleDigits(formatShopPrice(amount / 10, { ...display, currency: code }, code), lang)
  }
  const major = code === "IRR" ? amount : amount / 10
  const grouped = Math.round(major)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, display?.thousand_separator ?? ",")
  return `${toLocaleDigits(grouped, lang)} ${word[lang]}`
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
