"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { unwrapApiResponse } from "@webina/ui"
import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  calculated?: { retail?: number; credit?: number; wholesale?: number }
}

type PageMeta = {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

type Named = { id: number; name: string }

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

export default function PricingBulkEditorPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()

  const [search, setSearch] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [brandId, setBrandId] = useState("")
  const [stockStatus, setStockStatus] = useState("")
  const [locked, setLocked] = useState("")
  const [page, setPage] = useState(1)
  const [drafts, setDrafts] = useState<Record<number, Partial<BulkProduct>>>({})
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const { data: categories = [] } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => api<Named[]>("/api/v1/categories"),
  })
  const { data: brands = [] } = useQuery({
    queryKey: ["admin-brands"],
    queryFn: () => api<Named[]>("/api/v1/brands"),
  })

  const { data, isLoading } = useQuery({
    queryKey: ["bulk-products", search, categoryId, brandId, stockStatus, locked, page],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("per_page", "50")
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

  function draftOf(p: BulkProduct) {
    return { ...p, ...drafts[p.id] }
  }

  function patchDraft(id: number, patch: Partial<BulkProduct>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))
  }

  const saveRow = useMutation({
    mutationFn: async (id: number) => {
      const row = products.find((p) => p.id === id)
      if (!row) return
      const d = draftOf(row)
      await api(`/api/v1/pricing/bulk-products/${id}/purchase-price`, {
        method: "PATCH",
        json: { purchase_price_minor: Number(d.purchase_price_minor ?? 0) },
      })
      await api(`/api/v1/pricing/bulk-products/${id}/wc-price`, {
        method: "PATCH",
        json: {
          price_minor: Number(d.price_minor ?? 0),
          sale_price_minor: d.sale_price_minor != null ? Number(d.sale_price_minor) : null,
        },
      })
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
    },
    onSuccess: async () => {
      setMessage(t("saved"))
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ["bulk-products"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <div className="space-y-6 p-6" dir="auto">
      <div>
        <h1 className="text-2xl font-bold">{t("bulk_editor_title")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

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
          <div>
            <Label>{t("lock_price")}</Label>
            <select className={`${selectClass} mt-1`} value={locked} onChange={(e) => setLocked(e.target.value)}>
              <option value="">{t("all")}</option>
              <option value="1">{tCommon("yes")}</option>
              <option value="0">{tCommon("no")}</option>
            </select>
          </div>
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

      <Card>
        <CardHeader>
          <CardTitle>{t("bulk_editor_heading")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : products.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty_products")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="p-2 font-medium">{t("name")}</th>
                    <th className="p-2 font-medium">{t("purchase_price")}</th>
                    <th className="p-2 font-medium">{t("price")}</th>
                    <th className="p-2 font-medium">{t("stock")}</th>
                    <th className="p-2 font-medium">{t("lock_price")}</th>
                    <th className="p-2 font-medium">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const d = draftOf(p)
                    return (
                      <tr key={p.id} className="border-b align-top last:border-0">
                        <td className="p-2">
                          <p className="font-medium">{p.name}</p>
                          <p className="text-muted-foreground text-xs">{p.sku || "—"}</p>
                          {p.calculated?.retail != null ? (
                            <Badge variant="outline" className="mt-1">
                              {t("calc_retail")}: {p.calculated.retail.toLocaleString()}
                            </Badge>
                          ) : null}
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            value={d.purchase_price_minor ?? 0}
                            onChange={(e) => patchDraft(p.id, { purchase_price_minor: Number(e.target.value) })}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            value={d.price_minor ?? 0}
                            onChange={(e) => patchDraft(p.id, { price_minor: Number(e.target.value) })}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            value={d.stock ?? 0}
                            onChange={(e) => patchDraft(p.id, { stock: Number(e.target.value) })}
                          />
                        </td>
                        <td className="p-2">
                          <Checkbox
                            checked={Boolean(d.lock_price)}
                            onCheckedChange={(v) => patchDraft(p.id, { lock_price: Boolean(v) })}
                          />
                        </td>
                        <td className="p-2">
                          <Button size="sm" disabled={saveRow.isPending} onClick={() => saveRow.mutate(p.id)}>
                            {tCommon("save")}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
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
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronRight className="size-4" />
                  {t("prev")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= meta.last_page}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("next")}
                  <ChevronLeft className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
