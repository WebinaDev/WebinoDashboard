import type { BuilderGlobals } from "./globals"
import { contrastingInk, ensureContrast, isDarkColor, pickReadableColor } from "./render/contrast"

/**
 * Map builder brand colours onto the shadcn/Tailwind `--color-*` tokens used by
 * `text-foreground`, `text-primary`, `bg-card`, form chrome, and glass defaults.
 *
 * `.sf-shell` is painted by the active appearance theme (often a light magazine
 * palette with navy `#021959` / `#4d5e8a` ink). `.wb-site` already sets
 * `--wb-color-text`, but widgets that use Tailwind semantic colours still inherit
 * the shell navy — unreadable on a dark or glass page. Aliases are emitted on
 * `.wb-canvas,.wb-site` so every widget follows the site tokens.
 *
 * On a dark background, primary/accent used as *text* are swapped for a
 * contrasting candidate (accent, then ink) when the brand primary would fail
 * WCAG AA. Stored builder data is not rewritten.
 */
export function storefrontColorAliases(
  colors: BuilderGlobals["colors"],
  forms?: BuilderGlobals["forms"],
): Record<string, string> {
  const bg = colors.background
  const text = ensureContrast(colors.text, bg, [colors.text])
  const muted = ensureContrast(colors.muted, bg, [colors.muted, text])
  const dark = isDarkColor(bg)
  const primaryText = dark
    ? pickReadableColor(bg, [colors.primary, colors.accent, text])
    : colors.primary
  const accentText = dark
    ? pickReadableColor(bg, [colors.accent, colors.primary, text])
    : colors.accent
  const primaryFg = contrastingInk(primaryText, text)
  const accentFg = contrastingInk(accentText, text)
  const label = ensureContrast(forms?.labelColor, bg, [forms?.labelColor, text, colors.text])

  const vars: Record<string, string> = {
    "--color-background": bg,
    "--color-foreground": text,
    "--color-card": colors.surface,
    "--color-card-foreground": text,
    "--color-popover": colors.surface,
    "--color-popover-foreground": text,
    "--color-primary": primaryText,
    "--color-primary-foreground": primaryFg,
    "--color-secondary": colors.secondary,
    "--color-secondary-foreground": contrastingInk(colors.secondary, text),
    "--color-muted": colors.surface,
    "--color-muted-foreground": muted,
    "--color-accent": accentText,
    "--color-accent-foreground": accentFg,
    "--color-border": colors.border,
    "--color-input": colors.border,
    "--color-ring": accentText,
    "--wbx-ink": text,
    "--wbx-accent": dark ? accentText : colors.primary,
  }
  if (label && forms?.labelColor && label !== forms.labelColor) vars["--wb-label-color"] = label
  if (text !== colors.text) vars["--wb-color-text"] = text
  if (muted !== colors.muted) vars["--wb-color-muted"] = muted
  if (dark) vars["color-scheme"] = "dark"
  return vars
}

export function storefrontColorAliasesCss(colors: BuilderGlobals["colors"], forms?: BuilderGlobals["forms"]): string {
  return Object.entries(storefrontColorAliases(colors, forms)).map(([key, value]) => `${key}:${value}`).join(";")
}
