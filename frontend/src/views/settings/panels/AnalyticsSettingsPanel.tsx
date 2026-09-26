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

type AnalyticsPayload = {
  enabled?: boolean
  provider?: string
  ga_measurement_id?: string
  gtm_id?: string
  clarity_id?: string
  track_admin?: boolean
}

export function AnalyticsSettingsPanel() {
  const t = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } =
    useDraftSettings<AnalyticsPayload>("site", "analytics")

  if (loading || !draft) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("analytics.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("analytics.enabled")}</Label>
            <Switch
              checked={Boolean(draft.enabled)}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            />
          </div>
          <div className="grid max-w-sm gap-2">
            <Label>{t("analytics.provider")}</Label>
            <Select
              value={draft.provider ?? "none"}
              onValueChange={(v) => setDraft({ ...draft, provider: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("analytics.provider_none")}</SelectItem>
                <SelectItem value="ga4">Google Analytics 4</SelectItem>
                <SelectItem value="gtm">Google Tag Manager</SelectItem>
                <SelectItem value="clarity">Microsoft Clarity</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid max-w-md gap-2">
            <Label>GA Measurement ID</Label>
            <Input
              value={draft.ga_measurement_id ?? ""}
              onChange={(e) => setDraft({ ...draft, ga_measurement_id: e.target.value })}
              dir="ltr"
              className="font-mono"
              placeholder="G-XXXXXXXX"
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>GTM Container ID</Label>
            <Input
              value={draft.gtm_id ?? ""}
              onChange={(e) => setDraft({ ...draft, gtm_id: e.target.value })}
              dir="ltr"
              className="font-mono"
              placeholder="GTM-XXXX"
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>Clarity Project ID</Label>
            <Input
              value={draft.clarity_id ?? ""}
              onChange={(e) => setDraft({ ...draft, clarity_id: e.target.value })}
              dir="ltr"
              className="font-mono"
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("analytics.track_admin")}</Label>
            <Switch
              checked={Boolean(draft.track_admin)}
              onCheckedChange={(v) => setDraft({ ...draft, track_admin: v })}
            />
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
