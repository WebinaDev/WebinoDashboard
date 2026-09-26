export type MarketplaceKind = "api" | "feed"

export type MarketplacePlatformMeta = {
  slug: string
  fa: string
  en: string
  kind: MarketplaceKind
}

export const MARKETPLACE_PLATFORMS: MarketplacePlatformMeta[] = [
  { slug: "basalam", fa: "باسلام", en: "Basalam", kind: "api" },
  { slug: "digikala", fa: "دیجی‌کالا", en: "Digikala", kind: "api" },
  { slug: "snappshop", fa: "اسنپ‌شاپ", en: "SnappShop", kind: "api" },
  { slug: "tapsishop", fa: "تپسی‌شاپ", en: "TapsiShop", kind: "api" },
  { slug: "technolife", fa: "تکنولایف", en: "Technolife", kind: "api" },
  { slug: "emalls", fa: "ایمالز", en: "Emalls", kind: "feed" },
  { slug: "torob", fa: "ترب", en: "Torob", kind: "feed" },
  { slug: "zarehbin", fa: "ذره‌بین", en: "Zarehbin", kind: "feed" },
  { slug: "snapppay-search", fa: "جستجوی اسنپ‌پی", en: "SnappPay Search", kind: "feed" },
]

export const MARKETPLACE_SLUGS = MARKETPLACE_PLATFORMS.map((p) => p.slug)

export function marketplaceLabel(slug: string, locale: string = "fa"): string {
  const row = MARKETPLACE_PLATFORMS.find((p) => p.slug === slug)
  if (!row) return slug
  return locale === "en" ? row.en : row.fa
}

export function isMarketplaceChannel(slug: string | null | undefined): boolean {
  return !!slug && MARKETPLACE_SLUGS.includes(slug)
}

export function marketplaceMeta(slug: string): MarketplacePlatformMeta | undefined {
  return MARKETPLACE_PLATFORMS.find((p) => p.slug === slug)
}

export const MARKETPLACE_SETTINGS_BASE = "/dashboard/settings/shop/marketplace"

export type CredentialField = {
  key: string
  type: "text" | "secret" | "number" | "switch" | "textarea" | "secret_textarea" | "select"
  options?: { value: string; label: string }[]
  ltr?: boolean
  advanced?: boolean
}

