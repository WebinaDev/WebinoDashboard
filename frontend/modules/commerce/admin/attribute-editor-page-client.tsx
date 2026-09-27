"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CircleDot,
  ImageIcon,
  ListChecks,
  Pencil,
  Plus,
  Square,
  Trash2,
  Type,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { useConfirm } from "@/components/ConfirmDialog"
import { MediaPickerField } from "@/components/content/MediaPickerField"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import { useEnumLabel } from "@/lib/enum-labels"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { cn } from "@/lib/utils"
import { slugFromName } from "@/lib/taxonomy-helpers"

type Attribute = {
  id: number
  name: string
  slug: string
  type: string
  order_by?: string
  has_archives?: boolean
  show_swatch_label?: boolean
}

type Term = {
  id: number
  name: string
  slug: string
  description?: string | null
  menu_order?: number
  color?: string | null
  image_url?: string | null
}

const ATTR_TYPES = ["select", "color", "image", "button", "text"] as const
const ORDER_BY = ["menu_order", "name", "name_num", "id"] as const

const TYPE_ICONS: Record<(typeof ATTR_TYPES)[number], typeof ListChecks> = {
  select: ListChecks,
  color: CircleDot,
  image: ImageIcon,
  button: Square,
  text: Type,
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

const emptyAttr = {
  name: "",
  slug: "",
  type: "select",
  order_by: "menu_order",
  has_archives: false,
  show_swatch_label: false,
}

const emptyTerm = {
  name: "",
  slug: "",
  description: "",
  menu_order: 0,
  color: "#000000",
  image_url: "",
}

function TermSwatch({ type, term }: { type: string; term: Term }) {
  if (type === "color" && term.color) {
    return (
      <span
        className="inline-block size-8 shrink-0 rounded-md border shadow-sm"
        style={{ backgroundColor: term.color }}
        title={term.color}
      />
    )
  }
  if (type === "image" && term.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={term.image_url} alt="" className="size-8 shrink-0 rounded-md border object-cover" />
    )
  }
  return null
}

