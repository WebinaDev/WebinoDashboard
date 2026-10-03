"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"

type Option = { name_fa: string; name_en: string; price_minor: number }
type Modifier = {
  id: number
  name_fa: string
  name_en: string
  is_required: boolean
  max_select: number
  options: Option[]
}
type Allergen = { id: number; name_fa: string; name_en: string }

export function ModifierEditor({ productId }: { productId: number }) {
  const t = useTranslations("cafe_admin.menu")
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name_fa: "", name_en: "", is_required: false, max_select: 1, options: "سس,Sauce,0" })

  const { data: modifiers = [] } = useQuery({
    queryKey: ["modifiers", productId],
    queryFn: () => api<Modifier[]>(`/api/v1/products/${productId}/modifiers`),
  })
  const { data: allergens = [] } = useQuery({
    queryKey: ["allergens"],
    queryFn: () => api<Allergen[]>("/api/v1/allergens"),
  })
  const [picked, setPicked] = useState<number[]>([])

  const save = useMutation({
    mutationFn: () => {
      const options = form.options
        .split("\n")
        .map((row) => row.split(",").map((part) => part.trim()))
        .filter((parts) => parts[0] && parts[1])
        .map(([name_fa, name_en, price]) => ({ name_fa, name_en, price_minor: Number(price || 0) }))
      return api(`/api/v1/products/${productId}/modifiers`, {
        method: "POST",
        json: {
          name_fa: form.name_fa,
          name_en: form.name_en,
          is_required: form.is_required,
          max_select: Number(form.max_select) || 1,
          options,
        },
      })
    },
    onSuccess: async () => {
      setForm({ name_fa: "", name_en: "", is_required: false, max_select: 1, options: "" })
      await queryClient.invalidateQueries({ queryKey: ["modifiers", productId] })
    },
  })

  const syncAllergens = useMutation({
    mutationFn: () => api(`/api/v1/products/${productId}/allergens`, { method: "PUT", json: { allergen_ids: picked } }),
  })

  return (
    <Card>
      <CardHeader><CardTitle>{t("modifiers_heading")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div><Label>{t("modifier_name_fa")}</Label><Input value={form.name_fa} onChange={(e) => setForm({ ...form, name_fa: e.target.value })} /></div>
          <div><Label>{t("modifier_name_en")}</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
          <div className="sm:col-span-2">
            <Label>{t("modifier_options_hint")}</Label>
            <textarea className="border-input mt-1 min-h-20 w-full rounded-md border p-2 text-sm" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.is_required} onCheckedChange={(v) => setForm({ ...form, is_required: Boolean(v) })} />{t("modifier_required")}</label>
          <Button onClick={() => save.mutate()} disabled={!form.name_fa || !form.name_en || save.isPending}>{t("add_modifier")}</Button>
        </div>
        <ul className="space-y-2 text-sm">
          {modifiers.map((mod) => (
            <li key={mod.id} className="flex items-center justify-between rounded-lg border p-2">
              <span>{mod.name_fa} · {mod.options?.map((o) => o.name_fa).join("، ")}</span>
              <Button size="sm" variant="ghost" onClick={() => api(`/api/v1/modifiers/${mod.id}`, { method: "DELETE" }).then(() => queryClient.invalidateQueries({ queryKey: ["modifiers", productId] }))}>{t("remove")}</Button>
            </li>
          ))}
        </ul>
        {allergens.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("allergens_heading")}</p>
            <div className="flex flex-wrap gap-2">
              {allergens.map((a) => (
                <label key={a.id} className="flex items-center gap-1 text-xs">
                  <Checkbox checked={picked.includes(a.id)} onCheckedChange={(v) => setPicked((cur) => v ? [...cur, a.id] : cur.filter((id) => id !== a.id))} />
                  {a.name_fa}
                </label>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => syncAllergens.mutate()}>{t("save_allergens")}</Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
