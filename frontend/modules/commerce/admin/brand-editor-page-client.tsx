"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Brand = {
  id: number
  name: string
  slug: string
  parent_id?: number | null
  description?: string | null
  image_url?: string | null
}

const empty = {
  name: "",
  slug: "",
  parent_id: "" as string | number,
  description: "",
  image_url: "",
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export default function BrandEditorPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const brandId = route.params?.brandId
  const isNew = !brandId || brandId === "new"

  const [form, setForm] = useState(empty)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: brands = [] } = useQuery({
    queryKey: ["admin-brands"],
    queryFn: () => api<Brand[]>("/api/v1/brands"),
  })

  const { data: brand, isLoading } = useQuery({
    queryKey: ["admin-brand", brandId],
    enabled: !isNew,
    queryFn: () => api<Brand>(`/api/v1/brands/${brandId}`),
  })

  useEffect(() => {
    if (!brand) return
    setForm({
      name: brand.name ?? "",
      slug: brand.slug ?? "",
      parent_id: brand.parent_id ?? "",
      description: brand.description ?? "",
      image_url: brand.image_url ?? "",
    })
  }, [brand])

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        slug: form.slug || undefined,
        parent_id: form.parent_id ? Number(form.parent_id) : null,
        description: form.description || null,
        image_url: form.image_url || null,
      }
      if (isNew) return api<Brand>("/api/v1/brands", { method: "POST", json: payload })
      return api<Brand>(`/api/v1/brands/${brandId}`, { method: "PATCH", json: payload })
    },
    onSuccess: async (row) => {
      setMessage(t("saved"))
      await queryClient.invalidateQueries({ queryKey: ["admin-brands"] })
      if (isNew && row?.id) {
        window.location.assign(`/admin/brands/${row.id}`)
      }
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6" dir="auto">
      <div>
        <h1 className="text-2xl font-bold">{isNew ? t("new_brand") : t("edit_brand")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!isNew && isLoading ? (
        <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("brand_details")}</CardTitle>
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
                {brands
                  .filter((b) => String(b.id) !== String(brandId))
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
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
            <div>
              <Label>{t("image_url")}</Label>
              <Input
                value={form.image_url}
                onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
                {tCommon("save")}
              </Button>
              <Button variant="outline" asChild>
                <Link href="/admin/brands">{tCommon("cancel")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
