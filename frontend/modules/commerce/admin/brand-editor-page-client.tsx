"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"

import { MediaPickerField } from "@/components/content/MediaPickerField"
import { RichTextEditor } from "@/components/content/RichTextEditor"
import { SimpleSeoFields } from "@/components/seo/SimpleSeoFields"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { flatTreeOptions, metaWithSeo, seoFromMeta, slugFromName } from "@/lib/taxonomy-helpers"

type Brand = {
  id: number
  name: string
  slug: string
  parent_id?: number | null
  description?: string | null
  image_url?: string | null
  thumbnail_id?: number | null
  meta?: Record<string, unknown> | null
}

const empty = {
  name: "",
  slug: "",
  parent_id: "" as string | number,
  description: "",
  image_url: "",
  thumbnail_id: null as number | null,
  seo_keyword: "",
  seo_title: "",
  seo_description: "",
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export default function BrandEditorPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const brandId = route.params?.brandId
  const isNew = !brandId || brandId === "new"

  const [form, setForm] = useState(empty)
  const [slugTouched, setSlugTouched] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: brands = [] } = useQuery({
    queryKey: ["admin-brands"],
    queryFn: () => api<Brand[]>("/api/v1/brands"),
  })

  const parentOptions = useMemo(
    () => flatTreeOptions(brands, isNew ? null : brandId),
    [brands, brandId, isNew],
  )

  const { data: brand, isLoading } = useQuery({
    queryKey: ["admin-brand", brandId],
    enabled: !isNew,
    queryFn: () => api<Brand>(`/api/v1/brands/${brandId}`),
  })

  useEffect(() => {
    if (!brand) return
    const seo = seoFromMeta(brand.meta)
    setForm({
      name: brand.name ?? "",
      slug: brand.slug ?? "",
      parent_id: brand.parent_id ?? "",
      description: brand.description ?? "",
      image_url: brand.image_url ?? "",
      thumbnail_id: brand.thumbnail_id ?? null,
      seo_keyword: seo.focus_keyword,
      seo_title: seo.title,
      seo_description: seo.description,
    })
    setSlugTouched(true)
  }, [brand])

  const save = useMutation({
    mutationFn: () => {
      const meta = metaWithSeo(brand?.meta, {
        focus_keyword: form.seo_keyword,
        title: form.seo_title,
        description: form.seo_description,
      })
      const payload = {
        name: form.name,
        slug: form.slug || undefined,
        parent_id: form.parent_id ? Number(form.parent_id) : null,
        description: form.description || null,
        image_url: form.image_url || null,
        thumbnail_id: form.thumbnail_id,
        meta,
      }
      if (isNew) return api<Brand>("/api/v1/brands", { method: "POST", json: payload })
      return api<Brand>(`/api/v1/brands/${brandId}`, { method: "PATCH", json: payload })
    },
    onSuccess: async (row) => {
      setMessage(t("saved"))
      await queryClient.invalidateQueries({ queryKey: ["admin-brands"] })
      if (isNew && row?.id) {
        window.location.assign(`/dashboard/brands/${row.id}`)
      }
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6" dir="auto">
      <div>
        <h1 className="text-2xl font-bold">{isNew ? t("new_brand") : t("edit_brand")}</h1>
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
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onBlur={() => {
                  if (!slugTouched && form.name.trim()) {
                    setForm((f) => ({ ...f, slug: slugFromName(f.name) }))
                  }
                }}
              />
            </div>
            <div>
              <Label>{t("slug")}</Label>
              <Input
                value={form.slug}
                dir="ltr"
                onChange={(e) => {
                  setSlugTouched(true)
                  setForm((f) => ({ ...f, slug: e.target.value }))
                }}
              />
            </div>
            <div>
              <Label>{t("parent")}</Label>
              <select
                className={selectClass}
                value={form.parent_id}
                onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}
              >
                <option value="">{t("no_parent")}</option>
                {parentOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t("description")}</Label>
              <RichTextEditor
                value={form.description}
                onChange={(html) => setForm((f) => ({ ...f, description: html }))}
              />
            </div>
            <MediaPickerField
              label={t("featured_image")}
              imageUrl={form.image_url}
              onPick={(item) =>
                setForm((f) => ({
                  ...f,
                  image_url: item.url,
                  thumbnail_id: item.id,
                }))
              }
              onClear={() => setForm((f) => ({ ...f, image_url: "", thumbnail_id: null }))}
            />
            <SimpleSeoFields
              seo={{
                focus_keyword: form.seo_keyword,
                title: form.seo_title,
                description: form.seo_description,
              }}
              onChange={(seo) =>
                setForm((f) => ({
                  ...f,
                  seo_keyword: seo.focus_keyword ?? "",
                  seo_title: seo.title ?? "",
                  seo_description: seo.description ?? "",
                }))
              }
            />
            <div className="flex gap-2 pt-2">
              <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
                {tCommon("save")}
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard/brands">{tCommon("cancel")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
