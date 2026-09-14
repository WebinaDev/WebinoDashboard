/** Keep in sync with App\Models\Order::STATUSES */
export const ORDER_STATUSES = [
  "pending_payment",
  "awaiting_gateway",
  "on_hold",
  "paid",
  "payment_failed",
  "processing",
  "shipped",
  "completed",
  "cancelled",
  "refunded",
  "failed",
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]
