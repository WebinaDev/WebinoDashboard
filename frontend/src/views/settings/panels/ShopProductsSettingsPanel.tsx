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

export type ShopProductsPayload = {
  manage_stock?: boolean
  hold_stock_minutes?: number | null
  notify_low_stock?: boolean
  notify_no_stock?: boolean
  stock_email_recipient?: string
  low_stock_threshold?: number
  no_stock_threshold?: number
  hide_out_of_stock?: boolean
  stock_format?: string
}

export function ShopProductsSettingsPanel() {
  const t = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } =
    useDraftSettings<ShopProductsPayload>("shop", "products")

  if (loading || !draft) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("shop_products.inventory")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shop_products.manage_stock")}</Label>
            <Switch
              checked={Boolean(draft.manage_stock)}
              onCheckedChange={(v) => setDraft({ ...draft, manage_stock: v })}
            />
          </div>
          <div className="grid max-w-xs gap-2">
            <Label>{t("shop_products.hold_stock")}</Label>
            <Input
              type="number"
              min={0}
              placeholder={t("shop_products.hold_stock_off")}
              value={draft.hold_stock_minutes ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  hold_stock_minutes: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shop_products.notify_low")}</Label>
            <Switch
              checked={Boolean(draft.notify_low_stock)}
              onCheckedChange={(v) => setDraft({ ...draft, notify_low_stock: v })}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shop_products.notify_no")}</Label>
            <Switch
              checked={Boolean(draft.notify_no_stock)}
              onCheckedChange={(v) => setDraft({ ...draft, notify_no_stock: v })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("shop_products.email_recipient")}</Label>
            <Input
              dir="ltr"
              type="email"
              value={draft.stock_email_recipient ?? ""}
              onChange={(e) => setDraft({ ...draft, stock_email_recipient: e.target.value })}
            />
          </div>
          <div className="grid max-w-md gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("shop_products.low_threshold")}</Label>
              <Input
                type="number"
                min={0}
                value={Number(draft.low_stock_threshold ?? 2)}
                onChange={(e) =>
                  setDraft({ ...draft, low_stock_threshold: Number(e.target.value) })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("shop_products.no_threshold")}</Label>
              <Input
                type="number"
                min={0}
                value={Number(draft.no_stock_threshold ?? 0)}
                onChange={(e) =>
                  setDraft({ ...draft, no_stock_threshold: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shop_products.hide_oos")}</Label>
            <Switch
              checked={Boolean(draft.hide_out_of_stock)}
              onCheckedChange={(v) => setDraft({ ...draft, hide_out_of_stock: v })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("shop_products.stock_format")}</Label>
            <Select
              value={draft.stock_format === "" ? "hidden" : (draft.stock_format ?? "low_amount")}
              onValueChange={(v) =>
                setDraft({ ...draft, stock_format: v === "hidden" ? "" : v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hidden">{t("shop_products.format_hidden")}</SelectItem>
                <SelectItem value="always">{t("shop_products.format_always")}</SelectItem>
                <SelectItem value="low_amount">{t("shop_products.format_low")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
