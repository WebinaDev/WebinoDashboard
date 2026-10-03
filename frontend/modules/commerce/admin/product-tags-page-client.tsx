"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"

import { useConfirm } from "@/components/ConfirmDialog"
import { QueryErrorState } from "@/components/QueryErrorState"
import { ScrollTable } from "@/components/ScrollTable"
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
import { slugFromName } from "@/lib/taxonomy-helpers"

type ProductTag = {
  id: number
  name: string
  slug: string
  products_count?: number
}

export default function ProductTagsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const locale = normalizeUiLocale(useLocale())
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [status, setStatus] = useState("")

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

  const openCreate = () => {
    setEditId(null)
    setName("")
    setSlug("")
    setSlugTouched(false)
    setDialogOpen(true)
  }

  const openEdit = (tag: ProductTag) => {
    setEditId(tag.id)
    setName(tag.name)
    setSlug(tag.slug)
    setSlugTouched(true)
    setDialogOpen(true)
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), slug: slug.trim() || undefined }
      if (editId) return api<ProductTag>(`/api/v1/product-tags/${editId}`, { method: "PATCH", json: payload })
      return api<ProductTag>("/api/v1/product-tags", { method: "POST", json: payload })
    },
    onSuccess: async () => {
      setDialogOpen(false)
      await queryClient.invalidateQueries({ queryKey: ["admin-product-tags"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/v1/product-tags/${id}${status === "trash" ? "?force=1" : ""}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-product-tags"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <div className="space-y-6 p-6" dir="auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("product_tags_title")}</h1>
        </div>
        <div className="flex gap-2">
        <Button type="button" variant={status === "trash" ? "default" : "outline"} onClick={() => setStatus((s) => (s === "trash" ? "" : "trash"))}>
          {status === "trash" ? t("show_active") : t("show_trash")}
        </Button>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          {t("add_product_tag")}
        </Button>
        </div>
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
                        {typeof tag.products_count === "number" ? formatNumber(tag.products_count, locale) : "—"}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? t("edit_product_tag") : t("add_product_tag")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("name")}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  if (!slugTouched && name.trim()) setSlug(slugFromName(name))
                }}
              />
            </div>
            <div>
              <Label>{t("slug")}</Label>
              <Input
                value={slug}
                dir="ltr"
                onChange={(e) => {
                  setSlugTouched(true)
                  setSlug(e.target.value)
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  )
}
