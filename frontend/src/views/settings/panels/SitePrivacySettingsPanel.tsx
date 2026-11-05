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
          <div className="grid max-w-lg gap-3 rounded-xl border p-3">
            <div>
              <Label>{t("guest_checkout")}</Label>
              <p className="text-muted-foreground text-xs">{t("guest_checkout_hint")}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className={`rounded-lg border px-3 py-2 text-sm ${!draft.guest_checkout ? "border-primary bg-primary/5 font-medium" : "border-input"}`}
                onClick={() => setDraft({ ...draft, guest_checkout: false })}
              >
                اجبار به ثبت‌نام / ورود
              </button>
              <button
                type="button"
                className={`rounded-lg border px-3 py-2 text-sm ${draft.guest_checkout ? "border-primary bg-primary/5 font-medium" : "border-input"}`}
                onClick={() => setDraft({ ...draft, guest_checkout: true })}
              >
                اجازه خرید مهمان
              </button>
            </div>
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
