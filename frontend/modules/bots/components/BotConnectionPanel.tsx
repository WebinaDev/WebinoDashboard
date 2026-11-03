"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { FormSettingsSkeleton } from "@/components/TableListSkeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { BotSection } from "../lib/bot-admin-ui"
import type { BotConnectionStatus, BotSettings } from "../lib/bot-settings"
import { settingsPath } from "../lib/bot-settings"
import type { LiveBotProvider } from "../lib/platforms"

export function BotConnectionPanel({ provider }: { provider: LiveBotProvider }) {
  const t = useTranslations("bots")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [mode, setMode] = useState<"webhook" | "polling">("webhook")
  const [proxyUrl, setProxyUrl] = useState("")

  const settingsQ = useQuery({
    queryKey: ["bots", provider, "settings"],
    queryFn: () => api<BotSettings>(settingsPath(provider)),
  })

  const healthQ = useQuery({
    queryKey: ["bots", provider, "connection-status"],
    queryFn: () => api<BotConnectionStatus>(`/api/v1/bots/${provider}/connection-status`),
    retry: false,
  })

  useEffect(() => {
    const c = settingsQ.data?.meta?.connection
    if (!c) return
    setMode(c.mode === "polling" ? "polling" : "webhook")
    setProxyUrl(String(c.proxy_url ?? ""))
  }, [settingsQ.data])

  const save = useMutation({
    mutationFn: () =>
      api(settingsPath(provider), {
        method: "PUT",
        json: {
          meta: {
            ...(settingsQ.data?.meta ?? {}),
            connection: {
              ...(settingsQ.data?.meta?.connection ?? {}),
              mode,
              proxy_url: proxyUrl.trim(),
            },
          },
        },
      }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await qc.invalidateQueries({ queryKey: ["bots", provider, "settings"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const setHook = useMutation({
    mutationFn: () => api(`/api/v1/bots/${provider}/set-webhook`, { method: "POST", json: {} }),
    onSuccess: async () => {
      toast.success(t("connection.webhookSet"))
      await qc.invalidateQueries({ queryKey: ["bots", provider, "connection-status"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const delHook = useMutation({
    mutationFn: () => api(`/api/v1/bots/${provider}/delete-webhook`, { method: "POST", json: {} }),
    onSuccess: async () => {
      toast.success(t("connection.webhookDeleted"))
      await qc.invalidateQueries({ queryKey: ["bots", provider, "connection-status"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (settingsQ.isLoading) return <FormSettingsSkeleton cards={2} fieldsPerCard={3} />

  const webhookUrl = settingsQ.data?.webhook_url ?? ""
  const health = healthQ.data

  return (
    <div className="space-y-4">
      <BotSection title={t("connection.modeTitle")} description={t("connection.modeHint")}>
        <div className="grid max-w-xl gap-3">
          <div className="space-y-1">
            <Label>{t("connection.mode")}</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "webhook" | "polling")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="webhook">{t("connection.modes.webhook")}</SelectItem>
                <SelectItem value="polling">{t("connection.modes.polling")}</SelectItem>
              </SelectContent>
            </Select>
            {mode === "polling" ? (
              <p className="text-muted-foreground text-xs">{t("connection.pollingStub")}</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label>{t("connection.proxy")}</Label>
            <Input
              dir="ltr"
              className="font-mono text-xs"
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="socks5://127.0.0.1:1080"
            />
            <p className="text-muted-foreground text-xs">{t("connection.proxyHint")}</p>
          </div>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {tCommon("save")}
          </Button>
        </div>
      </BotSection>

      <BotSection title={t("connection.webhookTitle")} description={t("connection.webhookHint")}>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("settings.webhook")}</Label>
            <Input readOnly dir="ltr" className="font-mono text-xs" value={webhookUrl} />
          </div>
          <p className="text-muted-foreground text-xs" dir="ltr">
            {t("connection.secretHeader")}: {settingsQ.data?.webhook_secret_header ?? "X-Bot-Secret"}
          </p>
          {health ? (
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
              <p>
                {health.ok
                  ? t("connection.healthOk", { user: health.bot?.username ?? "—" })
                  : t("connection.healthFail", { error: health.error ?? "—" })}
              </p>
              <p className="text-muted-foreground mt-1 break-all text-xs" dir="ltr">
                {t("connection.currentUrl")}: {health.webhook?.url || t("connection.notSet")}
              </p>
              {health.webhook?.last_error_message ? (
                <p className="text-destructive mt-1 text-xs">{health.webhook.last_error_message}</p>
              ) : null}
            </div>
          ) : healthQ.isError ? (
            <p className="text-muted-foreground text-sm">{t("connection.healthUnavailable")}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={setHook.isPending || mode !== "webhook" || !settingsQ.data?.has_token}
              onClick={() => setHook.mutate()}
            >
              {t("connection.connectWebhook")}
            </Button>
            <Button size="sm" variant="outline" disabled={delHook.isPending} onClick={() => delHook.mutate()}>
              {t("connection.disconnectWebhook")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void healthQ.refetch()}>
              {t("connection.refresh")}
            </Button>
          </div>
        </div>
      </BotSection>
    </div>
  )
}
