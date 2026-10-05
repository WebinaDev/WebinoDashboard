export type SiteThemeManifest = {
  slug: string
  nameFa: string
  nameEn: string
  siteTypes: string[]
  isDemo: boolean
  preview: string
  sortOrder: number
}

export type SiteBrandFont = "yekan-bakh" | "system" | "vazirmatn" | "iran-sans"

export type SiteBrandPalette = {
  primary: string
  secondary: string
  accent: string
  bg: string
  surface: string
  text: string
  muted: string
  navy?: string
  header?: string
  footer?: string
  border?: string
}

export type StorefrontAppearanceColors = {
  primary_color?: string
  accent_color?: string
  navy_color?: string
  surface_color?: string
  header_bg?: string
  footer_bg?: string
  border_color?: string
}

export type SiteBranding = {
  logo_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  accent: "zinc" | "slate" | "blue" | "green" | "rose" | "orange"
  font: SiteBrandFont
  font_body?: SiteBrandFont
  font_heading?: SiteBrandFont
  font_ui?: SiteBrandFont
  palette?: Partial<SiteBrandPalette> | null
  appearance?: StorefrontAppearanceColors | null
}

export type SiteThemeCatalogItem = {
  slug: string
  name_fa: string
  name_en: string
  site_types: string[]
  is_demo: boolean
  preview: string
  sort_order: number
}

export type ThemeCatalogResponse = {
  site_type_slug: string | null
  active_theme_slug: string | null
  branding: SiteBranding
  themes: SiteThemeCatalogItem[]
  accents: SiteBranding["accent"][]
  fonts: SiteBranding["font"][]
}
