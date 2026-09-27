"use client"

import { useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

type AiPayload = Record<string, unknown>

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
          <p className="text-muted-foreground text-sm">{t("ai.hint")}</p>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("ai.enabled")}</Label>
            <Switch
              checked={Boolean(draft.enabled)}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("ai.default_provider")}</Label>
            <Select
              value={String(draft.default_provider ?? "grok")}
              onValueChange={(v) => setDraft({ ...draft, default_provider: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="grok">Grok</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="gapgpt">GapGPT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(["grok_api_key", "gemini_api_key", "openai_api_key", "gapgpt_api_key"] as const).map((k) => (
            <div key={k} className="grid max-w-md gap-2">
              <Label>{t(`ai.${k}` as never)}</Label>
              <Input
                type="password"
                dir="ltr"
                className="font-mono"
                value={String(draft[k] ?? "")}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                placeholder={draft[`${k}_set`] ? "••••" : ""}
              />
            </div>
          ))}
          <div className="grid max-w-md gap-2">
            <Label>{t("ai.site_name")}</Label>
            <Input
              value={String(draft.site_name ?? "")}
              onChange={(e) => setDraft({ ...draft, site_name: e.target.value })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("ai.site_topic")}</Label>
            <Input
              value={String(draft.site_topic ?? "")}
              onChange={(e) => setDraft({ ...draft, site_topic: e.target.value })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("ai.tone")}</Label>
            <Input
              value={String(draft.tone ?? "")}
              onChange={(e) => setDraft({ ...draft, tone: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("ai.prompt_product")}</Label>
            <Textarea
              value={String(draft.prompt_product ?? "")}
              onChange={(e) => setDraft({ ...draft, prompt_product: e.target.value })}
              rows={3}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("ai.do_product")}</Label>
            <Switch
              checked={Boolean(draft.do_product)}
              onCheckedChange={(v) => setDraft({ ...draft, do_product: v })}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("ai.do_blog")}</Label>
            <Switch
              checked={Boolean(draft.do_blog)}
              onCheckedChange={(v) => setDraft({ ...draft, do_blog: v })}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("ai.auto_publish")}</Label>
            <Switch
              checked={Boolean(draft.auto_publish)}
              onCheckedChange={(v) => setDraft({ ...draft, auto_publish: v })}
            />
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar pending={pending} saved={saved} error={error} onSave={() => void persist()} />
    </div>
  )
}
