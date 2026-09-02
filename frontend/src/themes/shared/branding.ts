import type { SiteBranding } from "@/kernel/theme-types"

export const DEFAULT_SITE_BRANDING: SiteBranding = {
  logo_url: null,
  logo_dark_url: null,
  favicon_url: null,
  accent: "zinc",
  font: "yekan-bakh",
}

export function siteFontClass(font: SiteBranding["font"]): string {
  return font === "system" ? "font-[system-ui,sans-serif]" : "font-sans"
}

export function siteAccentAttr(accent: SiteBranding["accent"]): string {
  return accent
}
