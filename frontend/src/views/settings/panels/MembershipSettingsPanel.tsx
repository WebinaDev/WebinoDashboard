"use client"

import { useTranslations } from "next-intl"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

type Plan = {
  id: string
  label: string
  months: number
  price_minor: number
  enabled?: boolean
}

type Payload = {
  enabled?: boolean
  title?: string
  free_audio_downloads?: number
  product_discount_percent?: number
  benefits?: string[]
  plans?: Plan[]
}

export function MembershipSettingsPanel() {
  const t = useTranslations("settings_hub.site_membership")
  const tHub = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } =
    useDraftSettings<Payload>("site", "membership")

  if (loading || !draft) {
    return <p className="text-muted-foreground text-sm">{tHub("loading")}</p>
  }

  const plans = Array.isArray(draft.plans) ? draft.plans : []
  const benefits = Array.isArray(draft.benefits) ? draft.benefits : []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-2xl gap-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <Label>{t("enabled")}</Label>
              <p className="text-muted-foreground text-xs">{t("enabled_hint")}</p>
            </div>
            <Switch
              checked={Boolean(draft.enabled)}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            />
          </div>
          <div className="grid gap-1">
            <Label>{t("plan_title")}</Label>
            <Input
              value={draft.title ?? ""}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>{t("free_downloads")}</Label>
              <Input
                type="number"
                min={0}
                value={draft.free_audio_downloads ?? 5}
                onChange={(e) =>
                  setDraft({ ...draft, free_audio_downloads: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </div>
            <div className="grid gap-1">
              <Label>{t("discount_percent")}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.product_discount_percent ?? 10}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    product_discount_percent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                  })
                }
              />
            </div>
          </div>
          <div className="grid gap-1">
            <Label>{t("benefits")}</Label>
            <textarea
              className="border-input bg-background min-h-24 w-full rounded-md border px-3 py-2 text-sm"
              value={benefits.join("\n")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  benefits: e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
            <p className="text-muted-foreground text-xs">{t("benefits_hint")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("plans_title")}</CardTitle>
          <CardDescription>{t("plans_description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {plans.map((plan, idx) => (
            <div key={plan.id || idx} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-4">
              <div className="grid gap-1 sm:col-span-2">
                <Label>{t("plan_label")}</Label>
                <Input
                  value={plan.label ?? ""}
                  onChange={(e) => {
                    const next = [...plans]
                    next[idx] = { ...plan, label: e.target.value }
                    setDraft({ ...draft, plans: next })
                  }}
                />
              </div>
              <div className="grid gap-1">
                <Label>{t("plan_months")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={plan.months ?? 1}
                  onChange={(e) => {
                    const next = [...plans]
                    next[idx] = { ...plan, months: Math.max(1, Number(e.target.value) || 1) }
                    setDraft({ ...draft, plans: next })
                  }}
                />
              </div>
              <div className="grid gap-1">
                <Label>{t("plan_price")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={plan.price_minor ?? 0}
                  onChange={(e) => {
                    const next = [...plans]
                    next[idx] = { ...plan, price_minor: Math.max(0, Number(e.target.value) || 0) }
                    setDraft({ ...draft, plans: next })
                  }}
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-4">
                <Switch
                  checked={plan.enabled !== false}
                  onCheckedChange={(v) => {
                    const next = [...plans]
                    next[idx] = { ...plan, enabled: v }
                    setDraft({ ...draft, plans: next })
                  }}
                />
                <span className="text-sm">{t("plan_enabled")}</span>
                <span className="text-muted-foreground ms-auto font-mono text-xs" dir="ltr">
                  {plan.id}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <SettingsSaveBar pending={pending} saved={saved} error={error} onSave={() => void persist()} />
    </div>
  )
}
