"use client"

import { useTranslations } from "next-intl"

import { SearchMultiSelect, type SearchOption } from "@/components/coupons/SearchMultiSelect"
import { api } from "@/lib/api"

type ProductHit = { id: number; name: string; sku?: string | null }

function toOption(p: ProductHit): SearchOption {
  return { id: p.id, label: p.name, hint: p.sku }
}

async function searchProducts(q: string): Promise<SearchOption[]> {
  const res = await api<ProductHit[] | { data?: ProductHit[] }>(
    `/api/v1/products?search=${encodeURIComponent(q)}&per_page=20&page=1`,
  )
  const rows = Array.isArray(res) ? res : (res.data ?? [])
  return rows.map(toOption)
}

async function resolveProduct(id: number): Promise<SearchOption | null> {
  try {
    return toOption(await api<ProductHit>(`/api/v1/products/${id}`))
  } catch {
    return null
  }
}

export function ProductMultiSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: number[]
  onChange: (ids: number[]) => void
}) {
  const t = useTranslations("coupons")
  return (
    <SearchMultiSelect
      label={label}
      value={value}
      onChange={onChange}
      placeholder={t("picker.searchProducts")}
      emptyText={t("picker.empty")}
      removeLabel={t("picker.remove")}
      queryKey="coupon-product-picker"
      search={searchProducts}
      resolve={resolveProduct}
    />
  )
}
