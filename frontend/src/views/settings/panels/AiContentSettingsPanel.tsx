"use client"

import { useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

type AiPayload = {
  enabled?: boolean
  provider?: string
  api_key?: string
  model?: string
  do_product?: boolean
  prompt_product?: string
  temperature?: number
}

export function AiContentSettingsPanel() {
  const t = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } =
    useDraftSettings<AiPayload>("site", "ai")

  if (loading || !draft) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("ai.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("ai.enabled")}</Label>
            <Switch
              checked={Boolean(draft.enabled)}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("ai.provider")}</Label>
            <Input
              value={draft.provider ?? ""}
              onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
              dir="ltr"
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("ai.api_key")}</Label>
            <Input
              type="password"
              value={draft.api_key ?? ""}
              onChange={(e) => setDraft({ ...draft, api_key: e.target.value })}
              dir="ltr"
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("ai.model")}</Label>
            <Input
              value={draft.model ?? ""}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              dir="ltr"
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("ai.do_product")}</Label>
            <Switch
              checked={Boolean(draft.do_product)}
              onCheckedChange={(v) => setDraft({ ...draft, do_product: v })}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("ai.prompt_product")}</Label>
            <Textarea
              value={draft.prompt_product ?? ""}
              onChange={(e) => setDraft({ ...draft, prompt_product: e.target.value })}
              rows={5}
            />
          </div>
          <div className="grid max-w-xs gap-2">
            <Label>{t("ai.temperature")}</Label>
            <Input
              type="number"
              step="0.1"
              min={0}
              max={2}
              value={Number(draft.temperature ?? 0.7)}
              onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) })}
            />
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
