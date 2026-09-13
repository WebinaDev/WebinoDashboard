"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Settings = {
  provider: string
  enabled: boolean
  token: string
  has_token: boolean
  webhook_secret?: string
  webhook_url?: string
}

function BotSettingsClient({ provider }: { provider: "bale" | "telegram" }) {
  const t = useTranslations("bots_admin")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState(false)
  const [token, setToken] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [chatId, setChatId] = useState("")
  const [testText, setTestText] = useState("Hello from WebinoDashboard")

  const q = useQuery({
    queryKey: ["bots", provider, "settings"],
    queryFn: () => api<Settings>(`/api/v1/bots/${provider}/settings`),
  })

  useEffect(() => {
    if (!q.data) return
    setEnabled(Boolean(q.data.enabled))
    setToken("")
  }, [q.data])

  const save = useMutation({
    mutationFn: () =>
      api(`/api/v1/bots/${provider}/settings`, {
        method: "PUT",
        json: {
          enabled,
          ...(token && !token.includes("•") ? { token } : {}),
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
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">{t(`settings.${provider}`)}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm text-green-700">{tCommon("saved")}</p>}
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
          {q.data?.webhook_url && (
            <div className="space-y-1">
              <Label>{t("settings.webhook")}</Label>
              <Input readOnly className="font-mono text-xs" value={`${q.data.webhook_url}?secret=${q.data.webhook_secret ?? ""}`} />
            </div>
          )}
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {tCommon("save")}
          </Button>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.testSend")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>chat_id</Label>
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
  )
}

export function BaleSettingsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  return <BotSettingsClient provider="bale" />
}

export function TelegramSettingsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  return <BotSettingsClient provider="telegram" />
}
