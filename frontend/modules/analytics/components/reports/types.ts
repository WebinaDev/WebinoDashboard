export type ReportInterval = "day" | "week" | "month"

export type ReportSummary = {
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
  wfcp_enabled: boolean
  new_customers: number
  returning_customers: number
  items_per_order: number
  target_margin_pct: number
}

export type ReportSeriesPoint = {
  key: string
  label: string
  revenue: number
  orders: number
  items: number
  cogs: number
  profit: number
  refunds: number
  coupons: number
  net: number
  tax: number
  shipping: number
}

export type ReportCompare = {
  from: number
  to: number
  from_date: string
  to_date: string
  summary: ReportSummary
  series: ReportSeriesPoint[]
}

export type ReportBase = {
  currency: string
  from: number
  to: number
  from_date: string
  to_date: string
  interval: ReportInterval
  statuses: string[]
  section: string
  truncated?: boolean
  summary: ReportSummary
  series: ReportSeriesPoint[]
  compare?: ReportCompare
}

export type StatusRow = { status: string; count: number; revenue: number }
export type PaymentRow = {
  method: string
  title: string
  count: number
  revenue: number
  cogs: number
  profit: number
  margin_pct: number
  avg_order_value: number
}
export type SourceRow = { source: string; count: number; revenue: number }
export type HourRow = { hour: number; orders: number; revenue: number }
export type HeatmapCell = { dow: number; hour: number; orders: number; revenue: number }
export type PriceTierRow = { tier: string; revenue: number; profit: number; count: number }
export type TopProductRow = { id: number; name: string; quantity: number; revenue: number }
export type TopProductProfitRow = TopProductRow & {
  cogs: number
  profit: number
  margin_pct: number
  missing_cost_qty: number
}
export type TopCategoryRow = { id: number; name: string; quantity: number; revenue: number }
export type TopCustomerRow = { name: string; email: string; orders: number; revenue: number }
export type TopCouponRow = { code: string; count: number; discount: number; revenue: number }

export type OrdersReport = ReportBase & {
  by_status: StatusRow[]
  by_payment: PaymentRow[]
  by_source: SourceRow[]
  by_hour: HourRow[]
  heatmap: HeatmapCell[]
  by_price_tier: PriceTierRow[]
  top_products: TopProductRow[]
  top_products_profit: TopProductProfitRow[]
  top_categories: TopCategoryRow[]
  top_customers: TopCustomerRow[]
  top_coupons: TopCouponRow[]
}

export type ListReport<T> = ReportBase & {
  items: T[]
  total: number
  page: number
  per_page: number
}

export type ProductRow = {
  id: number
  name: string
  quantity: number
  avg_sell_price: number
  avg_cost: number
  revenue: number
  cogs: number
  profit: number
  margin_pct: number
  missing_cost_qty: number
}
export type VariationRow = {
  id: number
  name: string
  quantity: number
  revenue: number
  cogs: number
  profit: number
  margin_pct: number
}
export type CategoryRow = {
  id: number
  name: string
  quantity: number
  revenue: number
  profit: number
  margin_pct: number
}
export type CouponRow = { code: string; count: number; discount: number; revenue: number }
export type TaxRow = {
  name: string
  code: string
  rate: number
  order_tax: number
  shipping_tax: number
  total: number
  orders: number
}
export type CustomerRow = {
  id: number
  name: string
  email: string
  type: "new" | "returning"
  orders: number
  revenue: number
  aov: number
}
export type DownloadRow = { product_id: number; name: string; downloads: number }

export type SalesItemRow = {
  id: number
  name: string
  quantity: number
  avg_cost: number
  avg_sell_price: number
  revenue: number
  cogs: number
  profit: number
  margin_pct: number
}
export type SalesReport = ListReport<SalesItemRow> & { by_price_tier: PriceTierRow[] }

export type UtmDimRow = {
  value: string
  count: number
  revenue: number
  cogs: number
  profit: number
  margin_pct: number
  avg_order_value: number
}
export type UtmComboRow = {
  utm_source: string
  utm_medium: string
  utm_campaign: string
  count: number
  revenue: number
  cogs: number
  profit: number
  margin_pct: number
}
export type FinancialOrderRow = {
  id: number
  number: string
  created_at: string
  customer_name: string
  status: string
  payment_method: string
  payment_title: string
  utm_source: string
  utm_medium: string
  utm_campaign: string
  total: number
}
export type FinancialReport = ReportBase & {
  by_payment: PaymentRow[]
  by_source: SourceRow[]
  by_status: StatusRow[]
  by_price_tier: PriceTierRow[]
  by_utm_source: UtmDimRow[]
  by_utm_medium: UtmDimRow[]
  by_utm_campaign: UtmDimRow[]
  by_utm: UtmComboRow[]
  orders_filtered: { items: FinancialOrderRow[]; total: number; page: number; per_page: number }
}

export type StockValueBase = "purchase" | "retail" | "current" | "wholesale" | "credit"

export type StockSummary = {
  sku_count: number
  units_in_stock: number
  outofstock_count: number
  low_stock_count: number
  missing_cost_count: number
  value_purchase: number
  value_retail: number
  value_current: number
  value_wholesale: number
  value_credit: number
  potential_profit: number
  wfcp_enabled: boolean
  target_margin_pct: number
  low_stock_threshold: number
}
export type StockRow = {
  id: number
  parent_id: number | null
  name: string
  sku: string
  type: string
  manage_stock: boolean
  stock_qty: number | null
  stock_status: string
  is_low_stock: boolean
  missing_cost: boolean
  prices: Record<string, number | null>
  values: Record<StockValueBase, number>
  potential_profit: number
  potential_margin: number
}
export type StockReport = {
  currency: string
  summary: StockSummary
  items: StockRow[]
  total: number
  page: number
  per_page: number
  /** Includes WFCP tiers + marketplace platform slugs when present. */
  price_keys?: string[]
}
