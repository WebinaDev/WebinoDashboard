"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { unwrapApiResponse } from "@webina/ui"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  Plus,
  Search,
  Store,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useMemo, useState, type ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { ListFiltersCollapsible } from "@/components/ListFiltersCollapsible"
import { MobileListCard, MobileListField } from "@/components/MobileListCard"
import { PostsPagination } from "@/components/PostsPagination"
import { QueryErrorState } from "@/components/QueryErrorState"
import { ScrollTable } from "@/components/ScrollTable"
import { TableListSkeleton } from "@/components/TableListSkeleton"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { PrintPendingLabelsButton } from "@/components/orders/OrderPrintActions"
import { OrderStatusTabs } from "@/components/orders/OrderStatusTabs"
import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { ApiError, api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { toAsciiDigits } from "@/lib/digits"
import { statusBadgeVariant, useEnumLabel } from "@/lib/enum-labels"
import { formatDisplayDateTime } from "@/lib/format-date"
import { isMarketplaceChannel, marketplaceLabel } from "@/lib/marketplace"
import { cn } from "@/lib/utils"
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
  province?: string | null
  shipping_destination?: string | null
  shipping_title?: string | null
  map_url?: string | null
  gateway_title?: string | null
  utm?: string | null
  marketplace?: string | null
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

type FilterOptions = {
  statuses?: string[]
  payment_tenders?: string[]
  sales_channels?: string[]
  shipping_methods?: string[]
  provinces?: { code: string; name: string }[]
  customer_roles?: string[]
  email_types?: string[]
  utm_sources?: string[]
}

type SortCol = "id" | "number" | "status" | "total_minor" | "created_at"

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

const EMAIL_TYPE_KEYS: Record<string, string> = {
  status: "email_type_status",
  invoice: "email_type_invoice",
  shipping: "email_type_shipping",
  reminder: "email_type_reminder",
}

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

function SortableTh({
  label,
  col,
  sort,
  dir,
  onSort,
}: {
  label: ReactNode
  col: SortCol
  sort: SortCol
  dir: "asc" | "desc"
  onSort: (col: SortCol) => void
}) {
  const active = sort === col
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown
  return (
    <th className="p-2 text-start font-medium">
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(col)}>
        {label}
        <Icon className={cn("size-3.5", active ? "text-foreground" : "text-muted-foreground")} />
      </button>
    </th>
  )
}

