"use client"

import { useTranslations } from "next-intl"

import { SearchMultiSelect, type SearchOption } from "@/components/coupons/SearchMultiSelect"
import { api } from "@/lib/api"

type UserHit = { id: number; name?: string | null; email?: string | null; phone?: string | null }

function toOption(u: UserHit): SearchOption {
  return { id: u.id, label: u.name || u.email || u.phone || `#${u.id}`, hint: u.email || u.phone }
}

async function searchUsers(q: string): Promise<SearchOption[]> {
  const res = await api<UserHit[] | { data?: UserHit[] }>(`/api/v1/users?search=${encodeURIComponent(q)}&per_page=20`)
  const rows = Array.isArray(res) ? res : (res.data ?? [])
  return rows.map(toOption)
}

async function resolveUser(id: number): Promise<SearchOption | null> {
  try {
    return toOption(await api<UserHit>(`/api/v1/users/${id}`))
  } catch {
    return null
  }
}

export function UserMultiSelect({
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
      placeholder={t("picker.searchUsers")}
      emptyText={t("picker.empty")}
      removeLabel={t("picker.remove")}
      queryKey="coupon-user-picker"
      search={searchUsers}
      resolve={resolveUser}
    />
  )
}
