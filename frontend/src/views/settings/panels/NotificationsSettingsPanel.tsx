"use client"

import { useMutation } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

const CHANNELS = ["site", "sms", "bale", "telegram", "email"] as const
type Channel = (typeof CHANNELS)[number]

const EVENTS = [
  "order_status",
  "return_requested",
  "return_approved",
  "return_rejected",
  "user_welcome",
  "stock_low",
  "stock_out",
  "review_pending",
] as const
type EventKey = (typeof EVENTS)[number]

const EVENT_VARS: Record<EventKey, string[]> = {
  order_status: ["order_number", "customer_name", "status", "tracking_code", "site_name"],
  return_requested: ["order_number", "customer_name", "status", "return_reason", "site_name"],
  return_approved: ["order_number", "customer_name", "status", "site_name"],
  return_rejected: ["order_number", "customer_name", "status", "site_name"],
  user_welcome: ["customer_name", "site_name"],
  stock_low: ["product_name", "stock", "site_name"],
  stock_out: ["product_name", "stock", "site_name"],
  review_pending: ["product_name", "customer_name", "site_name"],
}

type EventConfig = {
  customer: boolean
  admin: boolean
  customer_template: string
  admin_template: string
}

type ChannelConfig = {
  enabled: boolean
  events: Record<EventKey, EventConfig>
  admin_phone?: string
  admin_chat_id?: string
  admin_email?: string
}

type SmtpConfig = {
  enabled: boolean
  host: string
  port: number
  username: string
  password: string
  has_password?: boolean
  encryption: "tls" | "ssl" | "none"
  from_address: string
  from_name: string
}

type NotificationsPayload = {
  channels: Record<Channel, ChannelConfig>
  smtp: SmtpConfig
}

