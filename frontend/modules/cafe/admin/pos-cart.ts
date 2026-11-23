/**
 * The till's basket maths.
 *
 * Kept out of the component so the money can be reasoned about and tested on its own: a
 * discount that is applied twice, or a fee that only appears after the guest has paid, is
 * the kind of bug that costs real cash at a counter.
 *
 * Everything is in the store's minor unit (toman or rial, never fractions). The server has
 * the final say — it re-prices every line — so this is for showing the guest the right number
 * before they pay, not for deciding what they owe.
 */

export type CartModifier = {
  option_id: number
  name: string
  price_delta_minor: number
}

export type CartLine = {
  /** Stable key: same product, variant and add-ons merge into one line. */
  key: string
  product_id: number
  product_variant_id: number | null
  name: string
  variant_name: string | null
  /** Catalogue price before add-ons, from the bootstrap payload. */
  base_price_minor: number
  quantity: number
  modifiers: CartModifier[]
  note: string | null
  /** Kitchen routing, so the pass knows where the ticket goes without a second lookup. */
  station_name?: string | null
}

export type DiscountType = "none" | "percent" | "amount" | "coupon" | "loyalty"

export type PosFees = {
  packaging_minor: number
  packaging_mode: "per_order" | "per_item" | string
  service_percent: number
  service_dine_in_only: boolean
  delivery_minor: number
  free_delivery_from_minor: number
}

export type Fulfillment = "dine_in" | "takeaway" | "delivery"

/** One line's unit price: base + every priced add-on. */
export function lineUnitMinor(line: CartLine): number {
  return line.base_price_minor + line.modifiers.reduce((sum, m) => sum + m.price_delta_minor, 0)
}

/** One line's total. */
export function lineTotalMinor(line: CartLine): number {
  return lineUnitMinor(line) * line.quantity
}

/**
 * A key that merges identical lines but separates lines that differ in any priced way.
 *
 * The note is part of the key on purpose: two lattes with different notes ("no sugar" and
 * "extra hot") must reach the kitchen as two lines, or the cook gets one instruction and
 * the guest gets one wrong drink.
 */
export function cartKey(
  productId: number,
  variantId: number | null,
  modifiers: CartModifier[],
  note: string | null,
): string {
  const mods = modifiers
    .map((m) => m.option_id)
    .sort((a, b) => a - b)
    .join(".")
  return `${productId}:${variantId ?? "base"}:${mods}:${(note ?? "").trim()}`
}

export function subtotalMinor(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotalMinor(line), 0)
}

/**
 * Fees, computed exactly as `CafeOrdering::fees()` does.
 *
 * Packaging is per order or per item depending on the tenant's setting, and the service
 * charge applies to dine-in only unless the tenant says otherwise. Delivery is free above
 * the threshold, and the threshold is checked against the *discounted* subtotal — a coupon
 * that drops the basket below the free-delivery line has to pay the fee again, or the
 * promotion would be worth more than it says.
 */
export function feesMinor(
  lines: CartLine[],
  fulfillment: Fulfillment,
  fees: PosFees | undefined,
  discountedSubtotal: number,
): { packaging: number; service: number; delivery: number; total: number } {
  if (!fees) return { packaging: 0, service: 0, delivery: 0, total: 0 }

  const units = lines.reduce((sum, line) => sum + line.quantity, 0)

  const packaging =
    fulfillment === "dine_in"
      ? 0
      : fees.packaging_mode === "per_item"
        ? fees.packaging_minor * units
        : units > 0
          ? fees.packaging_minor
          : 0

  const serviceApplies = !fees.service_dine_in_only || fulfillment === "dine_in"
  const service = serviceApplies ? Math.round((discountedSubtotal * fees.service_percent) / 100) : 0

  let delivery = 0
  if (fulfillment === "delivery" && units > 0) {
    const freeFrom = fees.free_delivery_from_minor
    delivery = freeFrom > 0 && discountedSubtotal >= freeFrom ? 0 : fees.delivery_minor
  }

  return { packaging, service, delivery, total: packaging + service + delivery }
}

/**
 * The amount the guest actually owes.
 *
 * A discount may never exceed the goods: a 100% coupon covers the food, and the guest still
 * pays delivery if there is any. Discounting into the fees would mean handing over cash.
 */
export function totalDueMinor(
  lines: CartLine[],
  discount: number,
  fulfillment: Fulfillment,
  fees: PosFees | undefined,
): { subtotal: number; discount: number; fees: number; total: number } {
  const rawSubtotal = subtotalMinor(lines)
  const appliedDiscount = Math.max(0, Math.min(discount, rawSubtotal))
  const discounted = rawSubtotal - appliedDiscount
  const feeRows = feesMinor(lines, fulfillment, fees, discounted)

  return {
    subtotal: rawSubtotal,
    discount: appliedDiscount,
    fees: feeRows.total,
    total: discounted + feeRows.total,
  }
}

