"use client"

import { unwrapApiResponse } from "@webina/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { CouponBuilder } from "@/components/coupons/CouponBuilder"
import { CouponsBulkActions } from "@/components/coupons/CouponsBulkActions"
import { CouponsTable, type CouponTableRow } from "@/components/coupons/CouponsTable"
import { ListFiltersCollapsible } from "@/components/ListFiltersCollapsible"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { useConfirm } from "@/components/ConfirmDialog"
import { PageShell } from "@/components/PageShell"
import { PostsPagination } from "@/components/PostsPagination"
import { QueryErrorState } from "@/components/QueryErrorState"
import { TableListSkeleton } from "@/components/TableListSkeleton"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { ApiError, api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Stats = { total: number; publish: number; draft: number; expired?: number }
type ExpiredFilter = "all" | "expired" | "active"

async function fetchCoupons(page: number, perPage: number, search: string, expired: ExpiredFilter) {
  const qs = new URLSearchParams({ page: String(page), per_page: String(perPage) })
  if (search.trim()) qs.set("search", search.trim())
  if (expired !== "all") qs.set("expired", expired === "expired" ? "1" : "0")
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
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [expired, setExpired] = useState<ExpiredFilter>("all")
  const [tab, setTab] = useState("list")
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
    queryKey: ["coupons", page, perPage, search, expired],
    queryFn: () => fetchCoupons(page, perPage, search, expired),
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
          { id: "expired", label: t("statsExpired"), value: stats?.expired ?? 0 },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList tabsValue={tab} onTabsChange={setTab}>
          <TabsTrigger value="list">{t("tabs.list")}</TabsTrigger>
          <TabsTrigger value="builder">{t("tabs.builder")}</TabsTrigger>
        </TabsList>
        <Button type="button" size="sm" asChild>
          <Link href="/dashboard/marketing/coupons/new">
            <Plus className="size-4" />
            {t("addCoupon")}
          </Link>
        </Button>
      </div>

      {tab === "builder" ? (
        <CouponBuilder onCreated={() => setTab("list")} />
      ) : (
        <>
          <ListFiltersCollapsible activeCount={(search.trim() ? 1 : 0) + (expired !== "all" ? 1 : 0)}>
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
              <div className="w-40 space-y-1">
                <Label>{t("expiredFilter.label")}</Label>
                <Select
                  value={expired}
                  onValueChange={(v) => {
                    setExpired(v as ExpiredFilter)
                    setPage(1)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("expiredFilter.all")}</SelectItem>
                    <SelectItem value="expired">{t("expiredFilter.expired")}</SelectItem>
                    <SelectItem value="active">{t("expiredFilter.active")}</SelectItem>
                  </SelectContent>
                </Select>
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
            <CardContent className="p-0">
              {q.isError ? (
                <QueryErrorState className="m-4" onRetry={() => q.refetch()} />
              ) : q.isLoading ? (
                <TableListSkeleton rows={8} columns={7} />
              ) : (
                <CouponsTable
                  items={items}
                  selectedIds={selectedIds}
                  onSelectedChange={setSelectedIds}
                  trashingId={trashingId}
                  onTrash={(row) =>
                    confirm({
                      description: row.code,
                      onConfirm: async () => {
                        setTrashingId(row.id)
                        try {
                          await trash.mutateAsync(row.id)
                        } finally {
                          setTrashingId(null)
                        }
                      },
                    })
                  }
                />
              )}
              {!q.isLoading ? (
                <PostsPagination
                  className="px-3 pb-3"
                  page={page}
                  perPage={perPage}
                  found={found}
                  onPageChange={setPage}
                  onPerPageChange={(n) => {
                    setPerPage(n)
                    setPage(1)
                  }}
                />
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
      {confirmDialog}
    </PageShell>
  )
}
