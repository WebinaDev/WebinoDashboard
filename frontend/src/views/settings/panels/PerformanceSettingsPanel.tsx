"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { SettingsSaveBar } from "@/views/settings/use-tenant-settings"

type Perf = Record<string, string | boolean | number>

export function PerformanceSettingsPanel() {
  const t = useTranslations("settings_hub.performance")
  const [draft, setDraft] = useState<Perf | null>(null)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [purgeNote, setPurgeNote] = useState<string | null>(null)

  useEffect(() => {
    api<{ data: Perf }>("/api/v1/performance/settings")
      .then((res) => setDraft(res.data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "error"))
  }, [])

  async function save() {
    if (!draft) return
    setPending(true)
    setError(null)
    try {
      const res = await api<{ data: Perf }>("/api/v1/performance/settings", { method: "PUT", json: draft })
      setDraft(res.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "error")
    } finally {
      setPending(false)
    }
  }

  async function purge() {
    setPending(true)
    try {
      const res = await api<{ data: { cleared: string[] } }>("/api/v1/performance/purge", {
        method: "POST",
        json: { reason: "manual" },
      })
      setPurgeNote(t("purged", { keys: (res.data.cleared ?? []).join(", ") }))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "error")
    } finally {
      setPending(false)
    }
  }

  if (!draft) return <p className="text-muted-foreground text-sm">{t("loading")}</p>

  const switches = [
    "webp_enabled",
    "lazy_load",
    "minify_inline_css",
    "purge_on_product_save",
    "purge_on_content_save",
    "cdn_cache_hint",
    "preload_fonts",
    "defer_analytics",
  ] as const

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-xl gap-3">
          {switches.map((key) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <Label>{t(key)}</Label>
              <Switch checked={Boolean(draft[key])} onCheckedChange={(v) => setDraft({ ...draft, [key]: v })} />
            </div>
          ))}
          <div className="grid gap-1">
            <Label>{t("isr_revalidate_seconds")}</Label>
            <Input
              type="number"
              dir="ltr"
              value={Number(draft.isr_revalidate_seconds ?? 60)}
              onChange={(e) => setDraft({ ...draft, isr_revalidate_seconds: Number(e.target.value) })}
            />
          </div>
          <div className="grid gap-1">
            <Label>{t("image_quality")}</Label>
            <Input
              type="number"
              dir="ltr"
              value={Number(draft.image_quality ?? 82)}
              onChange={(e) => setDraft({ ...draft, image_quality: Number(e.target.value) })}
            />
          </div>
          <div className="grid gap-1">
            <Label>{t("notes")}</Label>
            <Textarea value={String(draft.notes ?? "")} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => void purge()}>
            {t("purge_now")}
          </Button>
          {purgeNote ? <p className="text-muted-foreground text-xs">{purgeNote}</p> : null}
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void save()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