/** Amount to show for a typed discount, in the same units as the subtotal. */
export function resolveDiscountMinor(
  type: DiscountType,
  lines: CartLine[],
  input: { percent: number; amountMinor: number; couponMinor: number; loyaltyMinor: number },
): number {
  const subtotal = subtotalMinor(lines)
  switch (type) {
    case "percent":
      return Math.max(0, Math.min(subtotal, Math.round((subtotal * input.percent) / 100)))
    case "amount":
      return Math.max(0, Math.min(subtotal, input.amountMinor))
    case "coupon":
      return Math.max(0, Math.min(subtotal, input.couponMinor))
    case "loyalty":
      return Math.max(0, Math.min(subtotal, input.loyaltyMinor))
    default:
      return 0
  }
}

/**
 * Split the bill across tenders.
 *
 * Returns the amount still unaccounted for. The settle button stays disabled until this is
 * zero, because a partially paid sale is the one state a cash drawer cannot explain later.
 */
export function remainingMinor(total: number, payments: Array<{ amount_minor: number }>): number {
  const paid = payments.reduce((sum, p) => sum + Math.max(0, p.amount_minor), 0)
  return total - paid
}

/** Cash to hand back. Non-cash tenders never produce change. */
export function changeMinor(payments: Array<{ tender: string; amount_minor: number; received_minor?: number | null }>): number {
  return payments.reduce((sum, p) => {
    if (p.tender !== "cash" || p.received_minor == null) return sum
    return sum + Math.max(0, p.received_minor - p.amount_minor)
  }, 0)
}

/** The payload the API expects. Prices are informational; the server re-prices. */
export function toPayload(
  lines: CartLine[],
  options: {
    fulfillment: Fulfillment
    branchId: number | null
    tableCode: string | null
    customerName: string
    customerPhone: string
    customerNote: string
    userId: number | null
    deliveryAddress: string
    deliveryZoneId: number | null
    discountType: DiscountType
    discountPercent: number
    discountAmountMinor: number
    couponCode: string
    loyaltyPoints: number
    payments: Array<{ tender: string; amount_minor: number; received_minor?: number | null; reference?: string | null }>
  },
): Record<string, unknown> {
  return {
    fulfillment: options.fulfillment,
    branch_id: options.branchId,
    table_code: options.fulfillment === "dine_in" ? options.tableCode : null,
    customer_name: options.customerName.trim() || null,
    customer_phone: options.customerPhone.trim() || null,
    customer_note: options.customerNote.trim() || null,
    user_id: options.userId,
    delivery_address: options.fulfillment === "delivery" ? options.deliveryAddress.trim() || null : null,
    delivery_zone_id: options.deliveryZoneId,
    items: lines.map((line) => ({
      product_id: line.product_id,
      product_variant_id: line.product_variant_id,
      quantity: line.quantity,
      modifier_option_ids: line.modifiers.map((m) => m.option_id),
      note: line.note,
    })),
    discount_type: options.discountType,
    discount_percent: options.discountType === "percent" ? options.discountPercent : null,
    discount_minor: options.discountType === "amount" ? options.discountAmountMinor : null,
    coupon_code: options.discountType === "coupon" ? options.couponCode.trim() || null : null,
    loyalty_points: options.discountType === "loyalty" ? options.loyaltyPoints : null,
    payments: options.payments.map((p) => ({
      tender: p.tender,
      amount_minor: p.amount_minor,
      received_minor: p.received_minor ?? null,
      reference: p.reference ?? null,
    })),
  }
}

/**
 * A draft's local shape.
 *
 * Stored in `localStorage` rather than the database: a half-typed order belongs to this
 * tablet, not to the tenant, and writing it server-side would leave abandoned rows the
 * reports have to learn to ignore.
 */
export type PosDraft = {
  lines: CartLine[]
  fulfillment: Fulfillment
  tableCode: string | null
  customerName: string
  customerPhone: string
  customerNote: string
  userId: number | null
  deliveryAddress: string
  discountType: DiscountType
  discountPercent: number
  discountAmountMinor: number
  couponCode: string
  loyaltyPoints: number
  updatedAt: string
}

export const DRAFT_KEY = "cafe.pos.draft.v1"

export function readDraft(): PosDraft | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PosDraft
    // A draft is a convenience, never a source of truth: anything unexpected is discarded
    // rather than half-restored into a live basket.
    if (!Array.isArray(parsed?.lines)) return null
    return parsed
  } catch {
    return null
  }
}

export function writeDraft(draft: PosDraft): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // A full quota must never stop a sale.
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(DRAFT_KEY)
  } catch {
    // ignore
  }
}
