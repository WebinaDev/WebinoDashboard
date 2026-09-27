"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { unwrapApiResponse } from "@webina/ui"
import {
  Columns3,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { printProductLabels } from "@/lib/order-print"

type NamedRef = { id: number; name: string }

type CalculatedPrices = {
  retail?: number
  credit?: number
  wholesale?: number
  installment?: number
}

type MarketplacePlatform = {
  platform: string
  count: number
  connected: boolean
}

type ProductRow = {
  id: number
  name: string
  sku?: string | null
  slug?: string | null
  price_minor: number
  price_min?: number
  price_max?: number
  purchase_price_minor?: number | null
  sale_price_minor?: number | null
  discount_percent?: number | null
  is_on_sale?: boolean
  stock?: number | null
  stock_status?: string | null
  status?: string | null
  type?: string | null
  catalog_visibility?: string | null
  views_count?: number | null
  created_at?: string | null
  image_url?: string | null
  permalink?: string | null
  tag_names?: string[]
  calculated?: CalculatedPrices | null
  marketplace_platforms?: MarketplacePlatform[]
  brands?: NamedRef[]
  categories?: NamedRef[]
  category?: NamedRef | null
  tags?: NamedRef[]
}

type PageMeta = {
  current_page: number
  last_page: number
  per_page: number
  total: number
  stats?: Record<string, number>
}

const COLUMN_KEYS = [
  "image",
  "name",
  "sku",
  "purchase",
  "retail",
  "installment",
  "credit",
  "wholesale",
  "discount",
  "sale",
  "stock",
  "brand",
  "categories",
  "tags",
  "date",
  "views",
  "status",
  "visibility",
  "type",
  "marketplaces",
] as const

type ColumnKey = (typeof COLUMN_KEYS)[number]

const LS_COLUMNS = "webino-products-list-columns"

const DEFAULT_COLUMNS: ColumnKey[] = ["image", "name", "sku", "retail", "stock", "status", "categories"]

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

function loadVisibleColumns(): ColumnKey[] {
  if (typeof window === "undefined") return DEFAULT_COLUMNS
  try {
    const raw = localStorage.getItem(LS_COLUMNS)
    if (!raw) return DEFAULT_COLUMNS
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return DEFAULT_COLUMNS
    const valid = parsed.filter((k): k is ColumnKey => COLUMN_KEYS.includes(k as ColumnKey))
    return valid.length ? valid : DEFAULT_COLUMNS
  } catch {
    return DEFAULT_COLUMNS
  }
}

function formatListDate(iso?: string | null, locale?: string) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString(locale === "fa" ? "fa-IR" : "en-US")
  } catch {
    return iso.slice(0, 10)
  }
}

function PriceRange({ row }: { row: ProductRow }) {
  const min = row.price_min ?? row.price_minor
  const max = row.price_max ?? row.price_minor
  if (min !== max) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <MoneyDisplay amount={min} />
        <span className="text-muted-foreground">–</span>
        <MoneyDisplay amount={max} />
      </span>
    )
  }
  return <MoneyDisplay amount={min} />
}

