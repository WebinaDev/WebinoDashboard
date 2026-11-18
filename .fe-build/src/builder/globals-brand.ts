import type { BuilderGlobals, ButtonVariant } from "./globals.ts"

function variant(
  background: string,
  color: string,
  hoverBackground: string,
  hoverColor: string,
  border = "transparent",
): ButtonVariant {
  return { background, color, hoverBackground, hoverColor, border }
}

/** Historical blush seed — detect untouched builder defaults, never ship as a new-tenant palette. */
export const SEED_GLOBAL_COLORS: BuilderGlobals["colors"] = {
  primary: "#E16BA6",
  secondary: "#0C2D63",
  text: "#0C2D63",
  accent: "#E16BA6",
  background: "#F5F8FB",
  surface: "#FFFFFF",
  border: "#E6EEF6",
  muted: "#5C6B82",
  success: "#1F8A70",
  danger: "#C2414A",
}

const SEED_HEX = new Set(
  [...Object.values(SEED_GLOBAL_COLORS), "#101820", "#d45b98", "#16386f"].map((v) => canonicalHex(v)).filter((v): v is string => !!v),
)

export type BrandColorSource = {
  palette?: Record<string, string | null | undefined> | null
  appearance?: Record<string, string | boolean | null | undefined> | null
  primary?: string | null
  secondary?: string | null
  accent?: string | null
  text?: string | null
  ink?: string | null
  paper?: string | null
  foreground?: string | null
  bg?: string | null
  surface?: string | null
  muted?: string | null
  border?: string | null
  navy?: string | null
}

function canonicalHex(value: unknown): string | null {
  if (typeof value !== "string") return null
  let raw = value.trim()
  if (!raw) return null
  if (raw[0] !== "#") {
    if (/^[0-9a-fA-F]{3,8}$/.test(raw)) raw = `#${raw}`
    else return null
  }
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const s = raw.slice(1).toLowerCase()
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`
  }
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase()
  return null
}

function hexEqual(a: unknown, b: unknown): boolean {
  const left = canonicalHex(a)
  const right = canonicalHex(b)
  return !!left && left === right
}

function isSeedHex(value: unknown): boolean {
  const n = canonicalHex(value)
  return !!n && SEED_HEX.has(n)
}

function shadeHex(hex: string, factor: number): string {
  const n = canonicalHex(hex)
  if (!n) return hex
  const ch = (i: number) => Math.max(0, Math.min(255, Math.round(parseInt(n.slice(i, i + 2), 16) * (1 - factor))))
  return `#${[ch(1), ch(3), ch(5)].map((v) => v.toString(16).padStart(2, "0")).join("")}`
}

function pickHex(source: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const hex = canonicalHex(source[key])
    if (hex) return hex
  }
  return fallback
}

export function resolveBrandGlobalColors(
  brand: BrandColorSource | null | undefined,
  fallback: Omit<BuilderGlobals["colors"], "success" | "danger"> | BuilderGlobals["colors"],
): Omit<BuilderGlobals["colors"], "success" | "danger"> {
  const d = fallback
  const palette = (brand?.palette ?? {}) as Record<string, unknown>
  const appearance = (brand?.appearance ?? {}) as Record<string, unknown>
  const flat = { ...(brand ?? {}), ...appearance, ...palette } as Record<string, unknown>
  return {
    primary: pickHex(flat, ["primary", "primary_color"], d.primary),
    secondary: pickHex(flat, ["secondary", "secondary_color", "navy", "navy_color", "ink"], d.secondary),
    text: pickHex(flat, ["text", "text1_color", "foreground", "ink"], d.text),
    accent: pickHex(flat, ["accent", "accent_color"], d.accent),
    background: pickHex(flat, ["bg", "background", "paper"], d.background),
    surface: pickHex(flat, ["surface", "surface_color", "paper"], d.surface),
    border: pickHex(flat, ["border", "border_color"], d.border),
    muted: pickHex(flat, ["muted", "text2_color"], d.muted),
  }
}

