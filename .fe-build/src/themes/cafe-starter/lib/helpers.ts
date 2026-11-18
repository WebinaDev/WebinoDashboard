import { formatShopPrice, type ShopCurrencyDisplay } from "@/lib/format"
import { convertAmount, normalizeStoreCurrency } from "@/lib/currencies"
import { toLocaleDigits } from "@/lib/locale"

export type ViewMode = "grid" | "list" | "cover"

const CURRENCY_WORDS: Record<string, { fa: string; en: string }> = {
  IRT: { fa: "تومان", en: "Toman" },
  IRR: { fa: "ریال", en: "Rial" },
}

/**
 * Menu price. Amounts are interpreted in the row currency (`currency`) and shown in the shop display unit.
 * An IRT store shows an 850,000 IRR espresso as 85,000 تومان; an IRT row is left as-is.
 */
export function money(
  amount: number,
  currency: string,
  display: ShopCurrencyDisplay | null | undefined,
  locale: string,
) {
  const code = normalizeStoreCurrency(display?.currency || "IRT")
  const major = convertAmount(amount, currency, code)
  const lang = locale === "fa" ? "fa" : "en"
  const word = CURRENCY_WORDS[code]
  if (!word) {
    return toLocaleDigits(formatShopPrice(major, { ...display, currency: code }, code), lang)
  }
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
