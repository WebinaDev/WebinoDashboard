"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { unwrapApiResponse } from "@webina/ui"
import { Search } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { PageShell } from "@/components/PageShell"
import { PostsPagination } from "@/components/PostsPagination"
import { QueryErrorState } from "@/components/QueryErrorState"
import { ScrollTable } from "@/components/ScrollTable"
import { TableListSkeleton } from "@/components/TableListSkeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { ApiError, api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type BulkProduct = {
  id: number
  name: string
  sku?: string | null
  purchase_price_minor?: number | null
  price_minor: number
  sale_price_minor?: number | null
  stock?: number | null
  stock_status?: string | null
  lock_price?: boolean
  brands?: Named[]
  calculated?: { retail?: number; credit?: number; wholesale?: number; installment?: number }
}

type PageMeta = {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

type Named = { id: number; name: string }

type PricingSettings = {
  general?: { enabled?: boolean }
  credit?: { enabled?: boolean }
  wholesale?: { enabled?: boolean }
  installment?: { enabled?: boolean }
}

const COLUMN_KEYS = [
  "name",
  "purchase",
  "price",
  "sale",
  "retail",
  "credit",
  "wholesale",
  "installment",
  "brands",
  "stock",
  "lock",
  "actions",
] as const

type ColumnKey = (typeof COLUMN_KEYS)[number]

const LS_COLUMNS = "webino-pricing-bulk-editor-columns"

/** Identity + row actions stay visible; price fields are user-toggleable. */
const ALWAYS_COLUMNS: ColumnKey[] = ["name", "actions"]
const MODULE_OFF_COLUMNS: ColumnKey[] = ["name", "price", "actions"]
const DEFAULT_COLUMNS: ColumnKey[] = [
  "name",
  "purchase",
  "price",
  "credit",
  "brands",
  "stock",
  "lock",
  "actions",
]

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

async function apiListWithMeta<T>(path: string): Promise<{ items: T[]; meta?: PageMeta }> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  const res = await fetch(`${base}${path}`, {
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
  const { data, meta } = unwrapApiResponse<T[]>(raw)
  return { items: Array.isArray(data) ? data : [], meta: meta as PageMeta | undefined }
}

function loadVisibleColumns(available: ColumnKey[]): ColumnKey[] {
  if (typeof window === "undefined") return available.filter((k) => DEFAULT_COLUMNS.includes(k))
  try {
    const raw = localStorage.getItem(LS_COLUMNS)
    if (!raw) return available.filter((k) => DEFAULT_COLUMNS.includes(k) || ALWAYS_COLUMNS.includes(k))
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return available.filter((k) => DEFAULT_COLUMNS.includes(k) || ALWAYS_COLUMNS.includes(k))
    const valid = parsed.filter((k): k is ColumnKey => available.includes(k as ColumnKey))
    for (const k of ALWAYS_COLUMNS) {
      if (available.includes(k) && !valid.includes(k)) valid.push(k)
    }
    return valid.length ? valid : available.filter((k) => DEFAULT_COLUMNS.includes(k) || ALWAYS_COLUMNS.includes(k))
  } catch {
    return available.filter((k) => DEFAULT_COLUMNS.includes(k) || ALWAYS_COLUMNS.includes(k))
  }
}

function availableColumnsFor(settings: PricingSettings | undefined): ColumnKey[] {
  const pricingEnabled = settings?.general?.enabled !== false
  if (!pricingEnabled) return [...MODULE_OFF_COLUMNS]

  const cols: ColumnKey[] = ["name", "purchase", "price", "sale", "retail"]
  if (Boolean(settings?.credit?.enabled)) cols.push("credit")
  if (Boolean(settings?.wholesale?.enabled)) cols.push("wholesale")
  if (Boolean(settings?.installment?.enabled)) cols.push("installment")
  cols.push("brands", "stock", "lock", "actions")
  return cols
}

export default function PricingBulkEditorPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()

  const [search, setSearch] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [brandId, setBrandId] = useState("")
  const [stockStatus, setStockStatus] = useState("")
  const [locked, setLocked] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)
  const [drafts, setDrafts] = useState<Record<number, Partial<BulkProduct> & { brand_id?: number | null }>>({})
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS)

  const { data: categories = [] } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => api<Named[]>("/api/v1/categories"),
  })
  const { data: brands = [] } = useQuery({
    queryKey: ["admin-brands"],
    queryFn: () => api<Named[]>("/api/v1/brands"),
  })
  const { data: pricingSettings } = useQuery({
    queryKey: ["pricing-settings"],
    queryFn: () => api<PricingSettings>("/api/v1/pricing/settings"),
  })

  const availableColumns = useMemo(() => availableColumnsFor(pricingSettings), [pricingSettings])
  const pricingEnabled = pricingSettings?.general?.enabled !== false

  useEffect(() => {
    setVisibleColumns(loadVisibleColumns(availableColumns))
  }, [availableColumns])

  const persistColumns = useCallback((cols: ColumnKey[]) => {
    setVisibleColumns(cols)
    try {
      localStorage.setItem(LS_COLUMNS, JSON.stringify(cols))
    } catch {
      /* ignore */
    }
  }, [])

  const toggleColumn = (key: ColumnKey, checked: boolean) => {
    if (ALWAYS_COLUMNS.includes(key)) return
    // Module off: only the price button exists and must stay on.
    if (!pricingEnabled && key === "price" && !checked) return
    const next = checked
      ? [...visibleColumns, key].filter((k, i, a) => a.indexOf(k) === i)
      : visibleColumns.filter((k) => k !== key)
    const ensured = next.filter((k) => availableColumns.includes(k))
    for (const k of ALWAYS_COLUMNS) {
      if (availableColumns.includes(k) && !ensured.includes(k)) ensured.push(k)
    }
    if (!pricingEnabled && availableColumns.includes("price") && !ensured.includes("price")) {
      ensured.splice(Math.min(1, ensured.length), 0, "price")
    }
    persistColumns(ensured)
  }

  const columnLabel = (key: ColumnKey): string => {
    const map: Record<ColumnKey, string> = {
      name: t("name"),
      purchase: t("purchase_price"),
      price: t("price"),
      sale: t("sale_price"),
      retail: t("calc_retail"),
      credit: t("calc_credit"),
      wholesale: t("calc_wholesale"),
      installment: t("calc_installment"),
      brands: t("brands"),
      stock: t("stock"),
      lock: t("lock_price"),
      actions: t("actions"),
    }
    return map[key]
  }

  const shownColumns = useMemo(
    () => availableColumns.filter((k) => visibleColumns.includes(k)),
    [availableColumns, visibleColumns],
  )

  const toggleableColumns = useMemo(
    () => availableColumns.filter((k) => !ALWAYS_COLUMNS.includes(k)),
    [availableColumns],
  )

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["bulk-products", search, categoryId, brandId, stockStatus, locked, page, perPage],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("per_page", String(perPage))
      if (search.trim()) params.set("search", search.trim())
      if (categoryId) params.set("category_id", categoryId)
      if (brandId) params.set("brand_id", brandId)
      if (stockStatus) params.set("stock_status", stockStatus)
      if (locked) params.set("locked", locked)
      return apiListWithMeta<BulkProduct>(`/api/v1/pricing/bulk-products?${params}`)
    },
  })

  const products = data?.items ?? []
  const meta = data?.meta

  function brandIdOf(p: BulkProduct) {
    const d = drafts[p.id]?.brand_id
    if (d !== undefined) return d
    return p.brands?.[0]?.id ?? null
  }

  function draftOf(p: BulkProduct) {
    return { ...p, brand_id: brandIdOf(p), ...drafts[p.id] }
  }

  function patchDraft(id: number, patch: Partial<BulkProduct> & { brand_id?: number | null }) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))
  }

  const saveRow = useMutation({
    mutationFn: async (id: number) => {
      const row = products.find((p) => p.id === id)
      if (!row) return
      const d = draftOf(row)

      if (pricingEnabled) {
        await api(`/api/v1/pricing/bulk-products/${id}/purchase-price`, {
          method: "PATCH",
          json: { purchase_price_minor: Number(d.purchase_price_minor ?? 0) },
        })
      }

      await api(`/api/v1/pricing/bulk-products/${id}/wc-price`, {
        method: "PATCH",
        json: {
          price_minor: Number(d.price_minor ?? 0),
          sale_price_minor: pricingEnabled
            ? d.sale_price_minor != null
              ? Number(d.sale_price_minor)
              : null
            : undefined,
        },
      })

      if (!pricingEnabled) return

      await api(`/api/v1/pricing/bulk-products/${id}/stock`, {
        method: "PATCH",
        json: {
          stock: d.stock != null ? Number(d.stock) : null,
          stock_status: d.stock_status || undefined,
        },
      })
      await api(`/api/v1/pricing/bulk-products/${id}/lock`, {
        method: "PATCH",
        json: { lock_price: Boolean(d.lock_price) },
      })
      await api(`/api/v1/pricing/bulk-products/${id}/brand`, {
        method: "PATCH",
        json: { brand_id: d.brand_id ?? null },
      })
    },
    onSuccess: async () => {
      setMessage(t("saved"))
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ["bulk-products"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  function renderCell(key: ColumnKey, p: BulkProduct) {
    const d = draftOf(p)
    switch (key) {
      case "name":
        return (
          <>
            <p className="font-medium">{p.name}</p>
            <p className="text-muted-foreground text-xs">{p.sku || "—"}</p>
            {pricingEnabled && p.calculated?.retail != null && !shownColumns.includes("retail") ? (
              <Badge variant="outline" className="mt-1">
                {t("calc_retail")}: <MoneyDisplay amount={p.calculated.retail} />
              </Badge>
            ) : null}
          </>
        )
      case "purchase":
        return (
          <Input
            type="number"
            value={d.purchase_price_minor ?? 0}
            onChange={(e) => patchDraft(p.id, { purchase_price_minor: Number(e.target.value) })}
          />
        )
      case "price":
        return (
          <Input
            type="number"
            value={d.price_minor ?? 0}
            onChange={(e) => patchDraft(p.id, { price_minor: Number(e.target.value) })}
          />
        )
      case "sale":
        return (
          <Input
            type="number"
            value={d.sale_price_minor ?? ""}
            onChange={(e) =>
              patchDraft(p.id, {
                sale_price_minor: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        )
      case "retail":
        return p.calculated?.retail != null ? <MoneyDisplay amount={p.calculated.retail} /> : "—"
      case "credit":
        return p.calculated?.credit != null ? <MoneyDisplay amount={p.calculated.credit} /> : "—"
      case "wholesale":
        return p.calculated?.wholesale != null ? <MoneyDisplay amount={p.calculated.wholesale} /> : "—"
      case "installment":
        return p.calculated?.installment != null ? <MoneyDisplay amount={p.calculated.installment} /> : "—"
      case "brands":
        return (
          <select
            className={selectClass}
            value={d.brand_id ?? ""}
            onChange={(e) =>
              patchDraft(p.id, {
                brand_id: e.target.value ? Number(e.target.value) : null,
              })
            }
          >
            <option value="">—</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )
      case "stock":
        return (
          <Input
            type="number"
            value={d.stock ?? 0}
            onChange={(e) => patchDraft(p.id, { stock: Number(e.target.value) })}
          />
        )
      case "lock":
        return (
          <Checkbox
            checked={Boolean(d.lock_price)}
            onCheckedChange={(v) => patchDraft(p.id, { lock_price: Boolean(v) })}
          />
        )
      case "actions":
        return (
          <Button size="sm" disabled={saveRow.isPending} onClick={() => saveRow.mutate(p.id)}>
            {tCommon("save")}
          </Button>
        )
      default:
        return null
    }
  }

  return (
    <PageShell title={t("bulk_editor_title")} className="flex min-h-[calc(100dvh-8rem)] flex-col">
      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t("col_picker")}>
        <span className="text-muted-foreground text-sm">{t("col_picker")}:</span>
        {(pricingEnabled ? toggleableColumns : (["price"] as ColumnKey[])).map((key) => {
          const on = visibleColumns.includes(key)
          const lockedOn = !pricingEnabled && key === "price"
          return (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={on ? "default" : "outline"}
              className={cn(!on && "text-muted-foreground")}
              aria-pressed={on}
              disabled={lockedOn}
              onClick={() => toggleColumn(key, !on)}
            >
              {columnLabel(key)}
            </Button>
          )
        })}
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-5">
          <div className="md:col-span-2">
            <Label>{t("search")}</Label>
            <div className="relative mt-1">
              <Search className="text-muted-foreground absolute start-2 top-2.5 size-4" />
              <Input className="ps-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>{t("categories")}</Label>
            <select className={`${selectClass} mt-1`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t("all")}</option>
              {categories.map((c) => (
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
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("stock_status")}</Label>
            <select className={`${selectClass} mt-1`} value={stockStatus} onChange={(e) => setStockStatus(e.target.value)}>
              <option value="">{t("all")}</option>
              <option value="instock">{t("stock_instock")}</option>
              <option value="outofstock">{t("stock_outofstock")}</option>
            </select>
          </div>
          {pricingEnabled ? (
            <div>
              <Label>{t("lock_price")}</Label>
              <select className={`${selectClass} mt-1`} value={locked} onChange={(e) => setLocked(e.target.value)}>
                <option value="">{t("all")}</option>
                <option value="1">{tCommon("yes")}</option>
                <option value="0">{tCommon("no")}</option>
              </select>
            </div>
          ) : null}
          <div className="flex items-end md:col-span-5">
            <Button
              variant="secondary"
              onClick={() => {
                setPage(1)
                void queryClient.invalidateQueries({ queryKey: ["bulk-products"] })
              }}
            >
              {t("apply_filters")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle>{t("bulk_editor_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          {isError ? (
            <QueryErrorState onRetry={() => refetch()} />
          ) : isLoading ? (
            <TableListSkeleton rows={8} columns={Math.min(shownColumns.length, 10)} />
          ) : products.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty_products")}</p>
          ) : (
            <ScrollTable className="min-h-0 flex-1">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    {shownColumns.map((key) => (
                      <th key={key} className="p-2 font-medium">
                        {columnLabel(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b align-top last:border-0">
                      {shownColumns.map((key) => (
                        <td key={key} className="p-2">
                          {renderCell(key, p)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          )}

          {!isLoading && !isError ? (
            <PostsPagination
              className="mt-4"
              page={page}
              perPage={perPage}
              found={meta?.total ?? products.length}
              onPageChange={setPage}
              onPerPageChange={(n) => {
                setPerPage(n)
                setPage(1)
              }}
            />
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  )
}
