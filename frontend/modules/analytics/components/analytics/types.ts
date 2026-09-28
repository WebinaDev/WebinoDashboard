export type AnalyticsSourceField = { source?: string }

export type DailyTraffic = { day: string; visitors: number; views: number }

export type OnlineVisitor = {
  visitor_hash: string
  country: string | null
  last_seen: string | number | null
  hits: number
}

export type OverviewData = AnalyticsSourceField & {
  from: number
  to: number
  visitors: number
  views: number
  online: number
  series: DailyTraffic[]
  shop?: { order_count: number; revenue_minor: number; currency?: string | null } | null
}

export type VisitorsData = OverviewData & {
  sessions: number
  bounces: number
  bounce_rate: number | null
  avg_duration_ms: number | null
  top_visitors: Array<{
    visitor_hash: string
    hits: number
    country: string | null
    first_seen: string | number | null
    last_seen: string | number | null
  }>
  online_list: OnlineVisitor[]
}

export type PagesData = AnalyticsSourceField & {
  items: Array<{ uri: string; title: string | null; post_id: number | null; views: number }>
  total: number
  page: number
  per_page: number
}

export type ReferralCategory = "direct" | "search" | "social" | "referral"

export type ReferralsData = AnalyticsSourceField & {
  by_category: Partial<Record<ReferralCategory, number>>
  items: Array<{ category: string; source: string; visits: number }>
}

export type DimData = AnalyticsSourceField & {
  dim: string
  items: Array<{ value: string | null; views: number }>
}

export type OnlineData = AnalyticsSourceField & {
  count: number
  timeout: number
  visitors: OnlineVisitor[]
}

export type CommerceData = AnalyticsSourceField & {
  from_day: string
  to_day: string
  order_count: number
  revenue_minor: number
  currency?: string | null
  aov_minor: number
  conversion_pct: number | null
  channels: { site: number; instagram: number; other: number }
  new_customers: number
  returning_customers: number
  change: {
    order_count_pct: number | null
    revenue_pct: number | null
    aov_pct: number | null
    new_customers_pct: number | null
    returning_customers_pct: number | null
  }
  by_utm_source: Array<{ source: string; orders: number; revenue_minor: number }>
  top_viewed_products: Array<{ product_id: number; name: string; views: number }>
  top_cart_products: Array<{ product_id: number; name: string; adds: number }>
  top_purchased_products: Array<{ product_id: number; name: string; quantity: number; revenue_minor: number }>
  funnel: Array<{ step: FunnelStep; count: number }>
}

export type FunnelStep = "visitors" | "product_views" | "add_to_cart" | "checkout" | "orders"

export type CompareKey =
  | "visitors"
  | "views"
  | "avg_duration_ms"
  | "bounce_rate_pct"
  | "top_sources"
  | "top_pages"
  | "site_conversion_pct"

export type CompareData = AnalyticsSourceField & {
  current: { from_day: string; to_day: string }
  previous: { from_day: string; to_day: string }
  sessions_available: boolean
  rows: Array<{
    key: CompareKey
    current: number | string | null
    previous: number | string | null
    change_pct: number | null
  }>
}

export type SeoData = AnalyticsSourceField & {
  keywords_in_use: number
  optimized_pages: number
  internal_links_avg: number
  external_links_avg: number
  noindex_pct: number
  keywords_ai_month: number
  publish_count: number
  noindex_count: number
  links_sampled: number
  gsc_connected: boolean
}

export type SupportData = AnalyticsSourceField & {
  tickets_created: number
  staff_replies: number
  csat_avg: number | null
  csat_count: number
  frequent: Array<{ subject: string; count: number }>
}

export type ContentData = AnalyticsSourceField & {
  products_created: number
  products_updated: number
  posts_published: number
  pages_published: number
  ai_products: number
  ai_posts: number
  ai_pages: number
}

export type SummaryKey = "revenue" | "order_count" | "visitors" | "conversion"

export type MonthSummaryData = AnalyticsSourceField & {
  from_day: string
  to_day: string
  status: "growth" | "stable" | "decline"
  score: number
  composite: number
  top_achievement: { key: SummaryKey; change_pct: number } | null
  top_challenge: { key: SummaryKey; change_pct: number } | null
  deltas: Array<{ key: SummaryKey; change_pct: number | null; weight: number }>
  traffic: { visitors: number; views: number; sessions: number }
  commerce: { order_count: number; revenue_minor: number; currency?: string | null }
}
