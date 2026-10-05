"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { SettingsSaveBar } from "@/views/settings/use-tenant-settings"

type Appearance = Record<string, string | boolean | number>

const COLOR_KEYS = [
  "primary_color",
  "accent_color",
  "navy_color",
  "surface_color",
  "header_bg",
  "footer_bg",
  "border_color",
] as const

const TEXT_KEYS = ["header_style", "product_card_style", "pdp_gallery_style", "top_bar_text"] as const
const BOOL_KEYS = [
  "mega_menu",
  "dark_mode_default",
  "show_top_bar",
  "sticky_add_to_cart",
  "show_installment_badge",
] as const

const COLOR_FALLBACKS: Record<(typeof COLOR_KEYS)[number], string> = {
  primary_color: "#e775ae",
  accent_color: "#dc5f9d",
  navy_color: "#021959",
  surface_color: "#f3f5f8",
  header_bg: "#ffffff",
  footer_bg: "#ffffff",
  border_color: "#e8edf3",
}

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
      const res = await api<{ data: Appearance }>("/api/v1/shop/storefront-appearance", { method: "PUT", json: draft })
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
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-xl gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {COLOR_KEYS.map((key) => (
              <label key={key} className="grid gap-1">
                <span className="text-xs font-medium">{t(key)}</span>
                <Input
                  type="color"
                  dir="ltr"
                  value={String(draft[key] ?? COLOR_FALLBACKS[key])}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          {TEXT_KEYS.map((key) => (
            <div key={key} className="grid gap-1">
              <Label>{t(key)}</Label>
              <Input value={String(draft[key] ?? "")} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
            </div>
          ))}
          {BOOL_KEYS.map((key) => (
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
