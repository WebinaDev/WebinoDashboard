"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type BotSettings = {
  provider: string
  enabled: boolean
  token: string
  has_token: boolean
  webhook_url?: string
}

export function BotsSettingsPanel({ provider }: { provider: "bale" | "telegram" }) {
  const t = useTranslations("bots")
  const tHub = useTranslations("settings_hub")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState(false)
  const [token, setToken] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const q = useQuery({
    queryKey: ["bots", provider, "settings"],
    queryFn: () => api<BotSettings>(`/api/v1/bots/${provider}/settings`),
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(`settings.${provider}`)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${provider}-enabled`}
            checked={enabled}
            onCheckedChange={(v) => setEnabled(Boolean(v))}
          />
          <Label htmlFor={`${provider}-enabled`}>{tHub("bots.enabled")}</Label>
        </div>
        <div className="grid max-w-md gap-2">
          <Label>{tHub("bots.token")}</Label>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={q.data?.has_token ? "••••••••" : ""}
            dir="ltr"
          />
        </div>
        {q.data?.webhook_url ? (
          <p className="text-muted-foreground font-mono text-xs break-all" dir="ltr">
            webhook: {q.data.webhook_url}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void save.mutateAsync()} disabled={save.isPending}>
            {save.isPending ? tCommon("saving") : tCommon("save")}
          </Button>
          {saved ? (
            <p className="text-sm text-green-600 dark:text-green-400">{tHub("saved")}</p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}
