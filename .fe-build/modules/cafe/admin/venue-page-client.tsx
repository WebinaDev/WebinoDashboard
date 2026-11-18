"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import type { CafeVenueSettings } from "@/themes/cafe-starter/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { CafeAdminShell, CafeSection } from "./cafe-admin-ui"

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
  whatsapp_url: "",
  telegram_url: "",
  bill_pay_url: "",
}

export default function VenuePageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.venue")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["cafe-venue-settings"],
    queryFn: () => api<CafeVenueSettings>("/api/v1/cafe/venue-settings"),
  })

  const [form, setForm] = useState<CafeVenueSettings | null>(null)
  const values = form ?? data ?? defaults

  const save = useMutation({
    mutationFn: () => api<CafeVenueSettings>("/api/v1/cafe/venue-settings", { method: "PATCH", json: values }),
    onSuccess: async () => {
      toast.success(t("saved"))
      await queryClient.invalidateQueries({ queryKey: ["cafe-venue-settings"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  return (
    <CafeAdminShell
      title={t("title")}
      description={t("description")}
      actions={
        <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
          {tCommon("save")}
        </Button>
      }
    >
      {isLoading ? <p className="text-muted-foreground text-sm">{tCommon("loading")}</p> : null}

      <CafeSection title={t("profile_heading")} description={t("profile_hint")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("tagline_fa")}</Label>
            <Input value={values.tagline_fa ?? ""} onChange={(e) => setForm({ ...values, tagline_fa: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("tagline_en")}</Label>
            <Input value={values.tagline_en ?? ""} onChange={(e) => setForm({ ...values, tagline_en: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("about_fa")}</Label>
            <Textarea value={values.about_fa ?? ""} onChange={(e) => setForm({ ...values, about_fa: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("about_en")}</Label>
            <Textarea value={values.about_en ?? ""} onChange={(e) => setForm({ ...values, about_en: e.target.value })} />
          </div>
        </div>
      </CafeSection>

      <CafeSection title={t("contact_heading")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("phone")}</Label>
            <Input value={values.phone ?? ""} onChange={(e) => setForm({ ...values, phone: e.target.value })} dir="ltr" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("instagram")}</Label>
            <Input value={values.instagram ?? ""} onChange={(e) => setForm({ ...values, instagram: e.target.value })} dir="ltr" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("address_fa")}</Label>
            <Textarea value={values.address_fa ?? ""} onChange={(e) => setForm({ ...values, address_fa: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("address_en")}</Label>
            <Textarea value={values.address_en ?? ""} onChange={(e) => setForm({ ...values, address_en: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("map_url")}</Label>
            <Input value={values.map_url ?? ""} onChange={(e) => setForm({ ...values, map_url: e.target.value })} dir="ltr" />
          </div>
        </div>
      </CafeSection>

      <CafeSection title={t("links_heading")} description={t("links_hint")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("whatsapp_url")}</Label>
            <Input value={values.whatsapp_url ?? ""} onChange={(e) => setForm({ ...values, whatsapp_url: e.target.value })} dir="ltr" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("telegram_url")}</Label>
            <Input value={values.telegram_url ?? ""} onChange={(e) => setForm({ ...values, telegram_url: e.target.value })} dir="ltr" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("bill_pay_url")}</Label>
            <Input value={values.bill_pay_url ?? ""} onChange={(e) => setForm({ ...values, bill_pay_url: e.target.value })} dir="ltr" />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox
              checked={values.mini_site_enabled !== false}
              onCheckedChange={(v) => setForm({ ...values, mini_site_enabled: Boolean(v) })}
            />
            {t("mini_site_enabled")}
          </label>
        </div>
      </CafeSection>
    </CafeAdminShell>
  )
}
