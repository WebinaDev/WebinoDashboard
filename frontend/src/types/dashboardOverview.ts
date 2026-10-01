export type DashboardOverviewProductStats = {
  total: number
  by_status: Record<string, number>
  by_stock: Record<string, number>
}

export type DashboardOverviewOrderRow = {
  id: number
  number: string
  status: string
  status_label: string
  total: string
  date: string
  customer_name: string
  item_count: number
}

export type DashboardOverviewProductRow = {
  id?: number
  product_id?: number
  name: string
  status?: string
  price?: string
  date?: string
  image_url: string
  views?: number
  quantity?: number
  revenue?: number
}

export type OrderReportSummary = {
  revenue: number
  net_revenue: number
  refunds: number
  refund_count: number
  order_count: number
  avg_order_value: number
  items_sold: number
  discount_total: number
  shipping_total: number
  tax_total: number
  cogs: number
  gross_profit: number
  gross_margin_pct: number
  items_missing_cost: number
  new_customers: number
  returning_customers: number
  items_per_order: number
  [key: string]: number | boolean | undefined
}

export type OrderReportSeriesPoint = {
  key: string
  label: string
  revenue: number
  orders: number
  items: number
  cogs: number
  profit: number
  [key: string]: string | number
}

export type DashboardOverviewSales = {
  currency: string
  from: number
  to: number
  range?: "month" | "last30"
  month_label: string
  summary: OrderReportSummary
  compare_summary: OrderReportSummary
  series: OrderReportSeriesPoint[]
  compare_series: OrderReportSeriesPoint[]
  by_status?: Array<{ status: string; orders: number; revenue: number }>
  by_payment?: Array<{ method: string; orders: number; revenue: number }>
  by_hour?: Array<{ hour: number; orders: number; revenue: number }>
  recent_orders: DashboardOverviewOrderRow[]
  recent_products: DashboardOverviewProductRow[]
  top_products: DashboardOverviewProductRow[]
  top_products_by_views: DashboardOverviewProductRow[]
  top_categories: Array<{
    term_id: number
    name: string
    quantity: number
    revenue: number
  }>
  top_customers: Array<{
    customer_id: number
    name: string
    email: string
    orders: number
    revenue: number
  }>
}

export type DashboardTrafficPeriod = {
  id: string
  from: string
  to: string
  visitors: number
  views: number
  visitors_change_pct: number | null
  views_change_pct: number | null
}

export type DashboardOverviewTraffic = {
  active?: boolean
  source?: "native" | "wp-statistics"
  online: number
  highlight: {
    visitors: number
    views: number
    visitors_change_pct: number | null
    views_change_pct: number | null
  }
  periods: DashboardTrafficPeriod[]
  all_time: DashboardTrafficPeriod
  chart?: { series: Array<{ day: string; visitors: number; views: number }> }
}

export type DashboardOverviewSmsPanel = {
  provider: string
  balance: number | null
  low_balance: boolean
  unavailable?: boolean
  status: string
  default_from: string
  price_per_unit: number
}

export type DashboardOverviewPanels = {
  sms?: DashboardOverviewSmsPanel
  license: { active: boolean; demo: boolean; status: string }
  woocommerce: { active: boolean }
  analytics: { active: boolean; online: number }
  bots?: Array<{
    provider: string
    sessions_24h: number
    users_linked: number
    webhook_configured: boolean
    token_configured: boolean
    last_error: string
  }>
  security?: {
    active: boolean
    score: number | null
    waf_mode: string
    open_findings: number
  }
}

export type DashboardTaskOrdersBlock = {
  count: number
  preview: DashboardOverviewOrderRow[]
  href: string
}

export type DashboardFulfillmentAction =
  | "pack"
  | "ship"
  | "tracking"
  | "refund"
  | "return"

export type DashboardFulfillmentItem = {
  id: number
  number: string
  customer_name: string
  status: string
  status_label?: string
  href: string
  action: DashboardFulfillmentAction
  shipping_kind?: string
  shipping_label?: string
  purchase_type?: string
  payment_method_title?: string
  return_status?: string
  return_item?: string
  return_qty?: number
}

export type DashboardFulfillmentBucket = {
  count: number
  items: DashboardFulfillmentItem[]
  href: string
}

