"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import type { CafeMenuSettings } from "@/themes/cafe-starter/types"
import { api } from "@/lib/api"

const defaults: CafeMenuSettings = {
  default_view: "grid",
  show_search: true,
  show_category_bar: true,
  show_new_badge: true,
  header_cta_label_fa: "",
  header_cta_label_en: "",
  header_cta_url: "",
  placeholder_logo_text_fa: "",
  placeholder_logo_text_en: "",
}

export default function MenuPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.menu")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["cafe-menu-settings"],
    queryFn: () => api<CafeMenuSettings>("/api/v1/cafe/menu-settings"),
  })

  const [form, setForm] = useState<CafeMenuSettings | null>(null)
  const values = form ?? data ?? defaults

  const save = useMutation({
    mutationFn: () => api<CafeMenuSettings>("/api/v1/cafe/menu-settings", { method: "PATCH", json: values }),
    onSuccess: async () => {
      setMessage(t("saved"))
      await queryClient.invalidateQueries({ queryKey: ["cafe-menu-settings"] })
    },
  })

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>

      {isLoading ? <p>{tCommon("loading")}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}

      <Card>
        <CardHeader><CardTitle>{t("display_heading")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t("default_view")}</Label>
            <select
              className="border-input bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={values.default_view}
              onChange={(e) => setForm({ ...values, default_view: e.target.value as "grid" | "list" })}
            >
              <option value="grid">{t("view_grid")}</option>
              <option value="list">{t("view_list")}</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={values.show_search} onCheckedChange={(v) => setForm({ ...values, show_search: Boolean(v) })} />
            {t("show_search")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={values.show_category_bar} onCheckedChange={(v) => setForm({ ...values, show_category_bar: Boolean(v) })} />
            {t("show_category_bar")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={values.show_new_badge} onCheckedChange={(v) => setForm({ ...values, show_new_badge: Boolean(v) })} />
            {t("show_new_badge")}
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("cta_heading")}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{t("cta_label_fa")}</Label>
            <Input value={values.header_cta_label_fa ?? ""} onChange={(e) => setForm({ ...values, header_cta_label_fa: e.target.value })} />
          </div>
          <div>
            <Label>{t("cta_label_en")}</Label>
            <Input value={values.header_cta_label_en ?? ""} onChange={(e) => setForm({ ...values, header_cta_label_en: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>{t("cta_url")}</Label>
            <Input value={values.header_cta_url ?? ""} onChange={(e) => setForm({ ...values, header_cta_url: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>{tCommon("save")}</Button>
    </div>
  )
}
