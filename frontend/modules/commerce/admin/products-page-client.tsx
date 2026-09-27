"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { unwrapApiResponse } from "@webina/ui"
import { Copy, Pencil, Plus, Search, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Fragment, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useConfirm } from "@/components/ConfirmDialog"
import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { ListFiltersCollapsible } from "@/components/ListFiltersCollapsible"
import { MobileListCard, MobileListField } from "@/components/MobileListCard"
import { PostsPagination } from "@/components/PostsPagination"
import { QueryErrorState } from "@/components/QueryErrorState"
import { ScrollTable } from "@/components/ScrollTable"
import { TableListSkeleton } from "@/components/TableListSkeleton"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { OrderStatusTabs } from "@/components/orders/OrderStatusTabs"
import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { ApiError, api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { statusBadgeVariant, useEnumLabel } from "@/lib/enum-labels"

type NamedRef = { id: number; name: string }

type ProductRow = {
  id: number
  name: string
  sku?: string | null
  price_minor: number
  stock_status?: string | null
  status?: string | null
  brands?: NamedRef[]
  categories?: NamedRef[]
  category?: NamedRef | null
}

type PageMeta = {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

async function apiListWithMeta<T>(path: string): Promise<{ items: T[]; meta?: PageMeta }> {
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
  return { items: Array.isArray(data) ? data : [], meta: meta as PageMeta | undefined }
}

function joinNames(items?: NamedRef[] | null, fallback?: NamedRef | null) {
  if (items?.length) return items.map((x) => x.name).join("، ")
  return fallback?.name ?? "—"
}

export default function ProductsPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const enumLabel = useEnumLabel()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [type, setType] = useState("")
  const [stockStatus, setStockStatus] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [brandId, setBrandId] = useState("")
  const [visibility, setVisibility] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [error, setError] = useState<string | null>(null)
  const [quickId, setQuickId] = useState<number | null>(null)
  const [quickName, setQuickName] = useState("")
  const [quickStatus, setQuickStatus] = useState("draft")
  const [quickPrice, setQuickPrice] = useState("")

  const queryKey = ["admin-products", search, status, type, stockStatus, categoryId, brandId, visibility, page, perPage] as const

  const lookupQ = useQuery({
    queryKey: ["products-lookup"],
    queryFn: () =>
      api<{ categories: NamedRef[]; brands: NamedRef[] }>("/api/v1/products/lookup"),
  })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("per_page", String(perPage))
      if (search.trim()) params.set("search", search.trim())
      if (status && status !== "all") params.set("status", status)
      if (type) params.set("type", type)
      if (stockStatus) params.set("stock_status", stockStatus)
      if (categoryId) params.set("category_id", categoryId)
      if (brandId) params.set("brand_id", brandId)
      if (visibility) params.set("catalog_visibility", visibility)
      return apiListWithMeta<ProductRow>(`/api/v1/products?${params}`)
    },
  })

  const products = data?.items ?? []
  const meta = data?.meta
  const serverStats = (meta as PageMeta & { stats?: Record<string, number> })?.stats

  const stats = useMemo(() => {
    if (serverStats) {
      return {
        publish: serverStats.publish ?? 0,
        draft: serverStats.draft ?? 0,
        outofstock: serverStats.outofstock ?? 0,
        pending: serverStats.pending ?? 0,
        trash: serverStats.trash ?? 0,
        total: serverStats.total ?? meta?.total ?? 0,
      }
    }
    let publish = 0
    let draft = 0
    let outofstock = 0
    for (const p of products) {
      if (p.status === "publish") publish += 1
      if (p.status === "draft") draft += 1
      if (p.stock_status === "outofstock") outofstock += 1
    }
    return { publish, draft, outofstock, pending: 0, trash: 0, total: meta?.total ?? products.length }
  }, [products, serverStats, meta?.total])

  const duplicate = useMutation({
    mutationFn: (id: number) => api(`/api/v1/products/${id}/duplicate`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-products"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/v1/products/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-products"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const quickSave = useMutation({
    mutationFn: () =>
      api(`/api/v1/products/${quickId}`, {
        method: "PATCH",
        json: {
          name: quickName,
          status: quickStatus,
          price_minor: quickPrice === "" ? undefined : Number(quickPrice),
        },
      }),
    onSuccess: async () => {
      setQuickId(null)
      await queryClient.invalidateQueries({ queryKey: ["admin-products"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  function applyFilters() {
    setPage(1)
    void queryClient.invalidateQueries({ queryKey: ["admin-products"] })
  }

  const statusTabs = useMemo(
    () => [
      { slug: "all", label: t("all"), count: stats.total },
      { slug: "publish", label: t("status_publish"), count: stats.publish },
      { slug: "draft", label: t("status_draft"), count: stats.draft },
      { slug: "pending", label: t("status_pending"), count: stats.pending },
      { slug: "trash", label: t("status_trash"), count: stats.trash },
    ],
    [stats, t],
  )

  const statItems = useMemo(
    () => [
      { id: "publish", label: t("stat_publish"), value: stats.publish },
      { id: "draft", label: t("stat_draft"), value: stats.draft },
      { id: "outofstock", label: t("stat_outofstock"), value: stats.outofstock },
    ],
    [stats, t],
  )

  function rowActions(p: ProductRow) {
    return (
      <div className="flex flex-wrap gap-1">
        <Button size="icon" variant="outline" asChild title={t("edit")}>
          <Link href={`/dashboard/products/${p.id}`}>
            <Pencil className="size-4" />
          </Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setQuickId(p.id)
            setQuickName(p.name)
            setQuickStatus(p.status || "draft")
            setQuickPrice(String(p.price_minor ?? ""))
          }}
        >
          {t("quick_edit")}
        </Button>
        <Button
          size="icon"
          variant="outline"
          title={t("duplicate")}
          disabled={duplicate.isPending}
          onClick={() => duplicate.mutate(p.id)}
        >
          <Copy className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title={t("delete")}
          disabled={remove.isPending}
          onClick={() => confirm({ description: p.name, onConfirm: () => remove.mutateAsync(p.id) })}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    )
  }

  const quickEditForm = (
    <div className="flex flex-wrap gap-2">
      <Input className="max-w-xs" value={quickName} onChange={(e) => setQuickName(e.target.value)} />
      <select className={selectClass} value={quickStatus} onChange={(e) => setQuickStatus(e.target.value)}>
        {(["publish", "draft", "pending", "private"] as const).map((v) => (
          <option key={v} value={v}>
            {enumLabel("product_status", v)}
          </option>
        ))}
      </select>
      <Input
        className="max-w-[140px]"
        type="number"
        value={quickPrice}
        onChange={(e) => setQuickPrice(e.target.value)}
        placeholder={t("price")}
      />
      <Button size="sm" onClick={() => void quickSave.mutateAsync()}>
        {tCommon("save")}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setQuickId(null)}>
        {tCommon("cancel")}
      </Button>
    </div>
  )

  const filterActiveCount = [type, stockStatus, categoryId, brandId, visibility].filter(Boolean).length

  return (
    <PageShell
      title={t("products_title")}
      description={route.fullPath}
      actions={
        <Button asChild>
          <Link href="/dashboard/products/new">
            <Plus className="size-4" />
            {t("add_product")}
          </Link>
        </Button>
      }
    >
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <ListStatsStrip items={statItems} />

      <OrderStatusTabs
        counts={statusTabs}
        active={status || "all"}
        onChange={(slug) => {
          setStatus(slug === "all" ? "" : slug)
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
          placeholder={t("search_products_ph")}
        />
      </div>

      <ListFiltersCollapsible activeCount={filterActiveCount}>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>{t("type")}</Label>
            <select className={`${selectClass} mt-1`} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">{t("all")}</option>
              <option value="simple">{t("type_simple")}</option>
              <option value="variable">{t("type_variable")}</option>
              <option value="downloadable">{t("type_downloadable")}</option>
            </select>
          </div>
          <div>
            <Label>{t("stock_status")}</Label>
            <select
              className={`${selectClass} mt-1`}
              value={stockStatus}
              onChange={(e) => setStockStatus(e.target.value)}
            >
              <option value="">{t("all")}</option>
              <option value="instock">{t("stock_instock")}</option>
              <option value="outofstock">{t("stock_outofstock")}</option>
              <option value="onbackorder">{t("stock_onbackorder")}</option>
            </select>
          </div>
          <div>
            <Label>{t("categories")}</Label>
            <select className={`${selectClass} mt-1`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t("all")}</option>
              {(lookupQ.data?.categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("brands")}</Label>
            <select className={`${selectClass} mt-1`} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">{t("all")}</option>
              {(lookupQ.data?.brands ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("catalog_visibility")}</Label>
            <select className={`${selectClass} mt-1`} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="">{t("all")}</option>
              {(["visible", "catalog", "search", "hidden"] as const).map((v) => (
                <option key={v} value={v}>
                  {enumLabel("catalog_visibility", v)}
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

      <div className="rounded-lg border border-border bg-card/40">
        <div className="border-b px-4 py-3 text-sm font-medium">{t("products_heading")}</div>
        <div className="p-2 sm:p-4">
          {isError ? (
            <QueryErrorState onRetry={() => refetch()} />
          ) : isLoading ? (
            <TableListSkeleton rows={8} columns={6} />
          ) : products.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty_products")}</p>
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {products.map((p) => (
                  <MobileListCard
                    key={p.id}
                    media={
                      <div className="flex items-start justify-between gap-2">
                        <Link className="font-medium underline-offset-2 hover:underline" href={`/dashboard/products/${p.id}`}>
                          {p.name}
                        </Link>
                        <Badge variant={statusBadgeVariant(p.status)}>{enumLabel("product_status", p.status)}</Badge>
                      </div>
                    }
                    actions={rowActions(p)}
                  >
                    <MobileListField label={t("price")}>
                      <MoneyDisplay amount={p.price_minor} />
                    </MobileListField>
                    <MobileListField label={t("stock_status")}>{enumLabel("stock_status", p.stock_status)}</MobileListField>
                    <MobileListField label={t("sku")}>{p.sku || "—"}</MobileListField>
                    <MobileListField label={t("categories")}>{joinNames(p.categories, p.category)}</MobileListField>
                    {quickId === p.id ? quickEditForm : null}
                  </MobileListCard>
                ))}
              </div>
              <ScrollTable className="hidden md:block">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b text-start text-muted-foreground">
                      <th className="p-2 text-start font-medium">{t("name")}</th>
                      <th className="p-2 text-start font-medium">{t("sku")}</th>
                      <th className="p-2 text-start font-medium">{t("price")}</th>
                      <th className="p-2 text-start font-medium">{t("stock_status")}</th>
                      <th className="p-2 text-start font-medium">{t("status")}</th>
                      <th className="p-2 text-start font-medium">{t("brands")}</th>
                      <th className="p-2 text-start font-medium">{t("categories")}</th>
                      <th className="p-2 text-start font-medium">{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <Fragment key={p.id}>
                        <tr className="border-b last:border-0">
                          <td className="p-2 font-medium">
                            <Link className="underline-offset-2 hover:underline" href={`/dashboard/products/${p.id}`}>
                              {p.name}
                            </Link>
                          </td>
                          <td className="p-2 text-muted-foreground">{p.sku || "—"}</td>
                          <td className="p-2">
                            <MoneyDisplay amount={p.price_minor} />
                          </td>
                          <td className="p-2">
                            <Badge variant={statusBadgeVariant(p.stock_status)}>{enumLabel("stock_status", p.stock_status)}</Badge>
                          </td>
                          <td className="p-2">
                            <Badge variant={statusBadgeVariant(p.status)}>{enumLabel("product_status", p.status)}</Badge>
                          </td>
                          <td className="p-2 text-muted-foreground">{joinNames(p.brands)}</td>
                          <td className="p-2 text-muted-foreground">{joinNames(p.categories, p.category)}</td>
                          <td className="p-2">{rowActions(p)}</td>
                        </tr>
                        {quickId === p.id ? (
                          <tr className="bg-muted/20 border-b">
                            <td colSpan={8} className="p-3">
                              {quickEditForm}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
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
      {confirmDialog}
    </PageShell>
  )
}
