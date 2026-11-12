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
  logo_id: null,
  logo_dark_id: null,
  favicon_id: null,
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

/** Map branding font slugs to a CSS font-family stack (never set the slug itself as the family). */
export function brandFontStack(font: string | null | undefined): string | null {
  if (!font) return null
  switch (font) {
    case "yekan-bakh":
      return 'var(--font-yekan), "Yekan Bakh", Tahoma, sans-serif'
    case "vazirmatn":
      return '"Vazirmatn", var(--font-yekan), "Yekan Bakh", Tahoma, sans-serif'
    case "iran-sans":
      return '"IRANSans", var(--font-yekan), "Yekan Bakh", Tahoma, sans-serif'
    case "inter":
      return 'Inter, ui-sans-serif, system-ui, "Segoe UI", Tahoma, sans-serif'
    case "system":
      return "system-ui, -apple-system, Segoe UI, Tahoma, sans-serif"
    default:
      return null
  }
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
 * Isolate every public storefront shell from dashboard `html.dark` / accent leakage.
 * Without this, resume (and other non-classic) sites inherit the fixed teal
 * `--color-card` / `--color-background` (`#091E24` / oklch 22% .03 220) for chrome + footer.
 */
function shellIsolationCss(branding?: Partial<SiteBranding> | null): string {
  const p = resolveBrandPalette(branding)
  const dark = branding?.appearance?.dark_mode_default === true
  const bgHex = p.bg || PARISMA_PALETTE.bg
  const surfaceHex = p.surface || PARISMA_PALETTE.surface
  const textHex = p.text || PARISMA_PALETTE.text
  const mutedHex = p.muted || PARISMA_PALETTE.muted
  const borderHex = p.border || PARISMA_PALETTE.border!
  const bg = dark ? (isLightHex(bgHex) ? "#0b1220" : bgHex) : bgHex
  const surface = dark ? (isLightHex(surfaceHex) ? "#141c2b" : surfaceHex) : surfaceHex
  const text = dark && isLightHex(textHex) ? "#e8eef7" : textHex
  const muted = dark && isLightHex(mutedHex) ? "#9aa8bd" : mutedHex
  const border = dark && isLightHex(borderHex) ? "#243044" : borderHex
  const footer = p.footer ?? PARISMA_PALETTE.footer!
  const footerBg = dark && isLightHex(footer) ? surface : footer
  const primaryFg = isLightHex(p.primary) ? "#111827" : "#ffffff"
  const fontStack =
    brandFontStack(branding?.font_body || branding?.font || branding?.font_heading) || brandFontStack("yekan-bakh")
  const headingStack = brandFontStack(branding?.font_heading || branding?.font) || fontStack
  const usesVazir = [branding?.font_body, branding?.font_heading, branding?.font_ui, branding?.font].includes("vazirmatn")
  // Vazirmatn is not self-hosted: load the same open licence webfont the builder font presets use.
  const vazirFace = usesVazir
    ? `@font-face{font-family:"Vazirmatn";src:url("https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/fonts/webfonts/Vazirmatn%5Bwght%5D.woff2") format("woff2");font-weight:100 900;font-display:swap}\n`
    : ""
  const headingRule = headingStack ? `.sf-shell :is(h1,h2,h3,h4,h5,h6){font-family:${headingStack}}\n` : ""
  // Beat `.dark [data-accent=…]` surface tokens (0,2,0) so public shells keep brand palette.
  return `${vazirFace}${headingRule}.sf-shell,.dark .sf-shell,.dark[data-accent] .sf-shell,html.dark .sf-shell{
  color-scheme:${dark ? "dark" : "light"};
  ${fontStack ? `font-family:${fontStack};` : ""}
  --color-background:${bg};
  --color-foreground:${text};
  --color-card:${surface};
  --color-card-foreground:${text};
  --color-popover:${surface};
  --color-popover-foreground:${text};
  --color-primary:${p.primary};
  --color-primary-foreground:${primaryFg};
  --color-secondary:${surface};
  --color-secondary-foreground:${text};
  --color-muted:${surface};
  --color-muted-foreground:${muted};
  --color-accent:${p.accent};
  --color-accent-foreground:${primaryFg};
  --color-border:${border};
  --color-input:${border};
  --color-ring:${p.primary};
  --color-sidebar:${bg};
  --color-sidebar-foreground:${text};
  --color-sidebar-primary:${p.primary};
  --color-sidebar-primary-foreground:${primaryFg};
  --color-sidebar-border:${border};
  --color-sidebar-accent:${surface};
  --color-sidebar-accent-foreground:${text};
  --color-sidebar-ring:${p.primary};
  --wb-color-primary:${p.primary};
  --wb-color-secondary:${p.secondary};
  --wb-color-accent:${p.accent};
  --wb-color-background:${bg};
  --wb-color-surface:${surface};
  --wb-color-text:${text};
  --wb-color-muted:${muted};
  --wb-color-border:${border};
  --sf-footer-bg:${footerBg};
}`
}

/**
 * Scoped CSS so Style / Classic Theme settings drive storefront tokens without fighting
 * the isolated dark palette (inline styles would override `.dark` rules).
 * All themes get shell isolation; classic also gets Parisma/SFC token mapping.
 */
/** Magazine / academy / resume shells: brand fonts + soft atmospheric page wash (not flat chrome). */
function magazineAtmosphereCss(branding?: Partial<SiteBranding> | null): string {
  const p = resolveBrandPalette(branding)
  const font =
    brandFontStack(branding?.font_heading) ||
    brandFontStack(branding?.font_body) ||
    brandFontStack(branding?.font) ||
    brandFontStack("yekan-bakh")
  const primary = p.primary
  const navy = p.navy ?? p.secondary
  const header = p.header ?? PARISMA_PALETTE.header!
  const footer = p.footer ?? PARISMA_PALETTE.footer!
  const footerFg = isLightHex(footer) ? navy : "#ffffff"
  const headerFg = isLightHex(header) ? navy : "#ffffff"
  return `.sf-shell{
  ${font ? `font-family:${font};` : ""}
  background:
    radial-gradient(ellipse 80% 50% at 100% 0%, ${primary}24, transparent 55%),
    radial-gradient(ellipse 55% 40% at 0% 100%, ${navy}14, transparent 50%),
    ${p.bg};
}
/* Builder poetry chrome (.akx-navwrap / .akx-foot) paints its own glass capsule and footer: keep the atmosphere off it. */
.sf-shell header:not(.akx-navwrap),
.sf-shell [data-site-header]:not(:has(.akx-navwrap)){
  background: color-mix(in srgb, ${header} 92%, transparent);
  color: ${headerFg};
  backdrop-filter: blur(14px) saturate(1.15);
  border-bottom: 1px solid ${p.border};
}
.sf-shell footer:not(.akx-foot),
.sf-shell [data-site-footer]:not(:has(.akx-foot)){
  background: ${footer};
  color: ${footerFg};
}
.sf-shell a{color:inherit}`
}

export function storefrontStyleCss(
  branding?: Partial<SiteBranding> | null,
  themeSlug?: string | null,
): string {
  const isolate = shellIsolationCss(branding)
  // Classic storefront only — extra skin tokens on top of isolation.
  if (themeSlug !== "ecommerce-classic") {
    // Magazine / builder academies (and other non-classic shells) still need
    // expressive brand atmosphere — otherwise pages look like blank chrome.
    if (themeSlug === "magazine-default" || themeSlug === "resume-default" || !themeSlug) {
      return `${isolate}${magazineAtmosphereCss(branding)}`
    }
    return isolate
  }
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
  const fontStack = brandFontStack(typeof typo.font_family === "string" ? typo.font_family : null)
  const fontWeight = Number(typo.font_weight ?? 400)
  const rating = hex(typo.rating_color, "#f9bc00")

  // Chrome that must stay readable on whatever footer colour the brand picked.
  // The classic footer markup was written for a white footer; a dark navy footer
  // (the common case for industrial / fashion brands) needs light text tokens.
  const footerHex = p.footer ?? PARISMA_PALETTE.footer!
  const footerIsDark = !isLightHex(footerHex)
  const footerFg = footerIsDark ? "#ffffff" : navy
  const footerLink = footerIsDark ? "rgba(255,255,255,0.78)" : navy
  const footerMuted = footerIsDark ? "rgba(255,255,255,0.55)" : p.muted
  const footerRule = footerIsDark ? "rgba(255,255,255,0.12)" : p.border
  const footerSurface = footerIsDark ? "rgba(255,255,255,0.05)" : p.surface
  // Sale / discount accents follow the brand so a warm palette never ships a stray crimson.
  const sale = p.primary
  const saleFg = isLightHex(sale) ? "#111827" : "#ffffff"
  const primaryFg = isLightHex(pink) ? "#111827" : "#ffffff"

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
  --sfc-footer-bg:${footerHex};
  --sfc-footer-fg:${footerFg};
  --sfc-footer-link:${footerLink};
  --sfc-footer-muted:${footerMuted};
  --sfc-footer-rule:${footerRule};
  --sfc-footer-surface:${footerSurface};
  --sfc-sale:${sale};
  --sfc-sale-fg:${saleFg};
  --sfc-topbar-bg:${navy};
  --sfc-topbar-fg:#ffffff;
  --sfc-logo-h:${logoH}px;
  --sfc-logo-h-mobile:${logoHM}px;
  --sfc-font-size:${fontSize}px;
  --sfc-line-height:${lineHeight};
  --sfc-rating:${rating};
  --sf-pink:${pink};
  --sf-pink-soft:${pink}1f;
  --sf-navy:${navy};
  --sf-navy-soft:${p.border};
  --sf-search-bg:${p.surface};
  --color-primary:${pink};
  --color-primary-foreground:${primaryFg};
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
  ${fontStack ? `font-family:${fontStack};` : ""}
  ${Number.isFinite(fontWeight) && fontWeight >= 100 && fontWeight <= 900 ? `font-weight:${Math.round(fontWeight / 100) * 100};` : ""}
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
  --sfc-footer-fg:#ffffff;
  --sfc-footer-link:rgba(255,255,255,0.78);
  --sfc-footer-muted:rgba(255,255,255,0.55);
  --sfc-footer-rule:rgba(255,255,255,0.12);
  --sfc-footer-surface:rgba(255,255,255,0.05);
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

  return `${isolate}${light}${dark}`
}
