"use client"

import { useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

type AnalyticsPayload = {
  tracking_enabled?: boolean
  anonymize_ip?: boolean
  exclude_roles?: string[]
  exclude_ips?: string
  exclude_urls?: string
  online_timeout?: number
  retention_days?: number
  record_logged_in?: boolean
  enabled?: boolean
  provider?: string
  track_admin?: boolean
}

export function AnalyticsSettingsPanel() {
  const t = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } =
    useDraftSettings<AnalyticsPayload>("site", "analytics")

  if (loading || !draft) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>
  }

  const roles = Array.isArray(draft.exclude_roles) ? draft.exclude_roles : []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("analytics.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{t("analytics.hint")}</p>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("analytics.tracking_enabled")}</Label>
            <Switch
              checked={Boolean(draft.tracking_enabled ?? draft.enabled)}
              onCheckedChange={(v) => setDraft({ ...draft, tracking_enabled: v, enabled: v })}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("analytics.anonymize_ip")}</Label>
            <Switch
              checked={draft.anonymize_ip !== false}
              onCheckedChange={(v) => setDraft({ ...draft, anonymize_ip: v })}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("analytics.record_logged_in")}</Label>
            <Switch
              checked={Boolean(draft.record_logged_in)}
              onCheckedChange={(v) => setDraft({ ...draft, record_logged_in: v })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("analytics.online_timeout")}</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={draft.online_timeout ?? 5}
              onChange={(e) => setDraft({ ...draft, online_timeout: Number(e.target.value) || 5 })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("analytics.retention_days")}</Label>
            <Input
              type="number"
              min={7}
              max={730}
              value={draft.retention_days ?? 90}
              onChange={(e) => setDraft({ ...draft, retention_days: Number(e.target.value) || 90 })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("analytics.exclude_roles")}</Label>
            <Input
              value={roles.join(", ")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  exclude_roles: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="admin, staff"
              dir="ltr"
            />
          </div>
          <div className="grid max-w-lg gap-2">
            <Label>{t("analytics.exclude_ips")}</Label>
            <Textarea
              value={draft.exclude_ips ?? ""}
              onChange={(e) => setDraft({ ...draft, exclude_ips: e.target.value })}
              rows={3}
              dir="ltr"
              className="font-mono text-sm"
            />
          </div>
          <div className="grid max-w-lg gap-2">
            <Label>{t("analytics.exclude_urls")}</Label>
            <Textarea
              value={draft.exclude_urls ?? ""}
              onChange={(e) => setDraft({ ...draft, exclude_urls: e.target.value })}
              rows={4}
              dir="ltr"
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar pending={pending} saved={saved} error={error} onSave={() => void persist()} />
    </div>
  )
}
