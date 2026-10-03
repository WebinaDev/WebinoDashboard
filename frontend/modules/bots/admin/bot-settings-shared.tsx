"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { BotSectionTabs } from "../components/BotSectionTabs"

type Settings = {
  provider: string
  enabled: boolean
  token: string
  has_token: boolean
  has_webhook_secret?: boolean
  webhook_url?: string
  meta?: {
    addons?: Record<string, boolean>
    cascade?: Record<string, unknown>
    widget?: Record<string, unknown>
  }
}

const ADDON_KEYS = [
  "card_to_card",
  "faq",
  "tickets",
  "loyalty",
  "channel_publish",
  "order_cascade",
  "site_widget",
] as const

function BotSettingsCore({ provider }: { provider: "bale" | "telegram" }) {
  const t = useTranslations("bots")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState(false)
  const [token, setToken] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [chatId, setChatId] = useState("")
  const [testText, setTestText] = useState(() => t("settings.testTextDefault"))
  const [addons, setAddons] = useState<Record<string, boolean>>({})
  const [cascadeTemplate, setCascadeTemplate] = useState("")
  const [cascadeStatuses, setCascadeStatuses] = useState("processing,completed")
  const [cascadeNotifyCustomer, setCascadeNotifyCustomer] = useState(true)
  const [widgetGreeting, setWidgetGreeting] = useState("")
  const [widgetPosition, setWidgetPosition] = useState("bottom-left")
  const [widgetShowOnMobile, setWidgetShowOnMobile] = useState(true)

  const q = useQuery({
    queryKey: ["bots", provider, "settings"],
    queryFn: () => api<Settings>(`/api/v1/bots/${provider}/settings`),
  })

  useEffect(() => {
    if (!q.data) return
    setEnabled(Boolean(q.data.enabled))
    setToken("")
    setAddons({ ...(q.data.meta?.addons ?? {}) })
    const cascade = (q.data.meta?.cascade ?? {}) as Record<string, unknown>
    setCascadeTemplate(String(cascade.template ?? ""))
    setCascadeStatuses(String(cascade.statuses ?? "processing,completed"))
    setCascadeNotifyCustomer(cascade.notify_customer !== false)
    const widget = (q.data.meta?.widget ?? {}) as Record<string, unknown>
    setWidgetGreeting(String(widget.greeting ?? ""))
    setWidgetPosition(String(widget.position ?? "bottom-left"))
    setWidgetShowOnMobile(widget.show_on_mobile !== false)
  }, [q.data])

  const save = useMutation({
    mutationFn: () =>
      api(`/api/v1/bots/${provider}/settings`, {
        method: "PUT",
        json: {
          enabled,
          ...(token && !token.includes("•") ? { token } : {}),
          meta: {
            ...(q.data?.meta ?? {}),
            addons,
            cascade: {
              template: cascadeTemplate,
              statuses: cascadeStatuses,
              notify_customer: cascadeNotifyCustomer,
            },
            widget: {
              greeting: widgetGreeting,
              position: widgetPosition,
              show_on_mobile: widgetShowOnMobile,
            },
          },
        },
      }),
    onSuccess: async () => {
      setSaved(true)
      setError(null)
      setToken("")
      await qc.invalidateQueries({ queryKey: ["bots", provider, "settings"] })
    },
    onError: (e: Error) => {
      setSaved(false)
      setError(getApiErrorMessage(e))
    },
  })

  const send = useMutation({
    mutationFn: () =>
      api(`/api/v1/bots/${provider}/send`, {
        method: "POST",
        json: { chat_id: chatId, type: "text", text: testText },
      }),
    onSuccess: () => setError(null),
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <PageShell title={t(`settings.${provider}`)} description={t("description")}>
      <BotSectionTabs provider={provider} active="settings" />
      <div className="grid max-w-2xl gap-4">
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">{t("settings.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            {saved ? <p className="text-sm text-green-700">{tCommon("saved")}</p> : null}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(Boolean(v))} />
              {t("settings.enabled")}
            </label>
            <div className="space-y-1">
              <Label>{t("settings.token")}</Label>
              <Input
                type="password"
                placeholder={q.data?.has_token ? "••••••••" : ""}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            {q.data?.webhook_url ? (
              <div className="space-y-1">
                <Label>{t("settings.webhook")}</Label>
                <Input
                  readOnly
                  className="font-mono text-xs"
                  value={q.data.webhook_url}
                />
              </div>
            ) : null}
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {tCommon("save")}
            </Button>
          </CardContent>
        </Card>

        
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">{t("addons.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">{t("addons.hint")}</p>
            {ADDON_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={Boolean(addons[key])}
                  onCheckedChange={(v) => setAddons((prev) => ({ ...prev, [key]: Boolean(v) }))}
                />
                {t(`addons.${key}`)}
              </label>
            ))}
          </CardContent>
        </Card>

        {addons.order_cascade ? (
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">{t("cascade.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-muted-foreground text-sm">{t("cascade.hint")}</p>
              <div className="space-y-1">
                <Label>{t("cascade.template")}</Label>
                <Input
                  value={cascadeTemplate}
                  onChange={(e) => setCascadeTemplate(e.target.value)}
                  placeholder={t("cascade.templatePh")}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("cascade.statuses")}</Label>
                <Input
                  value={cascadeStatuses}
                  onChange={(e) => setCascadeStatuses(e.target.value)}
                  placeholder={t("cascade.statusesPh")}
                />
                <p className="text-muted-foreground text-xs">{t("cascade.statusesHint")}</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={cascadeNotifyCustomer} onCheckedChange={(v) => setCascadeNotifyCustomer(Boolean(v))} />
                {t("cascade.notifyCustomer")}
              </label>
            </CardContent>
          </Card>
        ) : null}

        {addons.site_widget ? (
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">{t("widget.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-muted-foreground text-sm">{t("widget.hint")}</p>
              <div className="space-y-1">
                <Label>{t("widget.greeting")}</Label>
                <Input value={widgetGreeting} onChange={(e) => setWidgetGreeting(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t("widget.position")}</Label>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                  value={widgetPosition}
                  onChange={(e) => setWidgetPosition(e.target.value)}
                >
                  <option value="bottom-left">{t("widget.positions.bottom_left")}</option>
                  <option value="bottom-right">{t("widget.positions.bottom_right")}</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={widgetShowOnMobile} onCheckedChange={(v) => setWidgetShowOnMobile(Boolean(v))} />
                {t("widget.showOnMobile")}
              </label>
            </CardContent>
          </Card>
        ) : null}
<Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">{t("settings.testSend")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>{t("settings.chatId")}</Label>
              <Input value={chatId} onChange={(e) => setChatId(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("broadcast.text")}</Label>
              <Input value={testText} onChange={(e) => setTestText(e.target.value)} />
            </div>
            <Button disabled={send.isPending || !chatId} onClick={() => send.mutate()}>
              {t("settings.testSend")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}

export function BaleSettingsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  return <BotSettingsCore provider="bale" />
}

export function TelegramSettingsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  return <BotSettingsCore provider="telegram" />
}
