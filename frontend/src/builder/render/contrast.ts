/** Generic "is this section background dark?" helpers (all templates). Pure, SSR-safe. */

const NAMED: Record<string, string> = { black: "#000000", white: "#ffffff", transparent: "" }

function channels(color: string): [number, number, number, number] | null {
  const c = (NAMED[color.trim().toLowerCase()] ?? color).trim()
  if (!c) return null
  let m = /^#([0-9a-f]{3,8})$/i.exec(c)
  if (m) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = h.split("").map((x) => x + x).join("")
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a]
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(c)
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    return [Number(m[1]), Number(m[2]), Number(m[3]), a]
  }
  return null
}

/** WCAG relative luminance (0..1) of a colour, or the average of the colours inside a gradient. */
export function luminance(value: string | null | undefined): number | null {
  if (!value || typeof value !== "string") return null
  const parts = value.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) ?? [value]
  const lums = parts
    .map(channels)
    .filter((x): x is [number, number, number, number] => !!x && x[3] > 0.2)
    .map(([r, g, b]) => {
      const f = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    })
  return lums.length ? lums.reduce((a, b) => a + b, 0) / lums.length : null
}

export const DARK_LUMINANCE = 0.22

export function isDarkColor(value: string | null | undefined): boolean {
  const l = luminance(value)
  return l !== null && l < DARK_LUMINANCE
}

/**
 * A section reads as dark when: tone=dark, or a bg image sits under an overlay that is dark (default overlay is
 * dark crimson) with opacity ≥ 35%, or a solid bg/overlay colour is dark.
 */
export function sectionIsDark(input: { tone?: string; bgImage?: string; bgOverlay?: string; bgOverlayOpacity?: number; bgColor?: string }): boolean {
  if (input.tone === "dark") return true
  const op = input.bgOverlayOpacity ?? 70
  if (input.bgImage) {
    if (!input.bgOverlay) return op >= 35
    if (isDarkColor(input.bgOverlay) && op >= 35) return true
  } else if (input.bgOverlay && isDarkColor(input.bgOverlay) && op >= 60) return true
  return isDarkColor(input.bgColor)
}
