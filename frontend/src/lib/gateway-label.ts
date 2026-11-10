"use client"

import { useTranslations } from "next-intl"
import { useCallback } from "react"

/**
 * Customer/admin label for a payment gateway id. Order: merchant title → payments_hub.<id>
 * translation → humanised id (never the raw snake_case id).
 */
export function useGatewayLabel() {
  const t = useTranslations("payments_hub")
  return useCallback(
    (id: string, title?: string | null) => {
      const custom = (title ?? "").trim()
      if (custom && custom !== id) return custom
      if (id && t.has(id as never)) return t(id as never)
      return humanizeGatewayId(id)
    },
    [t],
  )
}

export function humanizeGatewayId(id: string): string {
  return String(id || "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}
