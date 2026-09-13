"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

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
  color: "",
  image_url: "",
}

export default function AttributeEditorPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const attributeId = route.params?.attributeId
  const isNew = !attributeId || attributeId === "new"

  const [form, setForm] = useState(emptyAttr)
  const [termForm, setTermForm] = useState(emptyTerm)
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
      if (isNew && row?.id) window.location.assign(`/admin/attributes/${row.id}`)
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const addTerm = useMutation({
    mutationFn: () =>
      api<Term>(`/api/v1/attributes/${attributeId}/terms`, {
        method: "POST",
        json: {
          name: termForm.name,
          slug: termForm.slug || undefined,
          description: termForm.description || null,
          menu_order: Number(termForm.menu_order) || 0,
          color: termForm.color || null,
          image_url: termForm.image_url || null,
        },
      }),
    onSuccess: async () => {
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
              <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
            </div>
            <div>
              <Label>{t("attr_type")}</Label>
              <select
                className={selectClass}
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                {ATTR_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
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
                <Link href="/admin/attributes">{tCommon("cancel")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isNew ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("terms_heading")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {terms.map((term) => (
                <li key={term.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{term.name}</p>
                    <p className="text-muted-foreground text-xs">{term.slug}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => deleteTerm.mutate(term.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label>{t("name")}</Label>
                <Input
                  value={termForm.name}
                  onChange={(e) => setTermForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t("slug")}</Label>
                <Input
                  value={termForm.slug}
                  onChange={(e) => setTermForm((f) => ({ ...f, slug: e.target.value }))}
                />
              </div>
              {(form.type === "color" || form.type === "image") && (
                <>
                  {form.type === "color" ? (
                    <div>
                      <Label>{t("color")}</Label>
                      <Input
                        value={termForm.color}
                        onChange={(e) => setTermForm((f) => ({ ...f, color: e.target.value }))}
                      />
                    </div>
                  ) : null}
                  {form.type === "image" ? (
                    <div>
                      <Label>{t("image_url")}</Label>
                      <Input
                        value={termForm.image_url}
                        onChange={(e) => setTermForm((f) => ({ ...f, image_url: e.target.value }))}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </div>
            <Button onClick={() => addTerm.mutate()} disabled={!termForm.name || addTerm.isPending}>
              <Plus className="size-4" />
              {t("add_term")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
