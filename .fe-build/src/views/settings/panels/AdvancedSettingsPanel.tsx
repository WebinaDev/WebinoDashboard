"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/lib/api"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

type CmsPage = { id: number; title: string; slug: string }

type AdvancedPayload = {
  cart_page_id?: number | null
  checkout_page_id?: number | null
  myaccount_page_id?: number | null
  terms_page_id?: number | null
  force_ssl_checkout?: boolean
  debug_mode?: boolean
  debug_log_enabled?: boolean
}

function PageSelect({
  label,
  value,
  pages,
  noneLabel,
  onChange,
}: {
  label: string
  value: number | null | undefined
  pages: CmsPage[]
  noneLabel: string
  onChange: (id: number | null) => void
}) {
  return (
    <div className="grid max-w-md gap-2">
      <Label>{label}</Label>
      <Select
        value={value != null ? String(value) : "none"}
        onValueChange={(v) => onChange(v === "none" ? null : Number(v))}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{noneLabel}</SelectItem>
          {pages.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function AdvancedSettingsPanel() {
  const t = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } =
    useDraftSettings<AdvancedPayload>("shop", "advanced")
  const [pages, setPages] = useState<CmsPage[]>([])

  useEffect(() => {
    api<CmsPage[]>("/api/v1/cms/pages")
      .then((list) => setPages(Array.isArray(list) ? list : []))
      .catch(() => setPages([]))
  }, [])

  if (loading || !draft) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("advanced.pages")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PageSelect
            label={t("advanced.cart_page")}
            value={draft.cart_page_id}
            pages={pages}
            noneLabel={t("shop_general.page_none")}
            onChange={(id) => setDraft({ ...draft, cart_page_id: id })}
          />
          <PageSelect
            label={t("advanced.checkout_page")}
            value={draft.checkout_page_id}
            pages={pages}
            noneLabel={t("shop_general.page_none")}
            onChange={(id) => setDraft({ ...draft, checkout_page_id: id })}
          />
          <PageSelect
            label={t("advanced.myaccount_page")}
            value={draft.myaccount_page_id}
            pages={pages}
            noneLabel={t("shop_general.page_none")}
            onChange={(id) => setDraft({ ...draft, myaccount_page_id: id })}
          />
          <PageSelect
            label={t("advanced.terms_page")}
            value={draft.terms_page_id}
            pages={pages}
            noneLabel={t("shop_general.page_none")}
            onChange={(id) => setDraft({ ...draft, terms_page_id: id })}
          />
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("advanced.force_ssl")}</Label>
            <Switch
              checked={Boolean(draft.force_ssl_checkout)}
              onCheckedChange={(v) => setDraft({ ...draft, force_ssl_checkout: v })}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("advanced.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("advanced.debug")}</Label>
            <Switch
              checked={Boolean(draft.debug_mode)}
              onCheckedChange={(v) => setDraft({ ...draft, debug_mode: v })}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("advanced.debug_log")}</Label>
            <Switch
              checked={Boolean(draft.debug_log_enabled)}
              onCheckedChange={(v) => setDraft({ ...draft, debug_log_enabled: v })}
            />
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
