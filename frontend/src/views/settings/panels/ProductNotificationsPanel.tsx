"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { SettingsSaveBar } from "@/views/settings/use-tenant-settings"

type Notif = Record<string, string | boolean>

export function ProductNotificationsPanel() {
  const t = useTranslations("settings_hub.product_notifications")
  const [draft, setDraft] = useState<Notif | null>(null)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ data: Notif }>("/api/v1/shop/product-notifications")
      .then((res) => setDraft(res.data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "error"))
  }, [])

  async function save() {
    if (!draft) return
    setPending(true)
    try {
      const res = await api<{ data: Notif }>("/api/v1/shop/product-notifications", { method: "PUT", body: draft })
      setDraft(res.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "error")
    } finally {
      setPending(false)
    }
  }

  if (!draft) return <p className="text-muted-foreground text-sm">{t("loading")}</p>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-xl gap-3">
          {(["back_in_stock_enabled", "on_sale_enabled", "channel_email", "channel_sms"] as const).map((key) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <Label>{t(key)}</Label>
              <Switch checked={Boolean(draft[key])} onCheckedChange={(v) => setDraft({ ...draft, [key]: v })} />
            </div>
          ))}
          <div className="grid gap-1">
            <Label>{t("from_name")}</Label>
            <Input value={String(draft.from_name ?? "")} onChange={(e) => setDraft({ ...draft, from_name: e.target.value })} />
          </div>
          <div className="grid gap-1">
            <Label>{t("sms_template_back_in_stock")}</Label>
            <Textarea
              value={String(draft.sms_template_back_in_stock ?? "")}
              onChange={(e) => setDraft({ ...draft, sms_template_back_in_stock: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label>{t("sms_template_on_sale")}</Label>
            <Textarea
              value={String(draft.sms_template_on_sale ?? "")}
              onChange={(e) => setDraft({ ...draft, sms_template_on_sale: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void save()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
