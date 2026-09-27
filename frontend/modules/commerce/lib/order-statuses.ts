/** Keep in sync with App\Models\Order::STATUSES */
export const ORDER_STATUSES = [
  "pending_payment",
  "awaiting_gateway",
  "on_hold",
  "paid",
  "payment_failed",
  "processing",
  "sent-to-warehouse",
  "webino-in-stock",
  "webino-packaged",
  "webino-courier",
  "webino-post",
  "webino-tipax",
  "webino-ready-to-ship",
  "webino-shipping",
  "shipped",
  "completed",
  "webino-returned",
  "webino-need-review",
  "webino-deleted",
  "cancelled",
  "refunded",
  "failed",
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** Pipeline steps for OrderStatusStepper (primary happy path). */
export const ORDER_STATUS_PIPELINE: OrderStatus[] = [
  "paid",
  "processing",
  "webino-in-stock",
  "webino-packaged",
  "webino-ready-to-ship",
  "webino-shipping",
  "completed",
]

export const ORDER_SHIP_BRANCHES: OrderStatus[] = [
  "webino-courier",
  "webino-post",
  "webino-tipax",
]

/** i18n enum keys use underscores for hyphenated statuses */
export function orderStatusEnumKey(status: string): string {
  return status.replace(/-/g, "_")
}
