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
    enabled?: boolean
    rate_percent?: number
    tax_rate_percent?: number
    prices_include_tax?: boolean
    tax_based_on?: string
    round_at_subtotal?: boolean
    display_shop?: string
    display_cart?: string
    display_prices?: string
  }>("shop", "accounting", "tax")

  if (loading || !draft) return <p className="text-muted-foreground text-sm">{t("loading")}</p>

  const rate = Number(draft.rate_percent ?? draft.tax_rate_percent ?? 9)
  const displayShop = draft.display_shop ?? draft.display_prices ?? "excl"
  const displayCart = draft.display_cart ?? draft.display_prices ?? "excl"

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("accounting.tax")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("accounting.enabled")}</Label>
            <Switch
              checked={Boolean(draft.enabled ?? true)}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            />
          </div>
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
              value={rate}
              onChange={(e) => setDraft({ ...draft, rate_percent: Number(e.target.value) })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("accounting.tax_based_on")}</Label>
            <Select
              value={draft.tax_based_on ?? "shipping"}
              onValueChange={(v) => setDraft({ ...draft, tax_based_on: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shipping">{t("accounting.based_shipping")}</SelectItem>
                <SelectItem value="billing">{t("accounting.based_billing")}</SelectItem>
                <SelectItem value="base">{t("accounting.based_store")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("accounting.round_subtotal")}</Label>
            <Switch
              checked={Boolean(draft.round_at_subtotal)}
              onCheckedChange={(v) => setDraft({ ...draft, round_at_subtotal: v })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("accounting.display_shop")}</Label>
            <Select
              value={displayShop}
              onValueChange={(v) => setDraft({ ...draft, display_shop: v })}
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
          <div className="grid max-w-md gap-2">
            <Label>{t("accounting.display_cart")}</Label>
            <Select
              value={displayCart}
              onValueChange={(v) => setDraft({ ...draft, display_cart: v })}
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
