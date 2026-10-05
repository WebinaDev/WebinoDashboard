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
  text3?: string
  navy?: string
  header?: string
  footer?: string
  border?: string
}

export type StorefrontAppearanceColors = {
  primary_color?: string
  secondary_color?: string
  accent_color?: string
  text1_color?: string
  text2_color?: string
  text3_color?: string
  navy_color?: string
  surface_color?: string
  header_bg?: string
  footer_bg?: string
  border_color?: string
}

export type ClassicThemeLink = { label?: string; href?: string; icon?: string; image?: string; title?: string; text?: string; links?: ClassicThemeLink[] }

export type ClassicThemeSettings = StorefrontAppearanceColors & {
  header_style?: string
  mega_menu?: boolean
  dark_mode_default?: boolean
  show_top_bar?: boolean
  top_bar_text?: string
  product_card_style?: string
  pdp_gallery_style?: string
  sticky_add_to_cart?: boolean
  show_installment_badge?: boolean
  footer_columns?: number
  typography?: {
    font_family?: string
    font_size?: number
    font_weight?: number
    line_height?: number
  }
  general?: {
    logo_height_desktop?: number
    logo_height_mobile?: number
    logo_404_url?: string
    bg_404?: string
    loading_icon_url?: string
    mobile_bottom_menu_enabled?: boolean
    mobile_bottom_menu?: ClassicThemeLink[]
  }
  header?: {
    ajax_search?: boolean
    ajax_search_mobile?: boolean
    search_placeholder?: string
    voice_search?: boolean
    quick_voice_search?: boolean
    /** Path prefixes where voice mic is hidden (newline/comma list or string[]). */
    voice_excluded_paths?: string | string[]
    search_title_only?: boolean
    search_sku?: boolean
    deals_enabled?: boolean
    deals_title?: string
    deals_subtitle?: string
    deals_link?: string
    deals_timer_end?: string
    deals_timer_title?: string
    mega_menu?: boolean
    mega_menu_title?: string
    sticky_desktop?: boolean
    banner_enabled?: boolean
    banner_type?: string
    banner_link?: string
    banner_image_desktop?: string
    banner_image_mobile?: string
    banner_text?: string
    banner_bg?: string
    banner_text_color?: string
  }
  footer?: {
    about?: string
    trust_text?: string
    enamad_html?: string
    samandehi_html?: string
    ecommerce_badge_html?: string
    footer_links?: ClassicThemeLink[]
    copyright?: string
    copyright_sub?: string
    support_phone?: string
    support_email_title?: string
    support_email?: string
    address_title?: string
    address?: string
    social_telegram?: string
    social_twitter?: string
    social_whatsapp?: string
    social_facebook?: string
    social_igap?: string
    social_rubika?: string
    social_soroush?: string
    social_bale?: string
    social_eitaa?: string
    payment_methods?: ClassicThemeLink[]
    show_developer_credit?: boolean
    developer_title?: string
    developer_name?: string
    developer_link?: string
    developer_logo?: string
  }
  commerce?: {
    ajax_add_to_cart?: boolean
    product_share?: boolean
    gallery_lightbox?: boolean
    gallery_thumbs?: string
    important_attrs_count?: number
    features?: ClassicThemeLink[]
    shipping_text_enabled?: boolean
    shipping_text?: string
    installment_enabled?: boolean
    installment_title?: string
    installment_text?: string
    installment_link?: string
    installment_image?: string
    card_installment_enabled?: boolean
    card_installment_text?: string
    card_installment_image?: string
    sticky_cart_mobile?: boolean
    sticky_cart_desktop?: boolean
    /** bottom | left | right */
    sticky_cart_side?: string
    card_add_to_cart?: boolean
    compare_enabled?: boolean
    show_rating?: boolean
    fake_stats_enabled?: boolean
    fake_stats_factor?: number
    /** 1–10 range width for promotional stats */
    fake_stats_sensitivity?: number
  }
  archive?: {
    sidebar_enabled?: boolean
    category_slider?: boolean
    product_columns?: number
    products_per_page?: number
    default_sort?: string
    filters_open_default?: boolean
  }
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
  appearance?: ClassicThemeSettings | null
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
