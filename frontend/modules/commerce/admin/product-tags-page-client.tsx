"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { PageShell } from "@/components/PageShell"
import { QueryErrorState } from "@/components/QueryErrorState"
import { ScrollTable } from "@/components/ScrollTable"
import { SimpleSeoFields } from "@/components/seo/SimpleSeoFields"
import { TableListSkeleton } from "@/components/TableListSkeleton"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { metaWithSeo, seoFromMeta, slugFromName } from "@/lib/taxonomy-helpers"

type ProductTag = {
  id: number
  name: string
  slug: string
  products_count?: number
  meta?: Record<string, unknown> | null
}

type SeoState = { title?: string; description?: string; focus_keyword?: string }

const SEO_OPEN_KEY = "webina.seo.open.product-tags"

export default function ProductTagsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const locale = normalizeUiLocale(useLocale())
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("")
  const [status, setStatus] = useState("")

  const [createName, setCreateName] = useState("")
  const [createSlug, setCreateSlug] = useState("")
  const [createSlugAuto, setCreateSlugAuto] = useState(true)
  const [createSeo, setCreateSeo] = useState<SeoState>({})

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState("")
  const [editSlug, setEditSlug] = useState("")
  const [editSlugAuto, setEditSlugAuto] = useState(false)
  const [editSeo, setEditSeo] = useState<SeoState>({})

  const { data: tags = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-product-tags", q, status],
    queryFn: () => {
      const params = new URLSearchParams()
      if (q.trim()) params.set("search", q.trim())
      if (status) params.set("status", status)
      const qs = params.toString()
      return api<ProductTag[]>(`/api/v1/product-tags${qs ? `?${qs}` : ""}`)
    },
  })

  const openEdit = (tag: ProductTag) => {
    setEditId(tag.id)
    setEditName(tag.name)
    setEditSlug(tag.slug)
    setEditSlugAuto(false)
    setEditSeo(seoFromMeta(tag.meta))
    setDialogOpen(true)
  }

  const createMut = useMutation({
    mutationFn: () => {
      const trimmedName = createName.trim()
      const nextSlug = createSlug.trim() || slugFromName(trimmedName)
      return api<ProductTag>("/api/v1/product-tags", {
        method: "POST",
        json: { name: trimmedName, slug: nextSlug || undefined, meta: metaWithSeo(null, createSeo) },
      })
    },
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      setCreateName("")
      setCreateSlug("")
      setCreateSlugAuto(true)
      setCreateSeo({})
      await queryClient.invalidateQueries({ queryKey: ["admin-product-tags"] })
      await queryClient.invalidateQueries({ queryKey: ["products-lookup"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const saveMut = useMutation({
    mutationFn: () => {
      const trimmedName = editName.trim()
      const nextSlug = editSlug.trim() || slugFromName(trimmedName)
      return api<ProductTag>(`/api/v1/product-tags/${editId}`, {
        method: "PATCH",
        json: { name: trimmedName, slug: nextSlug || undefined, meta: metaWithSeo(null, editSeo) },
      })
    },
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      setDialogOpen(false)
      await queryClient.invalidateQueries({ queryKey: ["admin-product-tags"] })
      await queryClient.invalidateQueries({ queryKey: ["products-lookup"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: (id: number) =>
      api(`/api/v1/product-tags/${id}${status === "trash" ? "?force=1" : ""}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-product-tags"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  return (
    <PageShell
      title={t("product_tags_title")}
      actions={
        <Button
          type="button"
          variant={status === "trash" ? "default" : "outline"}
          onClick={() => setStatus((s) => (s === "trash" ? "" : "trash"))}
        >
          {status === "trash" ? t("show_active") : t("show_trash")}
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <form
          className="space-y-3 rounded-xl border p-4"
          onSubmit={(e) => {
            e.preventDefault()
            void createMut.mutateAsync()
          }}
        >
          <p className="font-medium">{t("add_product_tag")}</p>
          <div className="space-y-1">
            <Label>{t("name")}</Label>
            <Input
              value={createName}
              onChange={(e) => {
                const next = e.target.value
                setCreateName(next)
                if (createSlugAuto) setCreateSlug(slugFromName(next))
              }}
              required
            />
          </div>
          <div className="space-y-1">
            <Label>{t("slug")}</Label>
            <Input
              value={createSlug}
              dir="ltr"
              onChange={(e) => {
                setCreateSlugAuto(false)
                setCreateSlug(e.target.value)
              }}
              placeholder={t("slug_from_name_hint")}
            />
          </div>
          <SimpleSeoFields
            seo={createSeo}
            onChange={setCreateSeo}
            collapsible
            storageKey={SEO_OPEN_KEY}
            defaultOpen={false}
          />
          <Button type="submit" disabled={!createName.trim() || createMut.isPending}>
            <Plus className="size-4" />
            {t("add_product_tag")}
          </Button>
        </form>

        <div className="space-y-4">
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
              <CardTitle>{t("product_tags_heading")}</CardTitle>
            </CardHeader>
            <CardContent>
              {isError ? (
                <QueryErrorState onRetry={() => refetch()} />
              ) : isLoading ? (
                <TableListSkeleton rows={5} columns={4} />
              ) : tags.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("empty_product_tags")}</p>
              ) : (
                <ScrollTable>
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b text-start text-muted-foreground">
                        <th className="p-2 text-start font-medium">{t("name")}</th>
                        <th className="p-2 text-start font-medium">{t("slug")}</th>
                        <th className="p-2 text-start font-medium">{t("col_products")}</th>
                        <th className="p-2 text-start font-medium">{t("actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tags.map((tag) => (
                        <tr key={tag.id} className="border-b last:border-0">
                          <td className="p-2 font-medium">{tag.name}</td>
                          <td className="p-2 text-muted-foreground text-xs" dir="ltr">
                            {tag.slug}
                          </td>
                          <td className="p-2 tabular-nums">
                            {typeof tag.products_count === "number"
                              ? formatNumber(tag.products_count, locale)
                              : "—"}
                          </td>
                          <td className="p-2">
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => openEdit(tag)}>
                                <Pencil className="size-4" />
                                <span className="sr-only">{t("edit")}</span>
                              </Button>
                              {status === "trash" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    api(`/api/v1/product-tags/${tag.id}/restore`, { method: "POST" }).then(() =>
                                      queryClient.invalidateQueries({ queryKey: ["admin-product-tags"] }),
                                    )
                                  }
                                >
                                  <RotateCcw className="size-4" />
                                  <span className="sr-only">{t("restore")}</span>
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  confirm({
                                    description: t("confirm_delete"),
                                    onConfirm: () => remove.mutateAsync(tag.id),
                                  })
                                }}
                              >
                                <Trash2 className="size-4" />
                                <span className="sr-only">{t("delete")}</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollTable>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("edit_product_tag")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("name")}</Label>
              <Input
                value={editName}
                onChange={(e) => {
                  const next = e.target.value
                  setEditName(next)
                  if (editSlugAuto) setEditSlug(slugFromName(next))
                }}
              />
            </div>
            <div>
              <Label>{t("slug")}</Label>
              <Input
                value={editSlug}
                dir="ltr"
                onChange={(e) => {
                  setEditSlugAuto(false)
                  setEditSlug(e.target.value)
                }}
                placeholder={t("slug_from_name_hint")}
              />
            </div>
            <SimpleSeoFields
              seo={editSeo}
              onChange={setEditSeo}
              collapsible
              storageKey={SEO_OPEN_KEY}
              defaultOpen={false}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={!editName.trim() || saveMut.isPending}>
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </PageShell>
  )
}
