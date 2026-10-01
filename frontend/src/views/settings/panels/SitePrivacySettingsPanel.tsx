"use client"

import { useTranslations } from "next-intl"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

type Payload = {
  guest_checkout?: boolean
  account_creation?: boolean
  privacy_policy_page_id?: number | null
  terms_page_id?: number | null
}

export function SitePrivacySettingsPanel() {
  const t = useTranslations("settings_hub.site_privacy")
  const tHub = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } =
    useDraftSettings<Payload>("site", "privacy")

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
        <CardContent className="space-y-4">
          <div className="flex max-w-lg items-center justify-between gap-3">
            <div>
              <Label>{t("guest_checkout")}</Label>
              <p className="text-muted-foreground text-xs">{t("guest_checkout_hint")}</p>
            </div>
            <Switch
              checked={Boolean(draft.guest_checkout)}
              onCheckedChange={(v) => setDraft({ ...draft, guest_checkout: v })}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <div>
              <Label>{t("account_creation")}</Label>
              <p className="text-muted-foreground text-xs">{t("account_creation_hint")}</p>
            </div>
            <Switch
              checked={draft.account_creation !== false}
              onCheckedChange={(v) => setDraft({ ...draft, account_creation: v })}
            />
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