export type DashboardOverviewFulfillment = {
  pack: DashboardFulfillmentBucket
  ship: DashboardFulfillmentBucket
  tracking: DashboardFulfillmentBucket
  refund: DashboardFulfillmentBucket
  returns: DashboardFulfillmentBucket
}

export type DashboardOverviewTasks = {
  comments_hold: { count: number; href: string }
  orders_processing?: DashboardTaskOrdersBlock
  orders_on_hold?: DashboardTaskOrdersBlock
  products_outofstock?: { count: number; href: string }
}

export type DashboardOverviewAlert = {
  level: "error" | "warning" | "info"
  source: string
  message: string
  at: string
}

export type DashboardOverviewCommentRow = {
  id: number
  author_name: string
  content: string
  status: string
  date: string
  post_title: string
  post_id: number
  rating?: number
  href?: string
}

export type DashboardOverviewResponse = {
  generated_at: number
  locale?: string
  sections: string[]
  products?: DashboardOverviewProductStats
  panels?: DashboardOverviewPanels
  sales?: DashboardOverviewSales
  traffic?: DashboardOverviewTraffic
  tasks?: DashboardOverviewTasks
  fulfillment?: DashboardOverviewFulfillment
  comments?: {
    items: DashboardOverviewCommentRow[]
    counts: { hold: number; approved: number; spam: number; trash: number }
  }
  alerts?: DashboardOverviewAlert[]
  partner?: {
    order_count: number
    last_order_at?: string
    recent_orders: DashboardOverviewOrderRow[]
  }
  account?: {
    order_count: number
    last_order_at?: string
    recent_orders: DashboardOverviewOrderRow[]
    wallet_balance?: number
    wallet_enabled?: boolean
    wishlist_count?: number
    notifications_unread?: number
    tickets_open?: number
  }
}


/** Soft-fail helpers: overview builder may attach `{ error }` stubs for failed sections. */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

/** True when the payload is only an error stub (no usable section fields). */
export function isOverviewErrorStub(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (typeof value.error !== "string") return false
  // Real sections always carry domain keys; stubs are `{ error }` only.
  const keys = Object.keys(value).filter((k) => k !== "error")
  return keys.length === 0
}

export function asOverviewSales(
  value: unknown,
): DashboardOverviewSales | undefined {
  if (!isRecord(value) || isOverviewErrorStub(value)) return undefined
  if (!isRecord(value.summary)) return undefined
  return value as unknown as DashboardOverviewSales
}

export function asOverviewProducts(
  value: unknown,
): DashboardOverviewProductStats | undefined {
  if (!isRecord(value) || isOverviewErrorStub(value)) return undefined
  if (typeof value.total !== "number") return undefined
  return value as unknown as DashboardOverviewProductStats
}

export function asOverviewTraffic(
  value: unknown,
): DashboardOverviewTraffic | undefined {
  if (!isRecord(value) || isOverviewErrorStub(value)) return undefined
  if (typeof value.online !== "number" && value.online !== undefined) return undefined
  // Require highlight or online key so `{error}` and empty junk are rejected.
  if (!("online" in value) && !("highlight" in value)) return undefined
  return value as unknown as DashboardOverviewTraffic
}

export function asOverviewFulfillment(
  value: unknown,
): DashboardOverviewFulfillment | undefined {
  if (!isRecord(value) || isOverviewErrorStub(value)) return undefined
  if (!("pack" in value) && !("ship" in value)) return undefined
  return value as unknown as DashboardOverviewFulfillment
}

export function asOverviewComments(
  value: unknown,
):
  | {
      items: DashboardOverviewCommentRow[]
      counts: { hold: number; approved: number; spam: number; trash: number }
    }
  | undefined {
  if (!isRecord(value) || isOverviewErrorStub(value)) return undefined
  if (!Array.isArray(value.items)) return undefined
  return value as {
    items: DashboardOverviewCommentRow[]
    counts: { hold: number; approved: number; spam: number; trash: number }
  }
}

export function asOverviewPanels(
  value: unknown,
): DashboardOverviewPanels | undefined {
  if (!isRecord(value) || isOverviewErrorStub(value)) return undefined
  if (!isRecord(value.license) && !isRecord(value.woocommerce) && !isRecord(value.analytics)) {
    return undefined
  }
  return value as unknown as DashboardOverviewPanels
}
