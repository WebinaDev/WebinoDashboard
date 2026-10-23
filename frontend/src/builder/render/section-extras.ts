/* Section-level extras (both repos): full-bleed breakout + eslimi pattern overlay. Pure helpers (tested). */
import type { CSSProperties } from "react"
import type { SectionNode, SectionPattern } from "../types"

/** Static, cacheable SVG tile (public/builder/patterns/eslimi.svg, ~0.7 KB), used as a CSS mask so any colour works. */
export const ESLIMI_PATTERN_URL = "/builder/patterns/eslimi.svg"

export const PATTERN_DEFAULTS = { opacity: 12, color: "#c9a45c", scale: 96 } as const

const COLOR_SAFE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|var\(--[a-z0-9-]+\)|[a-z]+)$/i

/** fullBleed only applies to a full-width (desktopWidth=full) section; half/wide/narrow stay in their row. */
export function sectionIsFullBleed(section: Pick<SectionNode, "fullBleed">, desktopWidth = "full"): boolean {
  return section.fullBleed === true && desktopWidth === "full"
}

export function patternOn(p: SectionPattern | undefined): p is SectionPattern {
  return Boolean(p && p.enabled)
}

/** CSS vars for the pattern layer: opacity 0–100 (%), colour (hex/rgb/name), scale = tile size 24–400 px. */
export function patternVars(p: SectionPattern | undefined): CSSProperties {
  const op = Number.isFinite(Number(p?.opacity)) ? Math.max(0, Math.min(100, Number(p?.opacity))) : PATTERN_DEFAULTS.opacity
  const color = p?.color && COLOR_SAFE.test(p.color.trim()) ? p.color.trim() : PATTERN_DEFAULTS.color
  const scale = Number.isFinite(Number(p?.scale)) && Number(p?.scale) > 0 ? Math.max(24, Math.min(400, Number(p?.scale))) : PATTERN_DEFAULTS.scale
  return { ["--wb-pat-op" as string]: String(op / 100), ["--wb-pat-color" as string]: color, ["--wb-pat-size" as string]: `${scale}px` } as CSSProperties
}

export function sectionExtraClass(section: Pick<SectionNode, "fullBleed" | "pattern">, desktopWidth = "full"): string {
  return [sectionIsFullBleed(section, desktopWidth) ? "wb-full-bleed" : "", patternOn(section.pattern) ? "wb-has-pattern" : ""].filter(Boolean).join(" ")
}
