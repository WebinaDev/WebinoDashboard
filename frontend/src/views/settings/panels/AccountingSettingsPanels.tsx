"use client"

import { useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

export function AccountingTaxPanel() {
  const t = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } = useDraftSettings<{
    prices_include_tax?: boolean
    tax_rate_percent?: number
    display_prices?: string
  }>("shop", "accounting", "tax")

  if (loading || !draft) return <p className="text-muted-foreground text-sm">{t("loading")}</p>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("accounting.tax")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("accounting.prices_include_tax")}</Label>
            <Switch
              checked={Boolean(draft.prices_include_tax)}
              onCheckedChange={(v) => setDraft({ ...draft, prices_include_tax: v })}
            />
          </div>
          <div className="grid max-w-xs gap-2">
            <Label>{t("accounting.tax_rate")}</Label>
            <Input
              type="number"
              value={Number(draft.tax_rate_percent ?? 9)}
              onChange={(e) => setDraft({ ...draft, tax_rate_percent: Number(e.target.value) })}
            />
          </div>
          <div className="grid max-w-xs gap-2">
            <Label>{t("accounting.display_prices")}</Label>
            <Select
              value={draft.display_prices ?? "excl"}
              onValueChange={(v) => setDraft({ ...draft, display_prices: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excl">{t("accounting.excl")}</SelectItem>
                <SelectItem value="incl">{t("accounting.incl")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}

export function AccountingModianPanel() {
  const t = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } = useDraftSettings<{
    enabled?: boolean
    economic_code?: string
    national_id?: string
    api_key?: string
    sandbox?: boolean
  }>("shop", "accounting", "modian")

  if (loading || !draft) return <p className="text-muted-foreground text-sm">{t("loading")}</p>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("accounting.modian")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("accounting.modian_enabled")}</Label>
            <Switch
              checked={Boolean(draft.enabled)}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("accounting.economic_code")}</Label>
            <Input
              value={draft.economic_code ?? ""}
              onChange={(e) => setDraft({ ...draft, economic_code: e.target.value })}
              dir="ltr"
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("accounting.national_id")}</Label>
            <Input
              value={draft.national_id ?? ""}
              onChange={(e) => setDraft({ ...draft, national_id: e.target.value })}
              dir="ltr"
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("accounting.api_key")}</Label>
            <Input
              type="password"
              value={draft.api_key ?? ""}
              onChange={(e) => setDraft({ ...draft, api_key: e.target.value })}
              dir="ltr"
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("accounting.sandbox")}</Label>
            <Switch
              checked={Boolean(draft.sandbox)}
              onCheckedChange={(v) => setDraft({ ...draft, sandbox: v })}
            />
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
