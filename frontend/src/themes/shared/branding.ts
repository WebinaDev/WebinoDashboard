import type { ClassicThemeSettings, SiteBrandPalette, SiteBranding, StorefrontAppearanceColors } from "@/kernel/theme-types"

/** Parisma-like classic storefront defaults (light). */
export const PARISMA_PALETTE: SiteBrandPalette = {
  primary: "#e775ae",
  secondary: "#021959",
  accent: "#dc5f9d",
  bg: "#ffffff",
  surface: "#f3f5f8",
  text: "#021959",
  muted: "#4d5e8a",
  text3: "#8b97b3",
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

/** Relative luminance check for #rrggbb (true for whites / pale tints). */
function isLightHex(value: string): boolean {
  const v = hex(value, "#ffffff").slice(1)
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6
}

export function resolveBrandPalette(
  branding?: Partial<SiteBranding> | null,
): SiteBrandPalette {
  const p = branding?.palette ?? {}
  const a: StorefrontAppearanceColors = branding?.appearance ?? {}
  // Style (site.style palette) is canonical for brand colors; appearance fills chrome + gaps.
  const primary = hex(p.primary ?? a.primary_color, PARISMA_PALETTE.primary)
  const accent = hex(p.accent ?? a.accent_color, PARISMA_PALETTE.accent)
  const navy = hex(p.navy ?? p.secondary ?? a.navy_color ?? a.secondary_color ?? p.text, PARISMA_PALETTE.navy!)
  const secondary = hex(p.secondary ?? a.secondary_color ?? navy, PARISMA_PALETTE.secondary)
  const surface = hex(p.surface ?? a.surface_color, PARISMA_PALETTE.surface)
  const bg = hex(p.bg, PARISMA_PALETTE.bg)
  const text = hex(p.text ?? a.text1_color ?? p.navy ?? p.secondary, PARISMA_PALETTE.text)
  const muted = hex(p.muted ?? a.text2_color, PARISMA_PALETTE.muted)
  const text3 = hex(p.text3 ?? a.text3_color, PARISMA_PALETTE.text3!)
  const header = hex(p.header ?? a.header_bg, PARISMA_PALETTE.header!)
  const footer = hex(p.footer ?? a.footer_bg, PARISMA_PALETTE.footer!)
  const border = hex(p.border ?? a.border_color, PARISMA_PALETTE.border!)
  return {
    primary,
    secondary,
    accent,
    bg,
    surface,
    text,
    muted,
    text3,
    navy,
    header,
    footer,
    border,
  }
}

/**
 * Scoped CSS so Style / Classic Theme settings drive storefront tokens without fighting
 * the isolated dark palette (inline styles would override `.dark` rules).
 */
export function storefrontStyleCss(
  branding?: Partial<SiteBranding> | null,
  themeSlug?: string | null,
): string {
  // Classic storefront only — other skins keep their own tokens.
  if (themeSlug !== "ecommerce-classic") return ""
  const p = resolveBrandPalette(branding)
  const appearance = (branding?.appearance ?? {}) as ClassicThemeSettings
  const typo = appearance.typography ?? {}
  const general = appearance.general ?? {}
  const pink = p.primary
  const pinkHover = p.accent
  const navy = p.navy ?? p.secondary
  const scopes = [".sf-shell.sf-skin-classic", ".sf-classic", ".wb-canvas.sf-skin-classic"]
  const scope = scopes.join(", ")
  // A descendant selector must be appended to EVERY scope item. `${scope} .x` on a
  // comma list only scopes the last item and turns the others into bare matches —
  // that previously gave the whole shell / every canvas `height:48px`.
  const within = (descendant: string) => scopes.map((s) => `${s} ${descendant}`).join(", ")
  // Must mirror the dark selector in parity.css: storefront scheme attribute only,
  // never the dashboard/OS `html.dark` class.
  const darkScope = [
    '.sf-shell.sf-skin-classic[data-sf-scheme="dark"]',
    '[data-sf-scheme="dark"] .sf-classic',
    '[data-sf-scheme="dark"] .wb-canvas.sf-skin-classic',
    '.wb-canvas.sf-skin-classic[data-sf-scheme="dark"]',
  ].join(", ")

  const fontSize = Number(typo.font_size ?? 14)
  const lineHeight = Number(typo.line_height ?? 1.7)
  const logoH = Number(general.logo_height_desktop ?? 48)
  const logoHM = Number(general.logo_height_mobile ?? 36)

  const light = `${scope}{
  --sfc-pink:${pink};
  --sfc-pink-hover:${pinkHover};
  --sfc-pink-glow:${pink}8a;
  --sfc-pink-soft:${pink}1f;
  --sfc-navy:${navy};
  --sfc-ink:${p.text};
  --sfc-ink-2:${navy};
  --sfc-muted:${p.muted};
  --sfc-text-3:${p.text3 ?? PARISMA_PALETTE.text3};
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
  --sfc-logo-h:${logoH}px;
  --sfc-logo-h-mobile:${logoHM}px;
  --sfc-font-size:${fontSize}px;
  --sfc-line-height:${lineHeight};
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
  font-size:var(--sfc-font-size);
  line-height:var(--sfc-line-height);
}
${within(".sfc-header__logo img")}{
  height:var(--sfc-logo-h);
  width:auto;
  max-height:var(--sfc-logo-h);
}
@media (max-width:767px){
  ${within(".sfc-header__logo img")}{height:var(--sfc-logo-h-mobile);max-height:var(--sfc-logo-h-mobile);}
}`

  // Dark keeps isolated surfaces; brand pink/accent still follow settings. A light
  // footer colour (the white default) is a light-mode choice — painting it in dark
  // mode gave a white footer with light text. Builder canvases paint
  // --wb-color-background/text, so those must follow the dark surfaces too.
  const footerIsLight = isLightHex(p.footer ?? PARISMA_PALETTE.footer!)
  const dark = `${darkScope}{
  --sfc-pink:${pink};
  --sfc-pink-hover:${pinkHover};
  --sfc-pink-glow:${pink}66;
  --sfc-pink-soft:${pink}2e;
  ${footerIsLight ? "" : `--sfc-footer-bg:${p.footer};`}
  --sfc-topbar-bg:${navy};
  --wb-color-background:var(--sfc-bg);
  --wb-color-surface:var(--sfc-surface);
  --wb-color-text:var(--sfc-ink);
  --wb-color-muted:var(--sfc-muted);
  --wb-color-border:var(--sfc-border);
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
