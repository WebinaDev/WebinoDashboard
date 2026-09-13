"use client"

import { unwrapApiResponse } from "@webina/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { CouponsBulkActions } from "@/components/coupons/CouponsBulkActions"
import { CouponsTable, type CouponTableRow } from "@/components/coupons/CouponsTable"
import { ListFiltersCollapsible } from "@/components/ListFiltersCollapsible"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { PageShell } from "@/components/PageShell"
import { TableListSkeleton } from "@/components/TableListSkeleton"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { ApiError, api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Stats = { total: number; publish: number; draft: number }

async function fetchCoupons(page: number, perPage: number, search: string) {
  const qs = new URLSearchParams({ page: String(page), per_page: String(perPage) })
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
  const { data, meta } = unwrapApiResponse<CouponTableRow[]>(raw)
  return {
    items: Array.isArray(data) ? data : [],
    total: (meta as { total?: number } | null | undefined)?.total ?? (Array.isArray(data) ? data.length : 0),
    stats: (meta as { stats?: Stats } | null | undefined)?.stats,
  }
}

export default function CouponsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("coupons")
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [trashingId, setTrashingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(id)
  }, [searchInput])

  const q = useQuery({
    queryKey: ["coupons", page, perPage, search],
    queryFn: () => fetchCoupons(page, perPage, search),
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
  const found = q.data?.total ?? 0
  const stats = q.data?.stats

  return (
    <PageShell title={t("title")} description={t("description")}>
      <ListStatsStrip
        items={[
          { id: "total", label: t("stats.total"), value: stats?.total ?? found },
          { id: "publish", label: t("stats.publish"), value: stats?.publish ?? 0 },
          { id: "draft", label: t("stats.draft"), value: stats?.draft ?? 0 },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" size="sm" asChild>
          <Link href="/admin/marketing/coupons/new">
            <Plus className="size-4" />
            {t("addCoupon")}
          </Link>
        </Button>
      </div>

      <ListFiltersCollapsible activeCount={search.trim() ? 1 : 0} label={t("filters")}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              className="ps-9"
              placeholder={t("searchPlaceholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <CouponsBulkActions
            selectedIds={selectedIds}
            onDone={() => {
              setSelectedIds([])
              void qc.invalidateQueries({ queryKey: ["coupons"] })
            }}
          />
        </div>
      </ListFiltersCollapsible>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Card className="shadow-soft">
        <CardContent className="overflow-x-auto p-0">
          {q.isLoading ? (
            <TableListSkeleton rows={8} columns={7} />
          ) : (
            <CouponsTable
              items={items}
              selectedIds={selectedIds}
              onSelectedChange={setSelectedIds}
              trashingId={trashingId}
              onTrash={async (id) => {
                setTrashingId(id)
                try {
                  await trash.mutateAsync(id)
                } finally {
                  setTrashingId(null)
                }
              }}
            />
          )}
          {!q.isLoading && found > 0 ? (
            <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs">
              <span>
                {found} · page {page}
              </span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page * perPage >= found}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
                <select
                  className="border-input h-8 rounded-md border px-2"
                  value={perPage}
                  onChange={(e) => {
                    setPerPage(Number(e.target.value))
                    setPage(1)
                  }}
                >
                  {[10, 20, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}/page
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  )
}
