"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import type { CafeVenueSettings } from "@/themes/cafe-starter/types"
import { api } from "@/lib/api"

const defaults: CafeVenueSettings = {
  tagline_fa: "",
  tagline_en: "",
  about_fa: "",
  about_en: "",
  phone: "",
  instagram: "",
  address_fa: "",
  address_en: "",
  map_url: "",
  mini_site_enabled: true,
}

export default function VenuePageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.venue")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["cafe-venue-settings"],
    queryFn: () => api<CafeVenueSettings>("/api/v1/cafe/venue-settings"),
  })

  const [form, setForm] = useState<CafeVenueSettings | null>(null)
  const values = form ?? data ?? defaults

  const save = useMutation({
    mutationFn: () => api<CafeVenueSettings>("/api/v1/cafe/venue-settings", { method: "PATCH", json: values }),
    onSuccess: async () => {
      setMessage(t("saved"))
      await queryClient.invalidateQueries({ queryKey: ["cafe-venue-settings"] })
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
        <CardHeader><CardTitle>{t("profile_heading")}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{t("tagline_fa")}</Label>
            <Input value={values.tagline_fa ?? ""} onChange={(e) => setForm({ ...values, tagline_fa: e.target.value })} />
          </div>
          <div>
            <Label>{t("tagline_en")}</Label>
            <Input value={values.tagline_en ?? ""} onChange={(e) => setForm({ ...values, tagline_en: e.target.value })} />
          </div>
          <div>
            <Label>{t("about_fa")}</Label>
            <Textarea value={values.about_fa ?? ""} onChange={(e) => setForm({ ...values, about_fa: e.target.value })} />
          </div>
          <div>
            <Label>{t("about_en")}</Label>
            <Textarea value={values.about_en ?? ""} onChange={(e) => setForm({ ...values, about_en: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("contact_heading")}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{t("phone")}</Label>
            <Input value={values.phone ?? ""} onChange={(e) => setForm({ ...values, phone: e.target.value })} />
          </div>
          <div>
            <Label>{t("instagram")}</Label>
            <Input value={values.instagram ?? ""} onChange={(e) => setForm({ ...values, instagram: e.target.value })} />
          </div>
          <div>
            <Label>{t("address_fa")}</Label>
            <Textarea value={values.address_fa ?? ""} onChange={(e) => setForm({ ...values, address_fa: e.target.value })} />
          </div>
          <div>
            <Label>{t("address_en")}</Label>
            <Textarea value={values.address_en ?? ""} onChange={(e) => setForm({ ...values, address_en: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>{t("map_url")}</Label>
            <Input value={values.map_url ?? ""} onChange={(e) => setForm({ ...values, map_url: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox checked={values.mini_site_enabled !== false} onCheckedChange={(v) => setForm({ ...values, mini_site_enabled: Boolean(v) })} />
            {t("mini_site_enabled")}
          </label>
        </CardContent>
      </Card>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>{tCommon("save")}</Button>
    </div>
  )
}
