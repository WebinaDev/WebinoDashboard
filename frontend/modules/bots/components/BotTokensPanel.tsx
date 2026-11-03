"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { FormSettingsSkeleton } from "@/components/TableListSkeleton"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { BotSection } from "../lib/bot-admin-ui"
import type { BotSettings } from "../lib/bot-settings"
import { settingsPath } from "../lib/bot-settings"
import type { LiveBotProvider } from "../lib/platforms"

export function BotTokensPanel({ provider }: { provider: LiveBotProvider }) {
  const t = useTranslations("bots")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [token, setToken] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [mirrorToken, setMirrorToken] = useState("")
  const [sandbox, setSandbox] = useState(false)
  const [sandboxToken, setSandboxToken] = useState("")
  const [enabled, setEnabled] = useState(false)

  const q = useQuery({
    queryKey: ["bots", provider, "settings"],
    queryFn: () => api<BotSettings>(settingsPath(provider)),
  })

  useEffect(() => {
    if (!q.data) return
    setEnabled(Boolean(q.data.enabled))
    setToken("")
    setWebhookSecret("")
    const c = q.data.meta?.connection ?? {}
    setMirrorToken(String(c.mirror_token ?? ""))
    setSandbox(Boolean(c.sandbox))
    setSandboxToken(String(c.sandbox_token ?? ""))
  }, [q.data])

  const save = useMutation({
    mutationFn: () =>
      api(settingsPath(provider), {
        method: "PUT",
        json: {
          enabled,
          ...(token && !token.includes("•") ? { token } : {}),
          ...(webhookSecret ? { webhook_secret: webhookSecret } : {}),
          meta: {
            ...(q.data?.meta ?? {}),
            connection: {
              ...(q.data?.meta?.connection ?? {}),
              mirror_token: mirrorToken,
              sandbox,
              sandbox_token: sandboxToken,
            },
          },
        },
      }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      setToken("")
      setWebhookSecret("")
      await qc.invalidateQueries({ queryKey: ["bots", provider] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (q.isLoading) return <FormSettingsSkeleton cards={1} fieldsPerCard={5} />

  return (
    <BotSection title={t("tokens.title")} description={t("tokens.hint")}>
      <div className="grid max-w-xl gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(Boolean(v))} />
          {t("settings.enabled")}
        </label>
        <div className="space-y-1">
          <Label>{t("settings.token")}</Label>
          <Input
            type="password"
            dir="ltr"
            className="font-mono"
            placeholder={q.data?.has_token ? "••••••••" : ""}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label>{t("tokens.webhookSecret")}</Label>
          <Input
            dir="ltr"
            className="font-mono"
            placeholder={q.data?.has_webhook_secret ? "••••••••" : ""}
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            autoComplete="off"
          />
          <p className="text-muted-foreground text-xs">{t("tokens.webhookSecretHint")}</p>
        </div>
        <div className="space-y-1">
          <Label>{t("tokens.mirror")}</Label>
          <Input
            type="password"
            dir="ltr"
            className="font-mono"
            value={mirrorToken}
            onChange={(e) => setMirrorToken(e.target.value)}
            autoComplete="off"
          />
          <p className="text-muted-foreground text-xs">{t("tokens.mirrorHint")}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={sandbox} onCheckedChange={(v) => setSandbox(Boolean(v))} />
          {t("tokens.sandbox")}
        </label>
        {sandbox ? (
          <div className="space-y-1">
            <Label>{t("tokens.sandboxToken")}</Label>
            <Input
              type="password"
              dir="ltr"
              className="font-mono"
              value={sandboxToken}
              onChange={(e) => setSandboxToken(e.target.value)}
              autoComplete="off"
            />
          </div>
        ) : null}
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {tCommon("save")}
        </Button>
      </div>
    </BotSection>
  )
}
