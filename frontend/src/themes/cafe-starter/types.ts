export type CatalogCategory = {
  id: number
  name: string
  slug: string
  description?: string | null
  icon_url?: string | null
  image_url?: string | null
  cover_image_url?: string | null
  display_mode?: "grid" | "list" | "cover"
  sort_order?: number
}

export type CatalogVariant = {
  id: number
  name: string
  price_minor: number
  is_default?: boolean
  sort_order?: number
}

export type CatalogMedia = {
  id: number
  type: "image" | "video"
  url: string
  sort_order?: number
  is_cover?: boolean
}

export type CatalogAllergen = {
  id: number
  slug: string
  name_fa: string
  name_en: string
  icon_url?: string | null
}

export type CatalogModifierOption = {
  id: number
  name_fa: string
  name_en: string
  price_minor: number
  is_default?: boolean
  sort_order?: number
}

export type CatalogModifier = {
  id: number
  name_fa: string
  name_en: string
  min_select: number
  max_select: number
  is_required: boolean
  sort_order?: number
  options: CatalogModifierOption[]
}

export type CatalogItem = {
  id: number
  slug: string
  name: string
  description?: string | null
  image_url?: string | null
  cover_image_url?: string | null
  video_url?: string | null
  price_minor: number
  discounted_price_minor: number
  currency: string
  is_available: boolean
  is_sold_out?: boolean
  is_new: boolean
  is_featured?: boolean
  discount_percent: number
  calories?: number | null
  spice_level?: number
  menu_id?: number | null
  likes_count?: number
  category?: CatalogCategory | null
  variants?: CatalogVariant[]
  media?: CatalogMedia[]
  allergens?: CatalogAllergen[]
  modifiers?: CatalogModifier[]
}

export type MenuBanner = {
  id: number
  title_fa?: string | null
  title_en?: string | null
  image_url: string
  link_url?: string | null
  sort_order?: number
  is_active?: boolean
}

export type CafeBranch = {
  id: number
  name_fa: string
  name_en: string
  slug: string
  address_fa?: string | null
  address_en?: string | null
  phone?: string | null
  is_active?: boolean
}

export type CafeMenuListItem = {
  id: number
  name: string
  slug: string
  menu_type?: string
  locale?: string | null
  description?: string | null
}

export type CafeEngagementSettings = {
  phone_gate_enabled?: boolean
  likes_enabled?: boolean
  feedback_enabled?: boolean
  share_whatsapp_enabled?: boolean
  share_telegram_enabled?: boolean
}

export type CafeMenuSettings = {
  default_view: "grid" | "list" | "cover"
  show_search: boolean
  show_category_bar: boolean
  show_new_badge: boolean
  header_cta_label_fa?: string | null
  header_cta_label_en?: string | null
  header_cta_url?: string | null
  placeholder_logo_text_fa?: string | null
  placeholder_logo_text_en?: string | null
  accent_color?: string | null
  seasonal_theme?: "none" | "nowruz" | "yalda" | "ramadan" | "summer" | null
  font_preset?: "sans" | "serif" | "display" | null
  teaser_video_url?: string | null
  packaging_fee_minor?: number | null
  delivery_fee_minor?: number | null
  free_delivery_threshold_minor?: number | null
  prep_minutes?: number | null
  max_orders_per_day?: number | null
  block_orders_when_closed?: boolean
  fulfillment_dine_in?: boolean
  fulfillment_pickup?: boolean
  fulfillment_delivery?: boolean
}

export type CafeOrderingStatus = {
  is_open: boolean | null
  reason?: string | null
  accepting_orders: boolean
  prep_minutes: number
  packaging_fee_minor: number
  delivery_fee_minor: number
  free_delivery_threshold_minor: number
  fulfillment: { dine_in: boolean; pickup: boolean; delivery: boolean }
}

export type CafeHoursDay = {
  day: string
  open?: string | null
  close?: string | null
  closed?: boolean
}

export type CafeHoursSettings = {
  timezone?: string
  days: CafeHoursDay[]
  closed_dates?: string[]
}

export type CafeGalleryImage = {
  url: string
  caption_fa?: string | null
  caption_en?: string | null
  sort_order?: number
}

export type CafeGallerySettings = {
  images: CafeGalleryImage[]
}

export type CafeVenueSettings = {
  tagline_fa?: string | null
  tagline_en?: string | null
  about_fa?: string | null
  about_en?: string | null
  phone?: string | null
  instagram?: string | null
  address_fa?: string | null
  address_en?: string | null
  map_url?: string | null
  mini_site_enabled?: boolean
  whatsapp_url?: string | null
  telegram_url?: string | null
  bill_pay_url?: string | null
}

export type CafeVenuePayload = {
  tenant: { name: string; active_theme_slug?: string | null }
  menu: CafeMenuSettings
  hours: CafeHoursSettings
  gallery: CafeGallerySettings
  venue: CafeVenueSettings
  ordering?: CafeOrderingStatus
}

export type CatalogPayload = {
  categories: CatalogCategory[]
  items: CatalogItem[]
  menus?: CafeMenuListItem[]
  banners?: MenuBanner[]
  branches?: CafeBranch[]
  hours?: CafeHoursSettings
  engagement?: CafeEngagementSettings
  currency_display?: {
    currency?: string
    currency_position?: string
    thousand_separator?: string
    decimal_separator?: string
    price_decimals?: number
  }
  query?: string | null
  branch?: string | null
}

export type CafeEvent = {
  id: number
  title_fa: string
  title_en: string
  description_fa?: string | null
  description_en?: string | null
  starts_at: string
  ends_at?: string | null
  capacity: number
  price_minor: number
}
