"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Search, Trash2 } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"

import { useConfirm } from "@/components/ConfirmDialog"
import { QueryErrorState } from "@/components/QueryErrorState"
import { ScrollTable } from "@/components/ScrollTable"
import { TableListSkeleton } from "@/components/TableListSkeleton"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { flatTreeOptions, totalCategoryProducts } from "@/lib/taxonomy-helpers"

type Category = {
  id: number
  name: string
  slug: string
  parent_id?: number | null
  image_url?: string | null
  icon_url?: string | null
  products_count?: number
  products_many_count?: number
  views_count?: number
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export default function ProductCategoriesPageClient({ route }: { route: ResolvedAdminRoute }) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const t = useTranslations("store")
  const locale = normalizeUiLocale(useLocale())
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("")
  const [parentFilter, setParentFilter] = useState("")
  const [error, setError] = useState<string | null>(null)

  const { data: categories = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-categories", q, parentFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (q.trim()) params.set("search", q.trim())
      if (parentFilter === "root") params.set("parent", "root")
      else if (parentFilter) params.set("parent_id", parentFilter)
      const qs = params.toString()
      return api<Category[]>(`/api/v1/categories${qs ? `?${qs}` : ""}`)
    },
  })

  const parentOptions = useMemo(() => flatTreeOptions(categories), [categories])

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/v1/categories/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-categories"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <div className="space-y-6 p-6" dir="auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("categories_title")}</h1>
          <p className="text-muted-foreground text-sm">{route.fullPath}</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/product-categories/new">
            <Plus className="size-4" />
            {t("add_category")}
          </Link>
        </Button>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="min-w-[220px] flex-1">
            <Label>{t("search")}</Label>
            <div className="relative mt-1">
              <Search className="text-muted-foreground absolute start-2 top-2.5 size-4" />
              <Input
                className="ps-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setQ(search)}
              />
            </div>
          </div>
          <div className="min-w-[180px] flex-1">
            <Label>{t("filter_parent")}</Label>
            <select
              className={`${selectClass} mt-1`}
              value={parentFilter}
              onChange={(e) => setParentFilter(e.target.value)}
            >
              <option value="">{t("all_parents")}</option>
              <option value="root">{t("top_level_only")}</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <Button variant="secondary" onClick={() => setQ(search)}>
            {t("apply_filters")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("categories_heading")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <QueryErrorState onRetry={() => refetch()} />
          ) : isLoading ? (
            <TableListSkeleton rows={5} columns={6} />
          ) : categories.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty_categories")}</p>
          ) : (
            <ScrollTable>
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="p-2 text-start font-medium">{t("col_image")}</th>
                    <th className="p-2 text-start font-medium">{t("name")}</th>
                    <th className="p-2 text-start font-medium">{t("slug")}</th>
                    <th className="p-2 text-start font-medium">{t("col_products")}</th>
                    <th className="p-2 text-start font-medium">{t("col_views")}</th>
                    <th className="p-2 text-start font-medium">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => {
                    const img = c.image_url || c.icon_url
                    const count = totalCategoryProducts(c)
                    return (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="p-2">
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt="" className="size-10 rounded-md border object-cover" />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="p-2 font-medium">{c.name}</td>
                        <td className="p-2 text-muted-foreground text-xs" dir="ltr">
                          {c.slug}
                        </td>
                        <td className="p-2 tabular-nums">{formatNumber(count, locale)}</td>
                        <td className="p-2 tabular-nums">
                          {typeof c.views_count === "number" ? formatNumber(c.views_count, locale) : "—"}
                        </td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/dashboard/product-categories/${c.id}`}>
                                <Pencil className="size-4" />
                                <span className="sr-only">{t("edit")}</span>
                              </Link>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                confirm({
                                  description: t("confirm_delete"),
                                  onConfirm: () => remove.mutateAsync(c.id),
                                })
                              }}
                            >
                              <Trash2 className="size-4" />
                              <span className="sr-only">{t("delete")}</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </ScrollTable>
          )}
        </CardContent>
      </Card>
      {confirmDialog}
    </div>
  )
}
