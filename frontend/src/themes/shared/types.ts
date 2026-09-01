import type { SiteBranding } from "@/kernel/theme-types"

export type SiteChromeProps = {
  siteName: string
  branding?: Partial<SiteBranding> | null
}

export function resolveSiteBranding(branding?: Partial<SiteBranding> | null): SiteBranding {
  return {
    logo_url: branding?.logo_url ?? null,
    logo_dark_url: branding?.logo_dark_url ?? null,
    favicon_url: branding?.favicon_url ?? null,
    accent: branding?.accent ?? "zinc",
    font: branding?.font ?? "yekan-bakh",
  }
}
