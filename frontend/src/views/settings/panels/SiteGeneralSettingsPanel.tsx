"use client"

import { useTranslations } from "next-intl"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

type Payload = {
  site_title?: string
  tagline?: string
  admin_email?: string
  timezone?: string
}

export function SiteGeneralSettingsPanel() {
  const t = useTranslations("settings_hub.site_general")
  const tHub = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } =
    useDraftSettings<Payload>("site", "general")

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
        <CardContent className="grid max-w-lg gap-3">
          <div className="grid gap-1">
            <Label>{t("site_title")}</Label>
            <Input
              value={draft.site_title ?? ""}
              onChange={(e) => setDraft({ ...draft, site_title: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label>{t("tagline")}</Label>
            <Input
              value={draft.tagline ?? ""}
              onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label>{t("admin_email")}</Label>
            <Input
              type="email"
              dir="ltr"
              value={draft.admin_email ?? ""}
              onChange={(e) => setDraft({ ...draft, admin_email: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label>{t("timezone")}</Label>
            <Input
              dir="ltr"
              value={draft.timezone ?? "Asia/Tehran"}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