export function NotificationsSettingsPanel() {
  const t = useTranslations("notifications_hub.settings")
  const tHub = useTranslations("settings_hub")
  const [tab, setTab] = useState<Channel>("site")
  const [testTo, setTestTo] = useState("")
  const { loading, draft, setDraft, persist, pending, saved, error, refetchError } =
    useDraftSettings<NotificationsPayload>("site", "notifications")

  const testEmail = useMutation({
    mutationFn: () =>
      api<{ ok: boolean }>("/api/v1/settings/site/notifications/test-email", {
        method: "POST",
        json: { to: testTo.trim() },
      }),
    onSuccess: () => toast.success(t("smtp.test_ok")),
    onError: (e: Error) => toast.error(getApiErrorMessage(e) || t("smtp.test_failed")),
  })

  if (loading || !draft) {
    return <p className="text-muted-foreground text-sm">{tHub("loading")}</p>
  }

  const current = draft

  function patchChannel(channel: Channel, patch: Partial<ChannelConfig>) {
    setDraft({
      ...current,
      channels: { ...current.channels, [channel]: { ...current.channels[channel], ...patch } },
    })
  }

  function patchEvent(channel: Channel, event: EventKey, patch: Partial<EventConfig>) {
    const ch = current.channels[channel]
    patchChannel(channel, { events: { ...ch.events, [event]: { ...ch.events[event], ...patch } } })
  }

  function patchSmtp(patch: Partial<SmtpConfig>) {
    setDraft({ ...current, smtp: { ...current.smtp, ...patch } })
  }

  const renderAdminTarget = (channel: Channel) => {
    const ch = current.channels[channel]
    if (channel === "sms") {
      return (
        <div className="grid max-w-md gap-1">
          <Label>{t("admin_phone")}</Label>
          <Input
            dir="ltr"
            className="font-mono"
            value={ch.admin_phone ?? ""}
            onChange={(e) => patchChannel(channel, { admin_phone: e.target.value })}
          />
          <p className="text-muted-foreground text-xs">{t("admin_phone_hint")}</p>
        </div>
      )
    }
    if (channel === "bale" || channel === "telegram") {
      return (
        <div className="grid max-w-md gap-1">
          <Label>{t("admin_chat_id")}</Label>
          <Input
            dir="ltr"
            className="font-mono"
            value={ch.admin_chat_id ?? ""}
            onChange={(e) => patchChannel(channel, { admin_chat_id: e.target.value })}
          />
          <p className="text-muted-foreground text-xs">{t("admin_chat_hint")}</p>
        </div>
      )
    }
    if (channel === "email") {
      return (
        <div className="grid max-w-md gap-1">
          <Label>{t("admin_email")}</Label>
          <Input
            dir="ltr"
            value={ch.admin_email ?? ""}
            onChange={(e) => patchChannel(channel, { admin_email: e.target.value })}
          />
          <p className="text-muted-foreground text-xs">{t("admin_email_hint")}</p>
        </div>
      )
    }
    return null
  }

  const renderSmtp = () => {
    const smtp = current.smtp
    return (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">{t("smtp.title")}</CardTitle>
            <CardDescription className="mt-1">{t("smtp.hint")}</CardDescription>
          </div>
          <Switch
            aria-label={t("smtp.enabled")}
            checked={Boolean(smtp.enabled)}
            onCheckedChange={(v) => patchSmtp({ enabled: v })}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>{t("smtp.host")}</Label>
              <Input dir="ltr" value={smtp.host} onChange={(e) => patchSmtp({ host: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>{t("smtp.port")}</Label>
              <Input
                type="number"
                dir="ltr"
                value={smtp.port}
                onChange={(e) => patchSmtp({ port: Number(e.target.value) || 587 })}
              />
            </div>
            <div className="grid gap-1">
              <Label>{t("smtp.username")}</Label>
              <Input dir="ltr" value={smtp.username} onChange={(e) => patchSmtp({ username: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label>{t("smtp.password")}</Label>
              <Input
                type="password"
                dir="ltr"
                autoComplete="new-password"
                value={smtp.password}
                onChange={(e) => patchSmtp({ password: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label>{t("smtp.encryption")}</Label>
              <Select
                value={smtp.encryption}
                onValueChange={(v) => patchSmtp({ encryption: v as SmtpConfig["encryption"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tls">{t("smtp.encryption_tls")}</SelectItem>
                  <SelectItem value="ssl">{t("smtp.encryption_ssl")}</SelectItem>
                  <SelectItem value="none">{t("smtp.encryption_none")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>{t("smtp.from_address")}</Label>
              <Input
                dir="ltr"
                type="email"
                value={smtp.from_address}
                onChange={(e) => patchSmtp({ from_address: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label>{t("smtp.from_name")}</Label>
              <Input value={smtp.from_name} onChange={(e) => patchSmtp({ from_name: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-end">
            <div className="grid flex-1 gap-1">
              <Label>{t("smtp.test_to")}</Label>
              <Input dir="ltr" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={testEmail.isPending || !testTo.trim()}
              onClick={() => testEmail.mutate()}
            >
              {t("smtp.test_send")}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {refetchError ? <p className="text-sm text-destructive">{refetchError}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Channel)}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          {CHANNELS.map((channel) => (
            <TabsTrigger key={channel} value={channel}>
              {t(`tabs.${channel}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {CHANNELS.map((channel) => {
          const ch = current.channels[channel]
          return (
            <TabsContent key={channel} value={channel} className="space-y-4">
              <Card>
                <CardContent className="space-y-4 pt-6">
                  <div className="flex max-w-lg items-center justify-between gap-3">
                    <Label htmlFor={`notify-${channel}-enabled`}>{t("channel_enabled")}</Label>
                    <Switch
                      id={`notify-${channel}-enabled`}
                      checked={Boolean(ch.enabled)}
                      onCheckedChange={(v) => patchChannel(channel, { enabled: v })}
                    />
                  </div>
                  {renderAdminTarget(channel)}
                </CardContent>
              </Card>

              {channel === "email" ? renderSmtp() : null}

              <fieldset disabled={!ch.enabled} className="space-y-3 disabled:opacity-60">
                {EVENTS.map((event) => {
                  const cfg = ch.events[event]
                  return (
                    <Card key={event}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{t(`events.${event}`)}</CardTitle>
                        <CardDescription className="text-xs" dir="auto">
                          {t("variables", { vars: EVENT_VARS[event].map((v) => `{${v}}`).join(" ") })}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 md:grid-cols-2">
                        {(["customer", "admin"] as const).map((audience) => (
                          <div key={audience} className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <Label htmlFor={`notify-${channel}-${event}-${audience}`} className="font-normal">
                                {t(audience)}
                              </Label>
                              <Switch
                                id={`notify-${channel}-${event}-${audience}`}
                                checked={Boolean(cfg[audience])}
                                onCheckedChange={(v) => patchEvent(channel, event, { [audience]: v })}
                              />
                            </div>
                            <Label className="text-muted-foreground text-xs">{t(`${audience}_template`)}</Label>
                            <Textarea
                              rows={2}
                              disabled={!cfg[audience]}
                              placeholder={t("template_placeholder")}
                              value={cfg[`${audience}_template`] ?? ""}
                              onChange={(e) =>
                                patchEvent(channel, event, { [`${audience}_template`]: e.target.value })
                              }
                            />
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )
                })}
              </fieldset>
            </TabsContent>
          )
        })}
      </Tabs>

      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
