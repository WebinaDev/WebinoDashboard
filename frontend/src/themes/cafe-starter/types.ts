export type CatalogCategory = {
  id: number
  name: string
  slug: string
  description?: string | null
  icon_url?: string | null
  image_url?: string | null
  sort_order?: number
}

export type CatalogVariant = {
  id: number
  name: string
  price_minor: number
  is_default?: boolean
  sort_order?: number
}

export type CatalogItem = {
  id: number
  slug: string
  name: string
  description?: string | null
  image_url?: string | null
  price_minor: number
  discounted_price_minor: number
  currency: string
  is_available: boolean
  is_new: boolean
  discount_percent: number
  category?: CatalogCategory | null
  variants?: CatalogVariant[]
}

export type CafeMenuSettings = {
  default_view: "grid" | "list"
  show_search: boolean
  show_category_bar: boolean
  show_new_badge: boolean
  header_cta_label_fa?: string | null
  header_cta_label_en?: string | null
  header_cta_url?: string | null
  placeholder_logo_text_fa?: string | null
  placeholder_logo_text_en?: string | null
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
}

export type CafeVenuePayload = {
  tenant: { name: string; active_theme_slug?: string | null }
  menu: CafeMenuSettings
  hours: CafeHoursSettings
  gallery: CafeGallerySettings
  venue: CafeVenueSettings
}

export type CatalogPayload = {
  categories: CatalogCategory[]
  items: CatalogItem[]
  query?: string | null
}
