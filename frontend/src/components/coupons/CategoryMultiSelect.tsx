"use client"

import { useTranslations } from "next-intl"

import { SearchMultiSelect, type SearchOption } from "@/components/coupons/SearchMultiSelect"
import { api } from "@/lib/api"

type Hit = { id: number; name: string; slug?: string }

function toOption(row: Hit): SearchOption {
  return { id: row.id, label: row.name, hint: row.slug }
}

async function searchCategories(q: string): Promise<SearchOption[]> {
  const res = await api<Hit[] | { data?: Hit[] }>(
    `/api/v1/categories?search=${encodeURIComponent(q)}&per_page=50`,
  )
  const rows = Array.isArray(res) ? res : (res.data ?? [])
  const needle = q.trim().toLowerCase()
  return rows
    .filter((r) => !needle || r.name.toLowerCase().includes(needle) || (r.slug ?? "").toLowerCase().includes(needle))
    .slice(0, 20)
    .map(toOption)
}

async function resolveCategory(id: number): Promise<SearchOption | null> {
  try {
    return toOption(await api<Hit>(`/api/v1/categories/${id}`))
  } catch {
    return null
  }
}

export function CategoryMultiSelect({
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
      placeholder={t("picker.searchCategories")}
      emptyText={t("picker.empty")}
      removeLabel={t("picker.remove")}
      queryKey="coupon-category-picker"
      search={searchCategories}
      resolve={resolveCategory}
    />
  )
}
