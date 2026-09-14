"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { unwrapApiResponse } from "@webina/ui"
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Store,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ListFiltersCollapsible } from "@/components/ListFiltersCollapsible"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { OrderStatusTabs } from "@/components/orders/OrderStatusTabs"
import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { ApiError, api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { ORDER_STATUSES } from "../lib/order-statuses"

type OrderRow = {
  id: number
  number?: string | null
  status: string
  total_minor: number
  customer_name?: string | null
  customer_phone?: string | null
  payment_tender?: string | null
  sales_channel?: string | null
  is_pos?: boolean
  created_at?: string
  user?: { id: number; name?: string | null } | null
}

type OrdersMeta = {
  current_page: number
  last_page: number
  per_page: number
  total: number
  stats?: {
    order_count?: number
    revenue?: number
    pending?: number
    processing?: number
    completed?: number
    aov?: number
  }
  status_counts?: Record<string, number>
}

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

const PAYMENT_TENDERS = ["cash", "card_to_card", "pos_terminal", "online", "wallet", "other"]
const SALES_CHANNELS = [
  "in_store",
  "phone",
  "bale",
  "eitaa",
  "rubika",
  "telegram",
  "instagram",
  "other",
  "online",
]

async function apiListWithMeta<T>(path: string): Promise<{ items: T[]; meta?: OrdersMeta }> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  const res = await fetch(`${base}${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
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
  const { data, meta } = unwrapApiResponse<T[]>(raw)
  return { items: Array.isArray(data) ? data : [], meta: meta as OrdersMeta | undefined }
}

export default function OrdersPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("orders_admin")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()

  const mineMode = route.path === "pos/my-orders" || searchParams.get("mine") === "1"

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [paymentTender, setPaymentTender] = useState("")
  const [salesChannel, setSalesChannel] = useState("")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number[]>([])
  const [bulkStatus, setBulkStatus] = useState("processing")
  const [error, setError] = useState<string | null>(null)

  const queryKey = [
    "admin-orders",
    mineMode,
    search,
    status,
    dateFrom,
    dateTo,
    paymentTender,
    salesChannel,
    page,
  ] as const

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("per_page", "20")
      if (mineMode) {
        params.set("mine", "1")
        if (route.path === "pos/my-orders") params.set("is_pos", "1")
      }
      if (search.trim()) params.set("search", search.trim())
      if (status) params.set("status", status)
      if (dateFrom) params.set("date_from", dateFrom)
      if (dateTo) params.set("date_to", dateTo)
      if (paymentTender) params.set("payment_tender", paymentTender)
      if (salesChannel) params.set("sales_channel", salesChannel)
      return apiListWithMeta<OrderRow>(`/api/v1/orders?${params}`)
    },
  })

  const orders = data?.items ?? []
  const meta = data?.meta
  const statusCounts = meta?.status_counts ?? {}
  const stats = meta?.stats

  const statusTabs = useMemo(() => {
    const keys = Object.keys(statusCounts)
    return [
      { slug: "all", label: t("all"), count: meta?.total ?? 0 },
      ...keys.map((k) => ({ slug: k, label: k, count: statusCounts[k] ?? 0 })),
    ]
  }, [statusCounts, meta?.total, t])

  const statItems = useMemo(() => {
    if (!stats) return []
    return [
      { id: "count", label: t("stat_count"), value: stats.order_count ?? 0 },
      { id: "revenue", label: t("stat_revenue"), value: (stats.revenue ?? 0).toLocaleString() },
      { id: "pending", label: t("stat_pending"), value: stats.pending ?? 0 },
      { id: "processing", label: t("stat_processing"), value: stats.processing ?? 0 },
      { id: "aov", label: t("stat_aov"), value: (stats.aov ?? 0).toLocaleString() },
    ]
  }, [stats, t])

  const filterActiveCount = [dateFrom, dateTo, paymentTender, salesChannel].filter(Boolean).length

  const bulk = useMutation({
    mutationFn: () =>
      api("/api/v1/orders/bulk", {
        method: "POST",
        json: { ids: selected, action: "change_status", status: bulkStatus },
      }),
    onSuccess: async () => {
      setSelected([])
      await queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const bulkTrash = useMutation({
    mutationFn: () =>
      api("/api/v1/orders/bulk", {
        method: "POST",
        json: { ids: selected, action: "trash" },
      }),
    onSuccess: async () => {
      setSelected([])
      await queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  function toggleAll(checked: boolean) {
    setSelected(checked ? orders.map((o) => o.id) : [])
  }

  function toggleOne(id: number, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  function applyFilters() {
    setPage(1)
    void queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
  }

  return (
    <PageShell
      title={mineMode ? t("my_orders_title") : t("title")}
      description={route.fullPath}
      actions={
        <>
          <Button variant="outline" asChild>
            <Link href="/admin/pos">
              <Store className="size-4" />
              {t("pos")}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/orders/new">
              <Plus className="size-4" />
              {t("new_order")}
            </Link>
          </Button>
        </>
      }
    >
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <ListStatsStrip items={statItems} />

      <OrderStatusTabs
        counts={statusTabs}
        active={status || "all"}
        onChange={(slug) => {
          setStatus(slug)
          setPage(1)
        }}
      />

      <div className="relative">
        <Search className="text-muted-foreground absolute start-2 top-2.5 size-4" />
        <Input
          className="ps-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          placeholder={t("search_ph")}
        />
      </div>

      <ListFiltersCollapsible label={t("search")} activeCount={filterActiveCount}>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          <div>
            <Label>{t("date_from")}</Label>
            <Input className="mt-1" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label>{t("date_to")}</Label>
            <Input className="mt-1" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <Label>{t("payment_tender")}</Label>
            <select className={`${selectClass} mt-1`} value={paymentTender} onChange={(e) => setPaymentTender(e.target.value)}>
              <option value="">{t("all")}</option>
              {PAYMENT_TENDERS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("sales_channel")}</Label>
            <select className={`${selectClass} mt-1`} value={salesChannel} onChange={(e) => setSalesChannel(e.target.value)}>
              <option value="">{t("all")}</option>
              {SALES_CHANNELS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button variant="secondary" onClick={applyFilters}>
              {t("apply_filters")}
            </Button>
          </div>
        </div>
      </ListFiltersCollapsible>

      {selected.length > 0 ? (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-6">
            <p className="text-sm">{t("selected_count", { count: selected.length })}</p>
            <div>
              <Label>{t("bulk_status")}</Label>
              <select className={`${selectClass} mt-1 min-w-[160px]`} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
                {Object.keys(statusCounts).length
                  ? Object.keys(statusCounts).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))
                  : ORDER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
              </select>
            </div>
            <Button disabled={bulk.isPending} onClick={() => bulk.mutate()}>
              {t("bulk_apply")}
            </Button>
            <Button variant="destructive" disabled={bulkTrash.isPending} onClick={() => bulkTrash.mutate()}>
              Trash
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="rounded-lg border border-border bg-card/40">
        <div className="border-b px-4 py-3 text-sm font-medium">{t("list_heading")}</div>
        <div className="p-2 sm:p-4">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : orders.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="p-2">
                      <Checkbox
                        checked={selected.length > 0 && selected.length === orders.length}
                        onCheckedChange={(v) => toggleAll(v === true)}
                      />
                    </th>
                    <th className="p-2 font-medium">{t("col_number")}</th>
                    <th className="p-2 font-medium">{t("col_status")}</th>
                    <th className="p-2 font-medium">{t("col_total")}</th>
                    <th className="p-2 font-medium">{t("col_customer")}</th>
                    <th className="p-2 font-medium">{t("col_date")}</th>
                    <th className="p-2 font-medium">{t("col_tender")}</th>
                    <th className="p-2 font-medium">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="p-2">
                        <Checkbox
                          checked={selected.includes(o.id)}
                          onCheckedChange={(v) => toggleOne(o.id, v === true)}
                        />
                      </td>
                      <td className="p-2 font-medium">
                        <Link className="underline-offset-2 hover:underline" href={`/admin/orders/${o.id}`}>
                          {o.number || `#${o.id}`}
                        </Link>
                        {o.is_pos ? (
                          <Badge className="ms-2" variant="secondary">
                            POS
                          </Badge>
                        ) : null}
                      </td>
                      <td className="p-2">
                        <Badge variant="outline">{o.status}</Badge>
                      </td>
                      <td className="p-2">{o.total_minor?.toLocaleString()}</td>
                      <td className="p-2 text-muted-foreground">
                        {o.customer_name || o.user?.name || o.customer_phone || "—"}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {o.created_at ? new Date(o.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="p-2">{o.payment_tender || "—"}</td>
                      <td className="p-2">
                        <Button size="icon" variant="outline" asChild title={t("edit")}>
                          <Link href={`/admin/orders/${o.id}/edit`}>
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {meta && meta.last_page > 1 ? (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm">
                {t("page_of", { page: meta.current_page, pages: meta.last_page, total: meta.total })}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronRight className="size-4 rtl:rotate-180" />
                  {t("prev")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= meta.last_page}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("next")}
                  <ChevronLeft className="size-4 rtl:rotate-180" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </PageShell>
  )
}
