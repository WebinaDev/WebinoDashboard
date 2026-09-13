"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Search, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Category = {
  id: number
  name: string
  slug: string
  parent_id?: number | null
  products_count?: number
}

export default function ProductCategoriesPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("")
  const [error, setError] = useState<string | null>(null)

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["admin-categories", q],
    queryFn: () => {
      const params = new URLSearchParams()
      if (q.trim()) params.set("search", q.trim())
      const qs = params.toString()
      return api<Category[]>(`/api/v1/categories${qs ? `?${qs}` : ""}`)
    },
  })

  const byId = new Map(categories.map((c) => [c.id, c]))

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
          <Link href="/admin/product-categories/new">
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
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : categories.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty_categories")}</p>
          ) : (
            <ul className="space-y-2">
              {categories.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {c.slug}
                      {c.parent_id ? ` · ${byId.get(c.parent_id)?.name ?? c.parent_id}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/admin/product-categories/${c.id}`}>
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(t("confirm_delete"))) remove.mutate(c.id)
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