export const MARKETPLACE_CREDENTIAL_FIELDS: Record<string, CredentialField[]> = {
  snappshop: [
    { key: "vendor_id", type: "text", ltr: true },
    { key: "shop_code", type: "text", ltr: true },
    { key: "token", type: "secret" },
    { key: "token_api", type: "secret" },
    { key: "user_agent", type: "text", ltr: true, advanced: true },
    { key: "base_url", type: "text", ltr: true, advanced: true },
    { key: "automation_base_url", type: "text", ltr: true, advanced: true },
  ],
  tapsishop: [
    { key: "username", type: "text", ltr: true },
    { key: "password", type: "secret" },
    { key: "store_id", type: "text", ltr: true },
    { key: "token", type: "secret" },
    { key: "token_name", type: "text", ltr: true, advanced: true },
    { key: "client_name", type: "text", ltr: true, advanced: true },
    { key: "client_version", type: "text", ltr: true, advanced: true },
    { key: "base_url", type: "text", ltr: true, advanced: true },
  ],
  technolife: [
    { key: "base_url", type: "text", ltr: true },
    { key: "api_key", type: "secret" },
    {
      key: "auth_header",
      type: "select",
      options: [
        { value: "bearer", label: "Authorization: Bearer" },
        { value: "x-api-key", label: "X-Api-Key" },
      ],
    },
    { key: "test_path", type: "text", ltr: true, advanced: true },
    { key: "products_path", type: "text", ltr: true, advanced: true },
    { key: "price_path", type: "text", ltr: true, advanced: true },
    { key: "stock_path", type: "text", ltr: true, advanced: true },
    { key: "orders_path", type: "text", ltr: true, advanced: true },
    { key: "order_path", type: "text", ltr: true, advanced: true },
  ],
  emalls: [
    { key: "per_page", type: "number" },
    { key: "expand_variations", type: "switch" },
    { key: "version", type: "text", ltr: true, advanced: true },
  ],
  zarehbin: [
    { key: "per_page", type: "number" },
    { key: "expand_variations", type: "switch" },
    { key: "version", type: "text", ltr: true, advanced: true },
  ],
  "snapppay-search": [
    { key: "per_page", type: "number" },
    { key: "expand_variations", type: "switch" },
    { key: "version", type: "text", ltr: true, advanced: true },
  ],
  torob: [
    { key: "per_page", type: "number" },
    { key: "expand_variations", type: "switch" },
    { key: "order_status_enabled", type: "switch" },
    { key: "orders_list_api_enabled", type: "switch" },
    { key: "product_page_webhook_enabled", type: "switch" },
    { key: "action_tracking_enabled", type: "switch" },
  ],
  digikala: [
    { key: "client_code", type: "text", ltr: true },
    { key: "credit_increase_percentage", type: "number" },
    { key: "webhook_secret", type: "secret" },
    { key: "base_url", type: "text", ltr: true, advanced: true },
  ],
  basalam: [
    { key: "vendor_id", type: "text", ltr: true },
    { key: "client_id", type: "text", ltr: true, advanced: true },
    { key: "client_secret", type: "secret", advanced: true },
    { key: "access_token", type: "secret", advanced: true },
    { key: "refresh_token", type: "secret", advanced: true },
    { key: "webhook_token", type: "secret", advanced: true },
    { key: "gateway_secret", type: "secret", advanced: true },
    { key: "base_url", type: "text", ltr: true, advanced: true },
    { key: "auth_url", type: "text", ltr: true, advanced: true },
  ],
}

export type MarketplaceHubRow = {
  platform: string
  label: string
  label_en: string
  kind: MarketplaceKind
  pricing_tab: string
  supports_orders: boolean
  supports_create: boolean
  enabled: boolean
  auto_sync: boolean
  configured: boolean
  maps_count: number
  map_errors: number
  last_sync_at: string | null
  orders_count: number
  failed_jobs: number
}

export type MarketplaceSettingsView = {
  enabled: boolean
  auto_sync: boolean
  credentials: Record<string, unknown>
  meta: { label: string; label_en: string; kind: MarketplaceKind; orders: boolean; create: boolean }
  feed_urls?: { key: string; url: string; method: string }[]
}

export type MarketplaceMapRow = {
  id: number
  platform: string
  product_id: number
  product_variant_id: number | null
  remote_product_id: string | null
  remote_variant_id: string | null
  remote_url: string | null
  remote_price: number | null
  remote_stock: number | null
  sync_enabled: boolean
  last_sync_at: string | null
  last_error: string | null
  product?: { id: number; name: string; sku: string | null; image_url: string | null; price_minor: number; stock: number | null } | null
  variant?: { id: number; name: string | null; sku: string | null; price_minor: number | null; stock: number | null } | null
}

export type MarketplaceJobRow = {
  id: number
  platform: string
  job_type: string
  priority: number
  payload: Record<string, unknown> | null
  status: string
  attempts: number
  last_error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export type MarketplaceLogRow = {
  id: number
  level: string
  channel: string
  message: string
  meta: Record<string, unknown> | null
  created_at: string
}

export type MarketplaceOrderRow = {
  id: number
  remote_order_id: string
  order_id: number | null
  status: string | null
  last_sync_at: string | null
  order?: { id: number; number: string; status: string; total_minor: number; currency: string; customer_name: string | null; created_at: string } | null
}

export type MarketplaceRemoteProduct = {
  id: string
  variant_id?: string
  title: string
  price?: number
  stock?: number
  sku?: string
  image?: string
}

export type Paginated<T> = {
  data: T[]
  meta?: { current_page: number; last_page: number; per_page: number; total: number }
}