export default function ProductsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const enumLabel = useEnumLabel()
  const locale = useLocale()
  const router = useRouter()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [status, setStatus] = useState("")
  const [type, setType] = useState("")
  const [stockStatus, setStockStatus] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [brandId, setBrandId] = useState("")
  const [tagId, setTagId] = useState("")
  const [visibility, setVisibility] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [sort, setSort] = useState("sort_order")
  const [dir, setDir] = useState<"asc" | "desc">("asc")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [error, setError] = useState<string | null>(null)
  const [quickId, setQuickId] = useState<number | null>(null)
  const [quickName, setQuickName] = useState("")
  const [quickStatus, setQuickStatus] = useState("draft")
  const [quickPrice, setQuickPrice] = useState("")
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkStatus, setBulkStatus] = useState("publish")
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS)

  useEffect(() => {
    setVisibleColumns(loadVisibleColumns())
  }, [])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(handle)
  }, [search])

  const persistColumns = useCallback((cols: ColumnKey[]) => {
    setVisibleColumns(cols)
    try {
      localStorage.setItem(LS_COLUMNS, JSON.stringify(cols))
    } catch {
      /* ignore */
    }
  }, [])

  const toggleColumn = (key: ColumnKey, checked: boolean) => {
    const next = checked
      ? [...visibleColumns, key].filter((k, i, a) => a.indexOf(k) === i)
      : visibleColumns.filter((k) => k !== key)
    if (next.length === 0) return
    persistColumns(next)
  }

  const columnLabel = (key: ColumnKey): string => {
    const map: Record<ColumnKey, string> = {
      image: t("col_image"),
      name: t("name"),
      sku: t("sku"),
      purchase: t("purchase_price"),
      retail: t("calc_retail"),
      installment: t("calc_installment"),
      credit: t("calc_credit"),
      wholesale: t("calc_wholesale"),
      discount: t("col_discount"),
      sale: t("sale_price"),
      stock: t("stock_status"),
      brand: t("brands"),
      categories: t("categories"),
      tags: t("tags"),
      date: t("col_date"),
      views: t("col_views"),
      status: t("status"),
      visibility: t("catalog_visibility"),
      type: t("type"),
      marketplaces: t("col_marketplaces"),
    }
    return map[key]
  }

  const queryKey = [
    "admin-products",
    debouncedSearch,
    status,
    type,
    stockStatus,
    categoryId,
    brandId,
    tagId,
    visibility,
    dateFrom,
    dateTo,
    sort,
    dir,
    page,
    perPage,
  ] as const

  const lookupQ = useQuery({
    queryKey: ["products-lookup"],
    queryFn: () =>
      api<{ categories: NamedRef[]; brands: NamedRef[]; tags: NamedRef[]; permalink_base?: string }>(
        "/api/v1/products/lookup",
      ),
  })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("per_page", String(perPage))
      params.set("sort", sort)
      params.set("dir", dir)
      if (debouncedSearch) params.set("search", debouncedSearch)
      if (status && status !== "all") params.set("status", status)
      if (type) params.set("type", type)
      if (stockStatus) params.set("stock_status", stockStatus)
      if (categoryId) params.set("category_id", categoryId)
      if (brandId) params.set("brand_id", brandId)
      if (tagId) params.set("tag_id", tagId)
      if (visibility) params.set("catalog_visibility", visibility)
      if (dateFrom) params.set("date_from", dateFrom)
      if (dateTo) params.set("date_to", dateTo)
      return apiListWithMeta<ProductRow>(`/api/v1/products?${params}`)
    },
  })

  const products = data?.items ?? []
  const meta = data?.meta
  const serverStats = meta?.stats

  const stats = useMemo(() => {
    if (serverStats) {
      return {
        total: serverStats.total ?? meta?.total ?? 0,
        publish: serverStats.publish ?? 0,
        draft: serverStats.draft ?? 0,
        outofstock: serverStats.outofstock ?? 0,
        instock: serverStats.instock ?? 0,
        pending: serverStats.pending ?? 0,
        trash: serverStats.trash ?? 0,
      }
    }
    let publish = 0
    let draft = 0
    let outofstock = 0
    let instock = 0
    for (const p of products) {
      if (p.status === "publish") publish += 1
      if (p.status === "draft") draft += 1
      if (p.stock_status === "outofstock") outofstock += 1
      if (p.stock_status === "instock") instock += 1
    }
    return { publish, draft, outofstock, instock, pending: 0, trash: 0, total: meta?.total ?? products.length }
  }, [products, serverStats, meta?.total])

  const duplicate = useMutation({
    mutationFn: (id: number) => api<ProductRow>(`/api/v1/products/${id}/duplicate`, { method: "POST" }),
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-products"] })
      if (product?.id) router.push(`/dashboard/products/${product.id}`)
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

  const bulkPatch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/api/v1/products/bulk", { method: "PATCH", json: body }),
    onSuccess: async () => {
      setSelectedIds([])
      await queryClient.invalidateQueries({ queryKey: ["admin-products"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const applyEnglishSlugs = useMutation({
    mutationFn: () =>
      api("/api/v1/products/apply-english-slugs", {
        method: "POST",
        json: { product_ids: selectedIds },
      }),
    onSuccess: async () => {
      setSelectedIds([])
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

  function clearFilters() {
    setType("")
    setStockStatus("")
    setCategoryId("")
    setBrandId("")
    setTagId("")
    setVisibility("")
    setDateFrom("")
    setDateTo("")
    setSort("sort_order")
    setDir("asc")
    setPage(1)
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
      { id: "total", label: t("stat_total"), value: stats.total },
      { id: "publish", label: t("stat_publish"), value: stats.publish },
      { id: "draft", label: t("stat_draft"), value: stats.draft },
      { id: "outofstock", label: t("stat_outofstock"), value: stats.outofstock },
      { id: "instock", label: t("stat_instock"), value: stats.instock },
    ],
    [stats, t],
  )

  const allPageSelected = products.length > 0 && products.every((p) => selectedIds.includes(p.id))

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds((prev) => [...new Set([...prev, ...products.map((p) => p.id)])])
    } else {
      const pageIds = new Set(products.map((p) => p.id))
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)))
    }
  }

  function toggleRow(id: number, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  async function handlePrintLabels() {
    try {
      await printProductLabels(selectedIds, locale)
    } catch (e) {
      setError(getApiErrorMessage(e as Error))
    }
  }

  function rowActions(p: ProductRow) {
    const storeUrl = p.permalink || (lookupQ.data?.permalink_base ? `${lookupQ.data.permalink_base}${p.slug ?? ""}` : null)
    return (
      <div className="flex flex-wrap gap-1">
        {storeUrl ? (
          <Button size="icon" variant="outline" asChild title={t("view_on_store")}>
            <a href={storeUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
            </a>
          </Button>
        ) : null}
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

  function renderCell(key: ColumnKey, p: ProductRow) {
    switch (key) {
      case "image":
        return p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image_url} alt="" className="size-10 rounded object-cover" />
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      case "name":
        return (
          <Link className="font-medium underline-offset-2 hover:underline" href={`/dashboard/products/${p.id}`}>
            {p.name}
          </Link>
        )
      case "sku":
        return <span className="text-muted-foreground">{p.sku || "—"}</span>
      case "purchase":
        return p.purchase_price_minor ? <MoneyDisplay amount={p.purchase_price_minor} /> : "—"
      case "retail":
        return p.calculated?.retail != null ? (
          <MoneyDisplay amount={p.calculated.retail} />
        ) : (
          <PriceRange row={p} />
        )
      case "installment":
        return p.calculated?.installment != null ? <MoneyDisplay amount={p.calculated.installment} /> : "—"
      case "credit":
        return p.calculated?.credit != null ? <MoneyDisplay amount={p.calculated.credit} /> : "—"
      case "wholesale":
        return p.calculated?.wholesale != null ? <MoneyDisplay amount={p.calculated.wholesale} /> : "—"
      case "discount":
        return p.discount_percent != null && p.discount_percent > 0 ? `${p.discount_percent}%` : "—"
      case "sale":
        return p.sale_price_minor && p.is_on_sale ? <MoneyDisplay amount={p.sale_price_minor} /> : "—"
      case "stock":
        return (
          <Badge variant={statusBadgeVariant(p.stock_status)}>
            {enumLabel("stock_status", p.stock_status)}
          </Badge>
        )
      case "brand":
        return <span className="text-muted-foreground">{joinNames(p.brands)}</span>
      case "categories":
        return <span className="text-muted-foreground">{joinNames(p.categories, p.category)}</span>
      case "tags":
        return (
          <span className="text-muted-foreground">
            {p.tag_names?.length ? p.tag_names.join("، ") : joinNames(p.tags)}
          </span>
        )
      case "date":
        return formatListDate(p.created_at, locale)
      case "views":
        return p.views_count ?? 0
      case "status":
        return (
          <Badge variant={statusBadgeVariant(p.status)}>{enumLabel("product_status", p.status)}</Badge>
        )
      case "visibility":
        return enumLabel("catalog_visibility", p.catalog_visibility)
      case "type":
        return enumLabel("product_type", p.type) || p.type || "—"
      case "marketplaces":
        return p.marketplace_platforms?.length ? (
          <span className="text-muted-foreground text-xs">
            {p.marketplace_platforms.map((m) => `${m.platform}${m.connected ? " ✓" : ""}`).join("، ")}
          </span>
        ) : (
          "—"
        )
      default:
        return null
    }
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

  const filterActiveCount = [
    type,
    stockStatus,
    categoryId,
    brandId,
    tagId,
    visibility,
    dateFrom,
    dateTo,
    sort !== "sort_order" ? sort : "",
    dir !== "asc" ? dir : "",
  ].filter(Boolean).length

  const colSpan = visibleColumns.length + 2

  return (
    <PageShell
      title={t("products_title")}
      description={t("products_subtitle")}
      actions={
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 className="size-4" />
                {t("col_picker")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[min(24rem,70vh)] overflow-y-auto">
              {COLUMN_KEYS.map((key) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={visibleColumns.includes(key)}
                  onCheckedChange={(v) => toggleColumn(key, v === true)}
                >
                  {columnLabel(key)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild>
            <Link href="/dashboard/products/new">
              <Plus className="size-4" />
              {t("add_product")}
            </Link>
          </Button>
        </div>
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
              <option value="grouped">{t("type_grouped")}</option>
              <option value="external">{t("type_external")}</option>
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
            <Label>{t("tags")}</Label>
            <select className={`${selectClass} mt-1`} value={tagId} onChange={(e) => setTagId(e.target.value)}>
              <option value="">{t("all")}</option>
              {(lookupQ.data?.tags ?? []).map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
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
          <div>
            <Label>{t("col_sort")}</Label>
            <select className={`${selectClass} mt-1`} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="sort_order">{t("sort_order")}</option>
              <option value="name">{t("name")}</option>
              <option value="price_minor">{t("price")}</option>
              <option value="created_at">{t("col_date")}</option>
              <option value="stock">{t("stock")}</option>
              <option value="views_count">{t("col_views")}</option>
            </select>
          </div>
          <div>
            <Label>{t("col_sort_dir")}</Label>
            <select
              className={`${selectClass} mt-1`}
              value={dir}
              onChange={(e) => setDir(e.target.value === "desc" ? "desc" : "asc")}
            >
              <option value="asc">{t("sort_asc")}</option>
              <option value="desc">{t("sort_desc")}</option>
            </select>
          </div>
          <div>
            <Label>{t("date_from")}</Label>
            <Input className="mt-1" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label>{t("date_to")}</Label>
            <Input className="mt-1" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setPage(1)
                void queryClient.invalidateQueries({ queryKey: ["admin-products"] })
              }}
            >
              {t("apply_filters")}
            </Button>
            <Button variant="ghost" onClick={clearFilters}>
              {t("clear_filters")}
            </Button>
          </div>
        </div>
      </ListFiltersCollapsible>

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <span className="text-muted-foreground text-sm">{t("selected_count", { count: selectedIds.length })}</span>
          <select
            className={`${selectClass} max-w-[160px]`}
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
          >
            {(["publish", "draft", "pending", "private", "trash"] as const).map((v) => (
              <option key={v} value={v}>
                {enumLabel("product_status", v)}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={bulkPatch.isPending}
            onClick={() => bulkPatch.mutate({ product_ids: selectedIds, status: bulkStatus })}
          >
            {t("bulk_change_status")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={applyEnglishSlugs.isPending}
            onClick={() => applyEnglishSlugs.mutate()}
          >
            {t("apply_english_slugs")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={bulkPatch.isPending}
            onClick={() => bulkPatch.mutate({ product_ids: selectedIds, status: "draft" })}
          >
            {t("restore_from_trash")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void handlePrintLabels()}>
            {t("print_warehouse_labels")}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={bulkPatch.isPending}
            onClick={() =>
              confirm({
                description: t("bulk_trash_confirm", { count: selectedIds.length }),
                onConfirm: () => bulkPatch.mutateAsync({ product_ids: selectedIds, status: "trash" }),
              })
            }
          >
            {t("bulk_trash")}
          </Button>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-card/40">
        <div className="border-b px-4 py-3 text-sm font-medium">{t("products_heading")}</div>
        <div className="p-2 sm:p-4">
          {isError ? (
            <QueryErrorState onRetry={() => refetch()} />
          ) : isLoading ? (
            <TableListSkeleton rows={8} columns={Math.min(visibleColumns.length + 2, 10)} />
          ) : products.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty_products")}</p>
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {products.map((p) => (
                  <MobileListCard
                    key={p.id}
                    media={
                      <div className="flex items-start gap-2">
                        <Checkbox
                          checked={selectedIds.includes(p.id)}
                          onCheckedChange={(v) => toggleRow(p.id, v === true)}
                        />
                        <div className="flex flex-1 items-start justify-between gap-2">
                          <Link
                            className="font-medium underline-offset-2 hover:underline"
                            href={`/dashboard/products/${p.id}`}
                          >
                            {p.name}
                          </Link>
                          <Badge variant={statusBadgeVariant(p.status)}>{enumLabel("product_status", p.status)}</Badge>
                        </div>
                      </div>
                    }
                    actions={rowActions(p)}
                  >
                    {p.image_url ? (
                      <MobileListField label={t("col_image")}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.image_url} alt="" className="size-12 rounded object-cover" />
                      </MobileListField>
                    ) : null}
                    <MobileListField label={t("price")}>
                      <PriceRange row={p} />
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
                      <th className="w-10 p-2">
                        <Checkbox checked={allPageSelected} onCheckedChange={(v) => toggleSelectAll(v === true)} />
                      </th>
                      {visibleColumns.map((key) => (
                        <th key={key} className="p-2 text-start font-medium">
                          {columnLabel(key)}
                        </th>
                      ))}
                      <th className="p-2 text-start font-medium">{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <Fragment key={p.id}>
                        <tr className="border-b last:border-0">
                          <td className="p-2">
                            <Checkbox
                              checked={selectedIds.includes(p.id)}
                              onCheckedChange={(v) => toggleRow(p.id, v === true)}
                            />
                          </td>
                          {visibleColumns.map((key) => (
                            <td key={key} className="p-2">
                              {renderCell(key, p)}
                            </td>
                          ))}
                          <td className="p-2">{rowActions(p)}</td>
                        </tr>
                        {quickId === p.id ? (
                          <tr className="bg-muted/20 border-b">
                            <td colSpan={colSpan} className="p-3">
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
