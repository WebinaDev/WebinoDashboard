"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Category = {
  id: number
  name: string
  slug: string
  parent_id?: number | null
  description?: string | null
  image_url?: string | null
  icon_url?: string | null
  sort_order?: number
}

const empty = {
  name: "",
  slug: "",
  parent_id: "" as string | number,
  description: "",
  image_url: "",
  icon_url: "",
  sort_order: 0,
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export default function ProductCategoryEditorPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const categoryId = route.params?.categoryId
  const isNew = !categoryId || categoryId === "new"

  const [form, setForm] = useState(empty)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: categories = [] } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => api<Category[]>("/api/v1/categories"),
  })

  const { data: category, isLoading } = useQuery({
    queryKey: ["admin-category", categoryId],
    enabled: !isNew,
    queryFn: () => api<Category>(`/api/v1/categories/${categoryId}`),
  })

  useEffect(() => {
    if (!category) return
    setForm({
      name: category.name ?? "",
      slug: category.slug ?? "",
      parent_id: category.parent_id ?? "",
      description: category.description ?? "",
      image_url: category.image_url ?? "",
      icon_url: category.icon_url ?? "",
      sort_order: category.sort_order ?? 0,
    })
  }, [category])

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        slug: form.slug || undefined,
        parent_id: form.parent_id ? Number(form.parent_id) : null,
        description: form.description || null,
        image_url: form.image_url || null,
        icon_url: form.icon_url || null,
        sort_order: Number(form.sort_order) || 0,
      }
      if (isNew) return api<Category>("/api/v1/categories", { method: "POST", json: payload })
      return api<Category>(`/api/v1/categories/${categoryId}`, { method: "PATCH", json: payload })
    },
    onSuccess: async (row) => {
      setMessage(t("saved"))
      await queryClient.invalidateQueries({ queryKey: ["admin-categories"] })
      if (isNew && row?.id) window.location.assign(`/admin/product-categories/${row.id}`)
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6" dir="auto">
      <div>
        <h1 className="text-2xl font-bold">{isNew ? t("new_category") : t("edit_category")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!isNew && isLoading ? (
        <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("category_details")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>{t("name")}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>{t("slug")}</Label>
              <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
            </div>
            <div>
              <Label>{t("parent")}</Label>
              <select
                className={selectClass}
                value={form.parent_id}
                onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}
              >
                <option value="">{t("no_parent")}</option>
                {categories
                  .filter((c) => String(c.id) !== String(categoryId))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label>{t("description")}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t("image_url")}</Label>
                <Input
                  value={form.image_url}
                  onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t("icon_url")}</Label>
                <Input
                  value={form.icon_url}
                  onChange={(e) => setForm((f) => ({ ...f, icon_url: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>{t("sort_order")}</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
                {tCommon("save")}
              </Button>
              <Button variant="outline" asChild>
                <Link href="/admin/product-categories">{tCommon("cancel")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