export function colorsAreUnsetOrSeed(colors: unknown): boolean {
  if (!colors || typeof colors !== "object") return true
  const incoming = colors as Record<string, unknown>
  for (const key of Object.keys(SEED_GLOBAL_COLORS) as (keyof typeof SEED_GLOBAL_COLORS)[]) {
    if (key === "success" || key === "danger") continue
    const raw = incoming[key]
    if (raw == null || String(raw).trim() === "") continue
    if (!hexEqual(raw, SEED_GLOBAL_COLORS[key])) return false
  }
  return true
}

function isStockOrSeedColor(current: string | undefined, stock: string | undefined): boolean {
  if (current === "transparent" && stock === "transparent") return true
  return hexEqual(current, stock) || isSeedHex(current)
}

function incomingColors(incoming: unknown, globals: BuilderGlobals): unknown {
  if (incoming === undefined) return globals.colors
  if (incoming && typeof incoming === "object" && "colors" in (incoming as object)) {
    return (incoming as { colors?: unknown }).colors
  }
  return incoming
}

/**
 * When published/draft globals have no colors (or still the historical blush seed),
 * paint tokens from the tenant brand palette / storefront appearance. Explicit
 * user-saved colors are left alone.
 */
export function applyBrandColors(globals: BuilderGlobals, brand: BrandColorSource | null | undefined, incoming?: unknown, stock: BuilderGlobals = globals): BuilderGlobals {
  const raw = incomingColors(incoming, globals)
  if (!colorsAreUnsetOrSeed(raw)) return globals
  const resolved = resolveBrandGlobalColors(brand, stock.colors)
  const c = { ...globals.colors, ...resolved }
  const hoverP = shadeHex(c.primary, 0.12)
  const hoverS = shadeHex(c.secondary, 0.12)
  const typography = { ...globals.typography, link: { ...globals.typography.link } }
  if (isStockOrSeedColor(typography.link.color, stock.typography.link.color)) typography.link.color = c.accent
  const desired = {
    primary: variant(c.primary, "#FFFFFF", hoverP, "#FFFFFF"),
    secondary: variant(c.secondary, "#FFFFFF", hoverS, "#FFFFFF"),
    outline: variant("transparent", c.secondary, c.background, c.secondary, c.border),
    ghost: variant("transparent", c.secondary, c.background, c.accent, "transparent"),
  }
  const variants = { ...globals.buttons.variants }
  for (const name of Object.keys(desired) as (keyof typeof desired)[]) {
    const next = { ...variants[name] }
    for (const field of Object.keys(desired[name]) as (keyof ButtonVariant)[]) {
      if (isStockOrSeedColor(next[field], stock.buttons.variants[name][field])) next[field] = desired[name][field]
    }
    variants[name] = next
  }
  const forms = { ...globals.forms }
  const formMap: [keyof typeof forms, string][] = [
    ["labelColor", c.text],
    ["fieldBackground", c.surface],
    ["borderColor", c.border],
    ["focusColor", c.accent],
  ]
  for (const [key, value] of formMap) {
    if (isStockOrSeedColor(forms[key], stock.forms[key])) forms[key] = value
  }
  const layout = { ...globals.layout }
  if (isStockOrSeedColor(layout.background, stock.layout.background)) layout.background = c.background
  const incomingPalette = incoming && typeof incoming === "object" ? (incoming as { palette?: { id?: string; value?: string }[] }).palette : undefined
  const paletteIsSeed = !incomingPalette?.length || incomingPalette.some((s) => s?.id === "blush") && incomingPalette.every((s) => !s?.value || isSeedHex(s.value) || hexEqual(s.value, "#101820"))
  const palette = !incomingPalette?.length || paletteIsSeed ? [
    { id: "primary", name: "اصلی", value: c.primary },
    { id: "secondary", name: "ثانویه", value: c.secondary },
    { id: "background", name: "پس‌زمینه", value: c.background },
    { id: "text", name: "متن", value: c.text },
  ] : (globals.palette ?? stock.palette)
  return { ...globals, colors: c, typography, buttons: { ...globals.buttons, variants }, forms, layout, palette }
}
