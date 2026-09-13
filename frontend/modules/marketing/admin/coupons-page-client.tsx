"use client"

import { unwrapApiResponse } from "@webina/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { ApiError, api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Coupon = {
  id: number
  code: string
  type: string
  amount: number
  status: string
  usage_count: number
  usage_limit?: number | null
  expires_at?: string | null
}

type Stats = { total: number; publish: number; draft: number }

async function fetchCoupons(search: string): Promise<{ items: Coupon[]; stats?: Stats }> {
  const qs = new URLSearchParams({ per_page: "50" })
  if (search.trim()) qs.set("search", search.trim())
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  const res = await fetch(`${base}/api/v1/marketing/coupons?${qs}`, {
    credentials: "include",
    headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
  })
  const text = await res.text()
  let raw: unknown = null
  try {
    raw = text ? JSON.parse(text) : null
  } catch {
    raw = null
  }
  if (!res.ok) {
    throw new ApiError(getApiErrorMessage(new ApiError(`HTTP ${res.status}`, res.status, raw), raw as never), res.status, raw)
  }
  const { data, meta } = unwrapApiResponse<Coupon[]>(raw)
  return {
    items: Array.isArray(data) ? data : [],
    stats: (meta as { stats?: Stats } | null | undefined)?.stats,
  }
}

export default function CouponsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("coupons_admin")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput), 300)
    return () => window.clearTimeout(id)
  }, [searchInput])

  const q = useQuery({
    queryKey: ["coupons", search],
    queryFn: () => fetchCoupons(search),
  })

  const trash = useMutation({
    mutationFn: (id: number) => api(`/api/v1/marketing/coupons/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setError(null)
      await qc.invalidateQueries({ queryKey: ["coupons"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const items = q.data?.items ?? []
  const stats = q.data?.stats

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button asChild>
          <Link href="/admin/marketing/coupons/new">{t("actions.new")}</Link>
        </Button>
      </div>

      {stats && (
        <div className="flex flex-wrap gap-3 text-sm">
          <span>
            {t("stats.total")}: {stats.total}
          </span>
          <span>
            {t("stats.publish")}: {stats.publish}
          </span>
          <span>
            {t("stats.draft")}: {stats.draft}
          </span>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">{t("list")}</CardTitle>
          <Input
            className="max-w-xs"
            placeholder={t("search")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </CardHeader>
        <CardContent>
          {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
          {q.isLoading && <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start text-xs text-muted-foreground">
                  <th className="p-2">{t("cols.code")}</th>
                  <th className="p-2">{t("cols.type")}</th>
                  <th className="p-2">{t("cols.amount")}</th>
                  <th className="p-2">{t("cols.status")}</th>
                  <th className="p-2">{t("cols.usage")}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-3 text-muted-foreground">
                      {t("empty")}
                    </td>
                  </tr>
                ) : (
                  items.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-2 font-mono">
                        <Link className="underline" href={`/admin/marketing/coupons/${c.id}`}>
                          {c.code}
                        </Link>
                      </td>
                      <td className="p-2">{c.type}</td>
                      <td className="p-2">{c.amount}</td>
                      <td className="p-2">{c.status}</td>
                      <td className="p-2">
                        {c.usage_count}
                        {c.usage_limit != null ? ` / ${c.usage_limit}` : ""}
                      </td>
                      <td className="p-2 text-end">
                        <Button variant="destructive" size="sm" disabled={trash.isPending} onClick={() => trash.mutate(c.id)}>
                          {t("actions.trash")}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
