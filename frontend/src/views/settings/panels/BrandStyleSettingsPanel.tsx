"use client"

import { useTranslations } from "next-intl"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

type Palette = Record<string, string>

type Payload = {
  accent?: string
  font?: string
  font_body?: string
  font_heading?: string
  font_ui?: string
  logo_url?: string | null
  logo_dark_url?: string | null
  favicon_url?: string | null
  logo_id?: number | null
  logo_dark_id?: number | null
  favicon_id?: number | null
  palette?: Palette
  geo_notice_colors?: Palette
}

const PALETTE_KEYS = ["primary", "secondary", "accent", "bg", "surface", "text", "muted", "navy", "header", "footer", "border"] as const
const PALETTE_FALLBACKS: Record<(typeof PALETTE_KEYS)[number], string> = {
  primary: "#e775ae",
  secondary: "#021959",
  accent: "#dc5f9d",
  bg: "#ffffff",
  surface: "#f3f5f8",
  text: "#021959",
  muted: "#4d5e8a",
  navy: "#021959",
  header: "#ffffff",
  footer: "#ffffff",
  border: "#e8edf3",
}
const GEO_KEYS = ["bg", "border", "text", "icon", "button_bg", "button_text"] as const
const FONTS = ["yekan-bakh", "system", "vazirmatn", "iran-sans"] as const
const ACCENTS = ["zinc", "slate", "blue", "green", "rose", "orange"] as const

export function BrandStyleSettingsPanel() {
  const t = useTranslations("settings_hub.brand_style")
  const tHub = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } =
    useDraftSettings<Payload>("site", "style")

  if (loading || !draft) {
    return <p className="text-muted-foreground text-sm">{tHub("loading")}</p>
  }

  const palette = draft.palette ?? {}
  const geo = draft.geo_notice_colors ?? {}

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-lg gap-3">
          <div className="grid gap-1">
            <Label>{t("accent")}</Label>
            <Select
              value={draft.accent ?? "zinc"}
              onValueChange={(v) => setDraft({ ...draft, accent: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCENTS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(["font_body", "font_heading", "font_ui"] as const).map((key) => (
            <div key={key} className="grid gap-1">
              <Label>{t(key)}</Label>
              <Select
                value={(draft[key] as string) ?? draft.font ?? "yekan-bakh"}
                onValueChange={(v) => setDraft({ ...draft, [key]: v, font: key === "font_body" ? v : draft.font })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONTS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <div className="grid gap-1">
            <Label>{t("logo_id")}</Label>
            <Input
              type="number"
              dir="ltr"
              value={draft.logo_id ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  logo_id: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
            <p className="text-muted-foreground text-xs">{t("media_id_hint")}</p>
          </div>
          <div className="grid gap-1">
            <Label>{t("favicon_id")}</Label>
            <Input
              type="number"
              dir="ltr"
              value={draft.favicon_id ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  favicon_id: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("palette_title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {PALETTE_KEYS.map((key) => (
            <label key={key} className="grid gap-1">
              <span className="text-xs">{t(`palette.${key}`)}</span>
              <Input
                type="color"
                dir="ltr"
                value={palette[key] ?? PALETTE_FALLBACKS[key]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    palette: { ...palette, [key]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("geo_colors_title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {GEO_KEYS.map((key) => (
            <label key={key} className="grid gap-1">
              <span className="text-xs">{t(`geo.${key}`)}</span>
              <Input
                type="color"
                dir="ltr"
                value={geo[key] ?? "#000000"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    geo_notice_colors: { ...geo, [key]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </CardContent>
      </Card>

      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