export default function AttributeEditorPageClient({ route }: { route: ResolvedAdminRoute }) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const enumLabel = useEnumLabel()
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const attributeId = route.params?.attributeId
  const isNew = !attributeId || attributeId === "new"

  const [form, setForm] = useState(emptyAttr)
  const [termDialogOpen, setTermDialogOpen] = useState(false)
  const [editingTermId, setEditingTermId] = useState<number | null>(null)
  const [termForm, setTermForm] = useState(emptyTerm)
  const [termSlugTouched, setTermSlugTouched] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: attribute, isLoading } = useQuery({
    queryKey: ["admin-attribute", attributeId],
    enabled: !isNew,
    queryFn: () => api<Attribute>(`/api/v1/attributes/${attributeId}`),
  })

  const { data: terms = [], refetch: refetchTerms } = useQuery({
    queryKey: ["admin-attribute-terms", attributeId],
    enabled: !isNew,
    queryFn: () => api<Term[]>(`/api/v1/attributes/${attributeId}/terms`),
  })

  useEffect(() => {
    if (!attribute) return
    setForm({
      name: attribute.name ?? "",
      slug: attribute.slug ?? "",
      type: attribute.type ?? "select",
      order_by: attribute.order_by ?? "menu_order",
      has_archives: Boolean(attribute.has_archives),
      show_swatch_label: Boolean(attribute.show_swatch_label),
    })
  }, [attribute])

  const openNewTerm = () => {
    setEditingTermId(null)
    setTermForm(emptyTerm)
    setTermSlugTouched(false)
    setTermDialogOpen(true)
  }

  const openEditTerm = (term: Term) => {
    setEditingTermId(term.id)
    setTermForm({
      name: term.name ?? "",
      slug: term.slug ?? "",
      description: term.description ?? "",
      menu_order: term.menu_order ?? 0,
      color: term.color ?? "#000000",
      image_url: term.image_url ?? "",
    })
    setTermSlugTouched(true)
    setTermDialogOpen(true)
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        slug: form.slug || undefined,
        type: form.type,
        order_by: form.order_by,
        has_archives: form.has_archives,
        show_swatch_label: form.show_swatch_label,
      }
      if (isNew) return api<Attribute>("/api/v1/attributes", { method: "POST", json: payload })
      return api<Attribute>(`/api/v1/attributes/${attributeId}`, { method: "PATCH", json: payload })
    },
    onSuccess: async (row) => {
      setMessage(t("saved"))
      await queryClient.invalidateQueries({ queryKey: ["admin-attributes"] })
      if (isNew && row?.id) window.location.assign(`/dashboard/attributes/${row.id}`)
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const saveTerm = useMutation({
    mutationFn: () => {
      const payload = {
        name: termForm.name,
        slug: termForm.slug || undefined,
        description: termForm.description || null,
        menu_order: Number(termForm.menu_order) || 0,
        color: form.type === "color" ? termForm.color || null : null,
        image_url: form.type === "image" ? termForm.image_url || null : null,
      }
      if (editingTermId) {
        return api<Term>(`/api/v1/attribute-terms/${editingTermId}`, { method: "PATCH", json: payload })
      }
      return api<Term>(`/api/v1/attributes/${attributeId}/terms`, { method: "POST", json: payload })
    },
    onSuccess: async () => {
      setTermDialogOpen(false)
      setTermForm(emptyTerm)
      await refetchTerms()
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const deleteTerm = useMutation({
    mutationFn: (id: number) => api(`/api/v1/attribute-terms/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refetchTerms()
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6" dir="auto">
      <div>
        <h1 className="text-2xl font-bold">{isNew ? t("new_attribute") : t("edit_attribute")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!isNew && isLoading ? (
        <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("attribute_details")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>{t("name")}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>{t("slug")}</Label>
              <Input
                value={form.slug}
                dir="ltr"
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("attr_type")}</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ATTR_TYPES.map((type) => {
                  const Icon = TYPE_ICONS[type]
                  const active = form.type === type
                  return (
                    <button
                      key={type}
                      type="button"
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-xl border p-3 text-sm transition-colors",
                        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
                      )}
                      onClick={() => setForm((f) => ({ ...f, type }))}
                    >
                      <Icon className="size-5" />
                      <span>{enumLabel("attribute_type", type)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <Label>{t("attr_order_by")}</Label>
              <select
                className={selectClass}
                value={form.order_by}
                onChange={(e) => setForm((f) => ({ ...f, order_by: e.target.value }))}
              >
                {ORDER_BY.map((key) => (
                  <option key={key} value={key}>
                    {enumLabel("attribute_order_by", key)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.has_archives}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, has_archives: Boolean(v) }))}
                />
                {t("has_archives")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.show_swatch_label}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, show_swatch_label: Boolean(v) }))}
                />
                {t("show_swatch_label")}
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
                {tCommon("save")}
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard/attributes">{tCommon("cancel")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isNew ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>{t("terms_heading")}</CardTitle>
            <Button size="sm" onClick={openNewTerm}>
              <Plus className="size-4" />
              {t("add_term")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {terms.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("empty_terms")}</p>
            ) : (
              <ul className="space-y-2">
                {terms.map((term) => (
                  <li key={term.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      {(form.type === "color" || form.type === "image") && (
                        <TermSwatch type={form.type} term={term} />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">{term.name}</p>
                        <p className="text-muted-foreground truncate text-xs" dir="ltr">
                          {term.slug}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditTerm(term)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => confirm({ onConfirm: () => deleteTerm.mutateAsync(term.id) })}
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
      ) : null}

      <Dialog open={termDialogOpen} onOpenChange={setTermDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTermId ? t("edit_term") : t("add_term")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("name")}</Label>
              <Input
                value={termForm.name}
                onChange={(e) => setTermForm((f) => ({ ...f, name: e.target.value }))}
                onBlur={() => {
                  if (!termSlugTouched && termForm.name.trim()) {
                    setTermForm((f) => ({ ...f, slug: slugFromName(f.name) }))
                  }
                }}
              />
            </div>
            <div>
              <Label>{t("slug")}</Label>
              <Input
                value={termForm.slug}
                dir="ltr"
                onChange={(e) => {
                  setTermSlugTouched(true)
                  setTermForm((f) => ({ ...f, slug: e.target.value }))
                }}
              />
            </div>
            {form.type === "color" ? (
              <div className="space-y-2">
                <Label>{t("color")}</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="color"
                    className="h-10 w-14 cursor-pointer p-1"
                    value={termForm.color || "#000000"}
                    onChange={(e) => setTermForm((f) => ({ ...f, color: e.target.value }))}
                  />
                  <Input
                    value={termForm.color}
                    dir="ltr"
                    onChange={(e) => setTermForm((f) => ({ ...f, color: e.target.value }))}
                  />
                </div>
                <TermSwatch type="color" term={{ ...termForm, id: 0, slug: "" }} />
              </div>
            ) : null}
            {form.type === "image" ? (
              <MediaPickerField
                label={t("swatch_image")}
                imageUrl={termForm.image_url}
                onPick={(item) => setTermForm((f) => ({ ...f, image_url: item.url }))}
                onClear={() => setTermForm((f) => ({ ...f, image_url: "" }))}
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTermDialogOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={() => saveTerm.mutate()} disabled={!termForm.name || saveTerm.isPending}>
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  )
}
