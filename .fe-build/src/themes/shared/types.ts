import type { SiteBranding } from "@/kernel/theme-types"

import { DEFAULT_SITE_BRANDING, PARISMA_PALETTE } from "./branding"

export type SiteChromeProps = {
  siteName: string
  branding?: Partial<SiteBranding> | null
}

export function resolveSiteBranding(branding?: Partial<SiteBranding> | null): SiteBranding {
  const font = branding?.font ?? DEFAULT_SITE_BRANDING.font
  return {
    logo_url: branding?.logo_url ?? null,
    logo_dark_url: branding?.logo_dark_url ?? null,
    favicon_url: branding?.favicon_url ?? null,
    accent: branding?.accent ?? "zinc",
    font,
    font_body: branding?.font_body ?? font,
    font_heading: branding?.font_heading ?? font,
    font_ui: branding?.font_ui ?? font,
    palette: { ...PARISMA_PALETTE, ...(branding?.palette ?? {}) },
    appearance: branding?.appearance ?? null,
  }
}
