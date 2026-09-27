"use client"

import { useTranslations } from "next-intl"
import { useCallback } from "react"

/** Groups under the `enums` message namespace. */
export type EnumGroup =
  | "order_status"
  | "product_status"
  | "stock_status"
  | "post_status"
  | "review_status"
  | "return_status"
  | "withdrawal_status"
  | "c2c_status"
  | "payment_tender"
  | "sales_channel"
  | "product_type"
  | "role"
  | "catalog_visibility"
  | "coupon_type"
  | "job_status"
  | "attribute_type"

type EnumTranslator = {
  (key: string): string
  has: (key: string) => boolean
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/-/g, "_")
}

/** Translate `slug` via `enums.<group>.<slug>`; unknown slugs fall back to the raw value. */
export function translateEnum(
  t: EnumTranslator,
  group: EnumGroup,
  slug: string | null | undefined,
  empty = "—"
): string {
  if (!slug) return empty
  const key = `${group}.${normalizeSlug(slug)}`
  return t.has(key) ? t(key) : slug
}

/** Hook form: `const label = useEnumLabel(); label("order_status", o.status)`. */
export function useEnumLabel() {
  const t = useTranslations("enums") as unknown as EnumTranslator
  return useCallback(
    (group: EnumGroup, slug: string | null | undefined, empty?: string) => translateEnum(t, group, slug, empty),
    [t]
  )
}

/** Badge variant per status slug (success / warning / destructive tone). */
export function statusBadgeVariant(slug: string | null | undefined): "default" | "secondary" | "outline" | "destructive" {
  const s = normalizeSlug(slug ?? "")
  if (["completed", "paid", "publish", "published", "approved", "instock", "refunded", "done", "success", "sent", "active", "posted", "delivered"].includes(s)) return "default"
  if (["cancelled", "canceled", "failed", "error", "payment_failed", "rejected", "trash", "outofstock", "expired", "void"].includes(s)) return "destructive"
  if (["processing", "shipped", "on_hold", "pending", "pending_payment", "awaiting_gateway", "requested", "received", "draft", "private", "onbackorder", "queued", "running", "scheduled", "sending", "paused"].includes(s))
    return "secondary"
  return "outline"
}
