"use client"

import { useTranslations } from "next-intl"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

type InstagramPayload = {
  enabled?: boolean
  handle?: string
  ig_user_id?: string
  access_token?: string
  access_token_set?: boolean
  cache_hours?: number
  clear_token?: boolean
}

export function InstagramSettingsPanel() {
  const t = useTranslations("settings_hub.instagram")
  const tHub = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } =
    useDraftSettings<InstagramPayload>("site", "instagram")

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
              checked={draft.enabled === true}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            />
          </div>

          <div className="grid max-w-lg gap-3">
            <div className="grid gap-1">
              <Label>{t("fieldHandle")}</Label>
              <Input
                dir="ltr"
                value={draft.handle ?? ""}
                onChange={(e) => setDraft({ ...draft, handle: e.target.value.replace(/^@/, "") })}
                placeholder="parisma.gallery"
              />
              <p className="text-muted-foreground text-xs">{t("handleHint")}</p>
            </div>

            <div className="grid gap-1">
              <Label>{t("fieldIgUserId")}</Label>
              <Input
                dir="ltr"
                value={draft.ig_user_id ?? ""}
                onChange={(e) => setDraft({ ...draft, ig_user_id: e.target.value })}
                placeholder="17841400000000000"
              />
              <p className="text-muted-foreground text-xs">{t("igUserIdHint")}</p>
            </div>

            <div className="grid gap-1">
              <Label>{t("fieldToken")}</Label>
              <Input
                dir="ltr"
                type="password"
                autoComplete="off"
                value={draft.access_token ?? ""}
                onChange={(e) => setDraft({ ...draft, access_token: e.target.value, clear_token: false })}
                placeholder={draft.access_token_set ? "••••••••" : ""}
              />
              <p className="text-muted-foreground text-xs">
                {draft.access_token_set ? t("tokenSet") : t("tokenMissing")} — {t("tokenHint")}
              </p>
              {draft.access_token_set ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => setDraft({ ...draft, access_token: "", clear_token: true, access_token_set: false })}
                >
                  {t("clearToken")}
                </Button>
              ) : null}
            </div>

            <div className="grid gap-1">
              <Label>{t("fieldCacheHours")}</Label>
              <Input
                type="number"
                min={1}
                max={6}
                value={draft.cache_hours ?? 3}
                onChange={(e) => setDraft({ ...draft, cache_hours: Number(e.target.value) || 3 })}
              />
              <p className="text-muted-foreground text-xs">{t("cacheHint")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar pending={pending} saved={saved} error={error} onSave={() => void persist()} />
    </div>
  )
}
