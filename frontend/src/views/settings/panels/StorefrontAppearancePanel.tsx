"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { SettingsSaveBar } from "@/views/settings/use-tenant-settings"

type Appearance = Record<string, string | boolean | number>

export function StorefrontAppearancePanel() {
  const t = useTranslations("settings_hub.storefront_appearance")
  const [draft, setDraft] = useState<Appearance | null>(null)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ data: Appearance }>("/api/v1/shop/storefront-appearance")
      .then((res) => setDraft(res.data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "error"))
  }, [])

  async function save() {
    if (!draft) return
    setPending(true)
    try {
      const res = await api<{ data: Appearance }>("/api/v1/shop/storefront-appearance", { method: "PUT", body: draft })
      setDraft(res.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "error")
    } finally {
      setPending(false)
    }
  }

  if (!draft) return <p className="text-muted-foreground text-sm">{t("loading")}</p>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-xl gap-3">
          {(["primary_color", "accent_color", "header_style", "product_card_style", "pdp_gallery_style", "top_bar_text"] as const).map((key) => (
            <div key={key} className="grid gap-1">
              <Label>{t(key)}</Label>
              <Input value={String(draft[key] ?? "")} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
            </div>
          ))}
          {(["mega_menu", "dark_mode_default", "show_top_bar", "sticky_add_to_cart", "show_installment_badge"] as const).map((key) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <Label>{t(key)}</Label>
              <Switch checked={Boolean(draft[key])} onCheckedChange={(v) => setDraft({ ...draft, [key]: v })} />
            </div>
          ))}
          <div className="grid gap-1">
            <Label>{t("footer_columns")}</Label>
            <Input
              type="number"
              dir="ltr"
              value={Number(draft.footer_columns ?? 4)}
              onChange={(e) => setDraft({ ...draft, footer_columns: Number(e.target.value) })}
            />
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void save()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
