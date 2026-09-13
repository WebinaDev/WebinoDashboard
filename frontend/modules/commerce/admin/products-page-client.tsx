"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { unwrapApiResponse } from "@webina/ui"
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { ApiError, api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

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
  const queryClient = useQueryClient()

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [type, setType] = useState("")
  const [stockStatus, setStockStatus] = useState("")
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const queryKey = ["admin-products", search, status, type, stockStatus, page] as const

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("per_page", "20")
      if (search.trim()) params.set("search", search.trim())
      if (status) params.set("status", status)
      if (type) params.set("type", type)
      if (stockStatus) params.set("stock_status", stockStatus)
      return apiListWithMeta<ProductRow>(`/api/v1/products?${params}`)
    },
  })

  const products = data?.items ?? []
  const meta = data?.meta

  const stats = useMemo(() => {
    let publish = 0
    let draft = 0
    let outofstock = 0
    for (const p of products) {
      if (p.status === "publish") publish += 1
      if (p.status === "draft") draft += 1
      if (p.stock_status === "outofstock") outofstock += 1
    }
    return { publish, draft, outofstock }
  }, [products])

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

  function applyFilters() {
    setPage(1)
    void queryClient.invalidateQueries({ queryKey: ["admin-products"] })
  }

  return (
    <div className="space-y-6 p-6" dir="auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("products_title")}</h1>
          <p className="text-muted-foreground text-sm">{route.fullPath}</p>
        </div>
        <Button asChild>
          <Link href="/admin/products/new">
            <Plus className="size-4" />
            {t("add_product")}
          </Link>
        </Button>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("stat_publish")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.publish}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("stat_draft")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.draft}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("stat_outofstock")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.outofstock}</CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-5">
          <div className="md:col-span-2">
            <Label>{t("search")}</Label>
            <div className="relative mt-1">
              <Search className="text-muted-foreground absolute start-2 top-2.5 size-4" />
              <Input
                className="ps-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                placeholder={t("search_products_ph")}
              />
            </div>
          </div>
          <div>
            <Label>{t("status")}</Label>
            <select className={`${selectClass} mt-1`} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t("all")}</option>
              <option value="publish">{t("status_publish")}</option>
              <option value="draft">{t("status_draft")}</option>
              <option value="trash">{t("status_trash")}</option>
            </select>
          </div>
          <div>
            <Label>{t("type")}</Label>
            <select className={`${selectClass} mt-1`} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">{t("all")}</option>
              <option value="simple">{t("type_simple")}</option>
              <option value="variable">{t("type_variable")}</option>
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
          <div className="flex items-end md:col-span-5">
            <Button variant="secondary" onClick={applyFilters}>
              {t("apply_filters")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("products_heading")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : products.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty_products")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="p-2 font-medium">{t("name")}</th>
                    <th className="p-2 font-medium">{t("sku")}</th>
                    <th className="p-2 font-medium">{t("price")}</th>
                    <th className="p-2 font-medium">{t("stock_status")}</th>
                    <th className="p-2 font-medium">{t("status")}</th>
                    <th className="p-2 font-medium">{t("brands")}</th>
                    <th className="p-2 font-medium">{t("categories")}</th>
                    <th className="p-2 font-medium">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="p-2 font-medium">{p.name}</td>
                      <td className="p-2 text-muted-foreground">{p.sku || "—"}</td>
                      <td className="p-2">{p.price_minor?.toLocaleString()}</td>
                      <td className="p-2">
                        <Badge variant="outline">{p.stock_status || "—"}</Badge>
                      </td>
                      <td className="p-2">
                        <Badge variant={p.status === "publish" ? "default" : "secondary"}>
                          {p.status || "—"}
                        </Badge>
                      </td>
                      <td className="p-2 text-muted-foreground">{joinNames(p.brands)}</td>
                      <td className="p-2 text-muted-foreground">{joinNames(p.categories, p.category)}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          <Button size="icon" variant="outline" asChild title={t("edit")}>
                            <Link href={`/admin/products/${p.id}`}>
                              <Pencil className="size-4" />
                            </Link>
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
                            onClick={() => {
                              if (window.confirm(t("confirm_delete"))) remove.mutate(p.id)
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                          <Button size="icon" variant="ghost" disabled title={t("coming_soon")}>
                            <Send className="size-4" />
                          </Button>
                          <Button size="icon" variant="ghost" disabled title={t("coming_soon")}>
                            <MessageCircle className="size-4" />
                          </Button>
                        </div>
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
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
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
        </CardContent>
      </Card>
    </div>
  )
}