export default function OrdersPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("orders_admin")
  const locale = useLocale()
  const tUi = useTranslations("ui")
  const enumLabel = useEnumLabel()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()

  const mineMode = route.path === "pos/my-orders" || searchParams.get("mine") === "1"

  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [status, setStatus] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [paymentTender, setPaymentTender] = useState("")
  const [salesChannel, setSalesChannel] = useState("")
  const [province, setProvince] = useState("")
  const [shippingMethod, setShippingMethod] = useState("")
  const [utm, setUtm] = useState("")
  const [userId, setUserId] = useState("")
  const [customerRole, setCustomerRole] = useState("")
  const [minTotal, setMinTotal] = useState("")
  const [maxTotal, setMaxTotal] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [sort, setSort] = useState<SortCol>("id")
  const [dir, setDir] = useState<"asc" | "desc">("desc")
  const [trashOpen, setTrashOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [bulkStatus, setBulkStatus] = useState("processing")
  const [bulkEmailType, setBulkEmailType] = useState("status")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(handle)
  }, [search])

  const { data: filterOptsRaw } = useQuery({
    queryKey: ["orders-filter-options"],
    queryFn: () => api<FilterOptions>("/api/v1/orders/filter-options"),
  })
  const filterOpts = filterOptsRaw ?? {}

  const queryKey = [
    "admin-orders",
    mineMode,
    debouncedSearch,
    status,
    dateFrom,
    dateTo,
    paymentTender,
    salesChannel,
    province,
    shippingMethod,
    utm,
    userId,
    customerRole,
    minTotal,
    maxTotal,
    page,
    perPage,
    sort,
    dir,
  ] as const

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("per_page", String(perPage))
      params.set("sort", sort)
      params.set("dir", dir)
      if (mineMode) {
        params.set("mine", "1")
        if (route.path === "pos/my-orders") params.set("is_pos", "1")
      }
      if (debouncedSearch) params.set("search", debouncedSearch)
      if (status) params.set("status", status)
      if (dateFrom) params.set("date_from", dateFrom)
      if (dateTo) params.set("date_to", dateTo)
      if (paymentTender) params.set("payment_tender", paymentTender)
      if (salesChannel) params.set("sales_channel", salesChannel)
      if (province) params.set("province", province)
      if (shippingMethod) params.set("shipping_method", shippingMethod)
      if (utm.trim()) params.set("utm", utm.trim())
      if (userId.trim()) params.set("user_id", userId.trim())
      if (customerRole) params.set("customer_role", customerRole)
      if (minTotal.trim()) params.set("min_total", toAsciiDigits(minTotal.trim()))
      if (maxTotal.trim()) params.set("max_total", toAsciiDigits(maxTotal.trim()))
      return apiListWithMeta<OrderRow>(`/api/v1/orders?${params}`)
    },
  })

  const orders = data?.items ?? []
  const meta = data?.meta
  const statusCounts = meta?.status_counts ?? {}
  const stats = meta?.stats

  const statusList = filterOpts.statuses?.length ? filterOpts.statuses : [...ORDER_STATUSES]

  const allTabCount = useMemo(
    () => Object.values(statusCounts).reduce((sum, n) => sum + (Number(n) || 0), 0),
    [statusCounts],
  )

  const statusTabs = useMemo(() => {
    const withCounts = statusList
      .map((k) => ({ slug: k, label: enumLabel("order_status", k), count: statusCounts[k] ?? 0 }))
      .filter((x) => x.count > 0 || x.slug === status)
    return [{ slug: "all", label: t("all"), count: allTabCount }, ...withCounts]
  }, [statusList, statusCounts, status, allTabCount, t, enumLabel])

  const statItems = useMemo(() => {
    if (!stats) return []
    return [
      { id: "count", label: t("stat_count"), value: stats.order_count ?? 0 },
      { id: "revenue", label: t("stat_revenue"), value: stats.revenue ?? 0, money: true },
      { id: "pending", label: t("stat_pending"), value: stats.pending ?? 0 },
      { id: "processing", label: t("stat_processing"), value: stats.processing ?? 0 },
      { id: "completed", label: t("stat_completed"), value: stats.completed ?? 0 },
      { id: "aov", label: t("stat_aov"), value: stats.aov ?? 0, money: true },
    ]
  }, [stats, t])

  const filterActiveCount = [
    dateFrom,
    dateTo,
    paymentTender,
    salesChannel,
    province,
    shippingMethod,
    utm,
    userId,
    customerRole,
    minTotal,
    maxTotal,
  ].filter(Boolean).length

  const paymentTenders = filterOpts.payment_tenders ?? []
  const salesChannels = filterOpts.sales_channels ?? []

  function invalidateOrders() {
    return queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
  }

  const bulk = useMutation({
    mutationFn: () =>
      api("/api/v1/orders/bulk", {
        method: "POST",
        json: { ids: selected, action: "change_status", status: bulkStatus },
      }),
    onSuccess: async () => {
      setSelected([])
      await invalidateOrders()
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const bulkEmail = useMutation({
    mutationFn: () =>
      api("/api/v1/orders/bulk", {
        method: "POST",
        json: { ids: selected, action: "send_email", email_type: bulkEmailType },
      }),
    onSuccess: async () => {
      setSelected([])
      await invalidateOrders()
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
      await invalidateOrders()
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const bulkDelete = useMutation({
    mutationFn: () =>
      api("/api/v1/orders/bulk", {
        method: "POST",
        json: { ids: selected, action: "delete" },
      }),
    onSuccess: async () => {
      setSelected([])
      await invalidateOrders()
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  function toggleAll(checked: boolean) {
    setSelected(checked ? orders.map((o) => o.id) : [])
  }

  function toggleOne(id: number, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  function toggleSort(col: SortCol) {
    if (sort === col) {
      setDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSort(col)
      setDir("desc")
    }
    setPage(1)
  }

  function channelLabel(slug: string) {
    return isMarketplaceChannel(slug) ? marketplaceLabel(slug, locale) : enumLabel("sales_channel", slug)
  }

  function renderSource(o: OrderRow) {
    if (o.marketplace) return channelLabel(o.marketplace)
    if (o.sales_channel) return channelLabel(o.sales_channel)
    if (o.is_pos) return enumLabel("sales_channel", "in_store")
    return "—"
  }

  return (
    <PageShell
      title={mineMode ? t("my_orders_title") : t("title")}
      actions={
        <>
          {mineMode ? null : <PrintPendingLabelsButton />}
          <Button variant="outline" asChild>
            <Link href="/dashboard/pos">
              <Store className="size-4" />
              {t("pos")}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/orders/new">
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
          placeholder={t("search_ph")}
        />
      </div>

      <ListFiltersCollapsible activeCount={filterActiveCount}>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <div>
            <Label>{t("date_from")}</Label>
            <div className="mt-1">
              <LocaleDatePicker locale={locale} value={dateFrom} onChange={(value) => { setDateFrom(value ?? ""); setPage(1) }} aria-label={t("date_from")} />
            </div>
          </div>
          <div>
            <Label>{t("date_to")}</Label>
            <div className="mt-1">
              <LocaleDatePicker locale={locale} value={dateTo} onChange={(value) => { setDateTo(value ?? ""); setPage(1) }} aria-label={t("date_to")} />
            </div>
          </div>
          <div>
            <Label>{t("payment_tender")}</Label>
            <select className={`${selectClass} mt-1`} value={paymentTender} onChange={(e) => { setPaymentTender(e.target.value); setPage(1) }}>
              <option value="">{t("all")}</option>
              {paymentTenders.map((x) => (
                <option key={x} value={x}>
                  {enumLabel("payment_tender", x)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("sales_channel")}</Label>
            <select className={`${selectClass} mt-1`} value={salesChannel} onChange={(e) => { setSalesChannel(e.target.value); setPage(1) }}>
              <option value="">{t("all")}</option>
              {salesChannels.map((x) => (
                <option key={x} value={x}>
                  {channelLabel(x)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("province")}</Label>
            <select className={`${selectClass} mt-1`} value={province} onChange={(e) => { setProvince(e.target.value); setPage(1) }}>
              <option value="">{t("all")}</option>
              {(filterOpts.provinces ?? []).map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("shipping_method")}</Label>
            <select className={`${selectClass} mt-1`} value={shippingMethod} onChange={(e) => { setShippingMethod(e.target.value); setPage(1) }}>
              <option value="">{t("all")}</option>
              {(filterOpts.shipping_methods ?? []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("utm")}</Label>
            <Input className="mt-1" value={utm} onChange={(e) => { setUtm(e.target.value); setPage(1) }} list="orders-utm-suggestions" placeholder={t("utm")} />
            <datalist id="orders-utm-suggestions">
              {(filterOpts.utm_sources ?? []).map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
          <div>
            <Label>{t("user_id")}</Label>
            <Input className="mt-1" inputMode="numeric" value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1) }} />
          </div>
          <div>
            <Label>{t("customer_role")}</Label>
            <select className={`${selectClass} mt-1`} value={customerRole} onChange={(e) => { setCustomerRole(e.target.value); setPage(1) }}>
              <option value="">{t("all")}</option>
              {(filterOpts.customer_roles ?? []).map((r) => (
                <option key={r} value={r}>
                  {enumLabel("role", r)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("min_total")}</Label>
            <Input className="mt-1" inputMode="numeric" value={minTotal} onChange={(e) => { setMinTotal(e.target.value); setPage(1) }} />
          </div>
          <div>
            <Label>{t("max_total")}</Label>
            <Input className="mt-1" inputMode="numeric" value={maxTotal} onChange={(e) => { setMaxTotal(e.target.value); setPage(1) }} />
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
                {statusList.map((s) => (
                  <option key={s} value={s}>
                    {enumLabel("order_status", s)}
                  </option>
                ))}
              </select>
            </div>
            <Button disabled={bulk.isPending} onClick={() => bulk.mutate()}>
              {t("bulk_apply")}
            </Button>
            <div>
              <Label>{t("bulk_email_type")}</Label>
              <select className={`${selectClass} mt-1 min-w-[160px]`} value={bulkEmailType} onChange={(e) => setBulkEmailType(e.target.value)}>
                {(filterOpts.email_types ?? ["status", "invoice", "shipping", "reminder"]).map((et) => (
                  <option key={et} value={et}>
                    {t(EMAIL_TYPE_KEYS[et] ?? "bulk_email")}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="secondary" disabled={bulkEmail.isPending} onClick={() => bulkEmail.mutate()}>
              {t("bulk_email")}
            </Button>
            <Button variant="destructive" disabled={bulkTrash.isPending} onClick={() => setTrashOpen(true)}>
              {t("trash")}
            </Button>
            <Button variant="destructive" disabled={bulkDelete.isPending} onClick={() => setDeleteOpen(true)}>
              {t("delete")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="rounded-lg border border-border bg-card/40">
        <div className="border-b px-4 py-3 text-sm font-medium">{t("list_heading")}</div>
        <div className="p-2 sm:p-4">
          {isError ? (
            <QueryErrorState onRetry={() => refetch()} />
          ) : isLoading ? (
            <TableListSkeleton rows={8} columns={10} />
          ) : orders.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty")}</p>
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {orders.map((o) => (
                  <MobileListCard
                    key={o.id}
                    leading={
                      <Checkbox
                        checked={selected.includes(o.id)}
                        onCheckedChange={(v) => toggleOne(o.id, v === true)}
                      />
                    }
                    media={
                      <div className="flex items-center justify-between gap-2">
                        <Link className="font-medium underline-offset-2 hover:underline" href={`/dashboard/orders/${o.id}`}>
                          {o.number || `#${o.id}`}
                        </Link>
                        <Badge variant={statusBadgeVariant(o.status)}>{enumLabel("order_status", o.status)}</Badge>
                      </div>
                    }
                    actions={
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/dashboard/orders/${o.id}`}>
                          <Eye className="size-4" />
                          {t("view")}
                        </Link>
                      </Button>
                    }
                  >
                    <MobileListField label={t("col_total")}>
                      <MoneyDisplay amount={o.total_minor} />
                    </MobileListField>
                    <MobileListField label={t("col_customer")}>
                      {o.customer_name || o.user?.name || o.customer_phone || "—"}
                    </MobileListField>
                    <MobileListField label={t("col_date")}>{formatDisplayDateTime(o.created_at, locale)}</MobileListField>
                    <MobileListField label={t("col_province")}>{o.province || "—"}</MobileListField>
                    <MobileListField label={t("col_shipping")}>{o.shipping_destination || "—"}</MobileListField>
                    <MobileListField label={t("col_tender")}>{enumLabel("payment_tender", o.payment_tender)}</MobileListField>
                    <MobileListField label={t("col_source")}>{renderSource(o)}</MobileListField>
                  </MobileListCard>
                ))}
              </div>
              <ScrollTable className="hidden md:block">
                <table className="w-full min-w-[1200px] text-sm">
                  <thead>
                    <tr className="border-b text-start text-muted-foreground">
                      <th className="p-2">
                        <Checkbox
                          checked={selected.length > 0 && selected.length === orders.length}
                          onCheckedChange={(v) => toggleAll(v === true)}
                        />
                      </th>
                      <SortableTh label={t("col_number")} col="number" sort={sort} dir={dir} onSort={toggleSort} />
                      <SortableTh label={t("col_status")} col="status" sort={sort} dir={dir} onSort={toggleSort} />
                      <SortableTh label={t("col_total")} col="total_minor" sort={sort} dir={dir} onSort={toggleSort} />
                      <th className="p-2 text-start font-medium">{t("col_customer")}</th>
                      <SortableTh label={t("col_date")} col="created_at" sort={sort} dir={dir} onSort={toggleSort} />
                      <th className="p-2 text-start font-medium">{t("col_province")}</th>
                      <th className="p-2 text-start font-medium">{t("col_shipping")}</th>
                      <th className="p-2 text-start font-medium">{t("col_shipping_method")}</th>
                      <th className="p-2 text-start font-medium">{t("col_map")}</th>
                      <th className="p-2 text-start font-medium">{t("col_tender")}</th>
                      <th className="p-2 text-start font-medium">{t("col_gateway")}</th>
                      <th className="p-2 text-start font-medium">{t("col_utm")}</th>
                      <th className="p-2 text-start font-medium">{t("col_marketplace")}</th>
                      <th className="p-2 text-start font-medium">{t("actions")}</th>
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
                          <Link className="underline-offset-2 hover:underline" href={`/dashboard/orders/${o.id}`}>
                            {o.number || `#${o.id}`}
                          </Link>
                          {o.is_pos ? (
                            <Badge className="ms-2" variant="secondary">
                              {t("pos")}
                            </Badge>
                          ) : null}
                        </td>
                        <td className="p-2">
                          <Badge variant={statusBadgeVariant(o.status)}>{enumLabel("order_status", o.status)}</Badge>
                        </td>
                        <td className="p-2">
                          <MoneyDisplay amount={o.total_minor} />
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {o.customer_name || o.user?.name || o.customer_phone || "—"}
                        </td>
                        <td className="p-2 text-muted-foreground">{formatDisplayDateTime(o.created_at, locale)}</td>
                        <td className="p-2">{o.province || "—"}</td>
                        <td className="p-2 max-w-[160px] truncate" title={o.shipping_destination ?? undefined}>
                          {o.shipping_destination || "—"}
                        </td>
                        <td className="p-2">{o.shipping_title || "—"}</td>
                        <td className="p-2">
                          {o.map_url ? (
                            <a className="text-primary underline-offset-2 hover:underline" href={o.map_url} target="_blank" rel="noreferrer">
                              {t("map_link")}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-2">{enumLabel("payment_tender", o.payment_tender)}</td>
                        <td className="p-2">{o.gateway_title || "—"}</td>
                        <td className="p-2 max-w-[120px] truncate" title={o.utm ?? undefined}>
                          {o.utm || "—"}
                        </td>
                        <td className="p-2">{renderSource(o)}</td>
                        <td className="p-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/dashboard/orders/${o.id}`}>
                              <Eye className="size-4" />
                              {t("view")}
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
            </>
          )}

          {meta ? (
            <PostsPagination
              className="mt-4"
              page={meta.current_page}
              perPage={meta.per_page || perPage}
              found={meta.total}
              onPageChange={setPage}
              onPerPageChange={(n) => {
                setPerPage(n)
                setPage(1)
              }}
            />
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={trashOpen}
        onOpenChange={setTrashOpen}
        title={tUi("confirm_title")}
        description={tUi("confirm_trash_body")}
        confirmLabel={t("trash")}
        pending={bulkTrash.isPending}
        onConfirm={() => bulkTrash.mutateAsync()}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={tUi("confirm_delete_title")}
        description={t("confirm_delete_orders")}
        confirmLabel={t("delete")}
        pending={bulkDelete.isPending}
        onConfirm={() => bulkDelete.mutateAsync()}
      />
    </PageShell>
  )
}
