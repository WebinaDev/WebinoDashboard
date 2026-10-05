import type { SiteBrandPalette, SiteBranding, StorefrontAppearanceColors } from "@/kernel/theme-types"

/** Parisma-like classic storefront defaults (light). */
export const PARISMA_PALETTE: SiteBrandPalette = {
  primary: "#e775ae",
  secondary: "#021959",
  accent: "#dc5f9d",
  bg: "#ffffff",
  surface: "#f3f5f8",
  text: "#021959",
  muted: "#4d5e8a",
  navy: "#021959",
  header: "#ffffff",
  footer: "#ffffff",
  border: "#e8edf3",
}

export const DEFAULT_SITE_BRANDING: SiteBranding = {
  logo_url: null,
  logo_dark_url: null,
  favicon_url: null,
  accent: "zinc",
  font: "yekan-bakh",
  font_body: "yekan-bakh",
  font_heading: "yekan-bakh",
  font_ui: "yekan-bakh",
  palette: { ...PARISMA_PALETTE },
  appearance: null,
}

export function siteFontClass(font: SiteBranding["font"] | undefined): string {
  return font === "system" ? "font-[system-ui,sans-serif]" : "font-sans"
}

export function siteAccentAttr(accent: SiteBranding["accent"]): string {
  return accent
}

function hex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback
  const v = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase()
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const s = v.slice(1).toLowerCase()
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`
  }
  return fallback
}

export function resolveBrandPalette(
  branding?: Partial<SiteBranding> | null,
): SiteBrandPalette {
  const p = branding?.palette ?? {}
  const a: StorefrontAppearanceColors = branding?.appearance ?? {}
  const primary = hex(a.primary_color ?? p.primary, PARISMA_PALETTE.primary)
  const accent = hex(a.accent_color ?? p.accent, PARISMA_PALETTE.accent)
  const navy = hex(a.navy_color ?? p.navy ?? p.secondary ?? p.text, PARISMA_PALETTE.navy!)
  const surface = hex(a.surface_color ?? p.surface, PARISMA_PALETTE.surface)
  const bg = hex(p.bg, PARISMA_PALETTE.bg)
  const text = hex(p.text ?? p.navy ?? p.secondary, PARISMA_PALETTE.text)
  const muted = hex(p.muted, PARISMA_PALETTE.muted)
  const header = hex(a.header_bg ?? p.header, PARISMA_PALETTE.header!)
  const footer = hex(a.footer_bg ?? p.footer, PARISMA_PALETTE.footer!)
  const border = hex(a.border_color ?? p.border, PARISMA_PALETTE.border!)
  return {
    primary,
    secondary: navy,
    accent,
    bg,
    surface,
    text,
    muted,
    navy,
    header,
    footer,
    border,
  }
}

/**
 * Scoped CSS so Style settings drive classic storefront tokens without fighting
 * the isolated dark palette (inline styles would override `.dark` rules).
 */
export function storefrontStyleCss(
  branding?: Partial<SiteBranding> | null,
  themeSlug?: string | null,
): string {
  // Classic storefront only — other skins keep their own tokens.
  if (themeSlug !== "ecommerce-classic") return ""
  const p = resolveBrandPalette(branding)
  const pink = p.primary
  const pinkHover = p.accent
  const navy = p.navy ?? p.secondary
  const scope = ".sf-shell.sf-skin-classic, .sf-classic, .wb-canvas.sf-skin-classic"
  const darkScope = [
    ".dark .sf-shell.sf-skin-classic",
    ".dark .sf-classic",
    ".dark .wb-canvas.sf-skin-classic",
    "html.dark .sf-shell.sf-skin-classic",
    "html.dark .sf-classic",
    "html.dark .wb-canvas.sf-skin-classic",
  ].join(", ")

  const light = `${scope}{
  --sfc-pink:${pink};
  --sfc-pink-hover:${pinkHover};
  --sfc-pink-glow:${pink}8a;
  --sfc-pink-soft:${pink}1f;
  --sfc-navy:${navy};
  --sfc-ink:${p.text};
  --sfc-ink-2:${navy};
  --sfc-muted:${p.muted};
  --sfc-bg:${p.bg};
  --sfc-card:${p.bg};
  --sfc-surface:${p.surface};
  --sfc-surface-2:${p.surface};
  --sfc-surface-3:${p.surface};
  --sfc-border:${p.border};
  --sfc-border-2:${p.border};
  --sfc-border-3:${p.border};
  --sfc-rule:${p.border};
  --sfc-header-bg:${p.header};
  --sfc-footer-bg:${p.footer ?? PARISMA_PALETTE.footer};
  --sfc-footer-fg:${(p.footer ?? "#ffffff").toLowerCase() === "#ffffff" || (p.footer ?? "").toLowerCase() === "#fff" ? navy : "#ffffff"};
  --sfc-topbar-bg:${navy};
  --sfc-topbar-fg:#ffffff;
  --sf-pink:${pink};
  --sf-pink-soft:${pink}1f;
  --sf-navy:${navy};
  --sf-navy-soft:${p.border};
  --sf-search-bg:${p.surface};
  --color-primary:${pink};
  --color-primary-foreground:#ffffff;
  --color-ring:${pink};
  --color-foreground:${p.text};
  --color-card-foreground:${p.text};
  --color-background:${p.bg};
  --color-card:${p.bg};
  --color-muted:${p.surface};
  --color-muted-foreground:${p.muted};
  --color-border:${p.border};
  --color-input:${p.border};
  --wb-color-primary:${pink};
  --wb-color-secondary:${navy};
  --wb-color-accent:${pinkHover};
  --wb-color-background:${p.bg};
  --wb-color-surface:${p.surface};
  --wb-color-text:${p.text};
  --wb-color-muted:${p.muted};
  --wb-color-border:${p.border};
}`

  // Dark keeps isolated surfaces; brand pink/accent/footer chrome still follow settings.
  const dark = `${darkScope}{
  --sfc-pink:${pink};
  --sfc-pink-hover:${pinkHover};
  --sfc-pink-glow:${pink}66;
  --sfc-pink-soft:${pink}2e;
  --sfc-footer-bg:${p.footer};
  --sfc-topbar-bg:${navy};
  --sf-pink:${pink};
  --sf-pink-soft:${pink}2e;
  --color-primary:${pink};
  --color-ring:${pink};
  --wb-color-primary:${pink};
  --wb-color-accent:${pinkHover};
  --wb-color-secondary:${navy};
}`

  return `${light}${dark}`
}
