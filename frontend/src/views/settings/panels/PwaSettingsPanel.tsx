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
import { Switch } from "@/components/ui/switch"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

type PwaPayload = {
  enabled?: boolean
  name?: string
  short_name?: string
  description?: string
  theme_color?: string
  background_color?: string
  display?: string
  orientation?: string
  icon_source?: "site" | "custom"
  icon_url?: string
  show_install_banner?: boolean
  splash_enabled?: boolean
  resolved_name?: string
  resolved_short_name?: string
  site_icon_url?: string
}

export function PwaSettingsPanel() {
  const t = useTranslations("settings_hub.pwa")
  const tHub = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } =
    useDraftSettings<PwaPayload>("site", "pwa")

  if (loading || !draft) {
    return <p className="text-muted-foreground text-sm">{tHub("loading")}</p>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex max-w-lg items-center justify-between gap-3">
            <div>
              <Label>{t("enabled")}</Label>
              <p className="text-muted-foreground text-xs">{t("enabledHint")}</p>
            </div>
            <Switch
              checked={draft.enabled !== false}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">{t("identityTitle")}</h3>
            <p className="text-muted-foreground text-xs">{t("identityHint")}</p>
            <div className="grid max-w-lg gap-3">
              <Label>{t("fieldName")}</Label>
              <Input
                value={draft.name ?? ""}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder={draft.resolved_name ?? t("nameAutoHint")}
              />
              <Label>{t("fieldShortName")}</Label>
              <Input
                value={draft.short_name ?? ""}
                onChange={(e) => setDraft({ ...draft, short_name: e.target.value })}
                placeholder={draft.resolved_short_name ?? t("shortNameDefault")}
              />
              <Label>{t("fieldDescription")}</Label>
              <Input
                value={draft.description ?? ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder={t("descriptionAutoHint")}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">{t("appearanceTitle")}</h3>
            <p className="text-muted-foreground text-xs">{t("appearanceHint")}</p>
            <div className="grid max-w-lg gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t("fieldThemeColor")}</Label>
                <Input
                  type="color"
                  value={draft.theme_color ?? "#0f172a"}
                  onChange={(e) => setDraft({ ...draft, theme_color: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("fieldBackgroundColor")}</Label>
                <Input
                  type="color"
                  value={draft.background_color ?? "#ffffff"}
                  onChange={(e) => setDraft({ ...draft, background_color: e.target.value })}
                />
              </div>
            </div>
            <div className="grid max-w-lg gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t("fieldDisplay")}</Label>
                <Select
                  value={draft.display ?? "standalone"}
                  onValueChange={(v) => setDraft({ ...draft, display: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standalone">{t("displayStandalone")}</SelectItem>
                    <SelectItem value="fullscreen">{t("displayFullscreen")}</SelectItem>
                    <SelectItem value="minimal-ui">{t("displayMinimal")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>{t("fieldOrientation")}</Label>
                <Select
                  value={draft.orientation ?? "any"}
                  onValueChange={(v) => setDraft({ ...draft, orientation: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">{t("orientationAny")}</SelectItem>
                    <SelectItem value="portrait">{t("orientationPortrait")}</SelectItem>
                    <SelectItem value="landscape">{t("orientationLandscape")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid max-w-lg gap-3">
              <Label>{t("fieldIcon")}</Label>
              <Select
                value={draft.icon_source ?? "site"}
                onValueChange={(v) =>
                  setDraft({ ...draft, icon_source: v as "site" | "custom" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="site">{t("iconSite")}</SelectItem>
                  <SelectItem value="custom">{t("iconCustom")}</SelectItem>
                </SelectContent>
              </Select>
              {draft.icon_source === "site" ? (
                <p className="text-muted-foreground text-xs">{t("iconSiteHint")}</p>
              ) : (
                <>
                  <p className="text-muted-foreground text-xs">{t("iconCustomHint")}</p>
                  <Input
                    dir="ltr"
                    value={draft.icon_url ?? ""}
                    onChange={(e) => setDraft({ ...draft, icon_url: e.target.value })}
                    placeholder={draft.site_icon_url ?? "https://…"}
                  />
                </>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">{t("behaviorTitle")}</h3>
            <div className="flex max-w-lg items-center justify-between gap-3">
              <div>
                <Label>{t("showInstallBanner")}</Label>
                <p className="text-muted-foreground text-xs">{t("showInstallBannerHint")}</p>
              </div>
              <Switch
                checked={draft.show_install_banner !== false}
                onCheckedChange={(v) => setDraft({ ...draft, show_install_banner: v })}
              />
            </div>
            <div className="flex max-w-lg items-center justify-between gap-3">
              <div>
                <Label>{t("splashEnabled")}</Label>
                <p className="text-muted-foreground text-xs">{t("splashEnabledHint")}</p>
              </div>
              <Switch
                checked={draft.splash_enabled !== false}
                onCheckedChange={(v) => setDraft({ ...draft, splash_enabled: v })}
              />
            </div>
            <p className="text-muted-foreground text-xs">{t("reloadHint")}</p>
          </div>

          <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
        </CardContent>
      </Card>
    </div>
  )
}
