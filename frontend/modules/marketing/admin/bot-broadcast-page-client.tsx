"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Provider = "bale" | "telegram"
const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

type BroadcastPayload = {
  job?: {
    active?: boolean
    status?: string
    total?: number
    sent?: number
    failed?: number
    cursor?: number
    segment?: string
    type?: string
  } | null
  advanced_media?: boolean
  campaigns_feature?: boolean
}

export default function BotBroadcastPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("bots_admin")
  const qc = useQueryClient()
  const [provider, setProvider] = useState<Provider>("bale")
  const [type, setType] = useState("text")
  const [text, setText] = useState("")
  const [media, setMedia] = useState("")
  const [segment, setSegment] = useState("all")
  const [error, setError] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ["bots", provider, "broadcast"],
    queryFn: () => api<BroadcastPayload>(`/api/v1/bots/${provider}/broadcast`),
    refetchInterval: (query) => (query.state.data?.job?.active ? 4000 : false),
  })

  const start = useMutation({
    mutationFn: () =>
      api(`/api/v1/bots/${provider}/broadcast/start`, {
        method: "POST",
        json: { type, text, media, segment },
      }),
    onSuccess: async () => {
      setError(null)
      await qc.invalidateQueries({ queryKey: ["bots", provider, "broadcast"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const cancel = useMutation({
    mutationFn: () => api(`/api/v1/bots/${provider}/broadcast/cancel`, { method: "POST", json: {} }),
    onSuccess: async () => {
      setError(null)
      await qc.invalidateQueries({ queryKey: ["bots", provider, "broadcast"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const job = q.data?.job

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">{t("broadcast.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <Label>{t("provider")}</Label>
          <select className={selectClass + " max-w-xs"} value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
            <option value="bale">Bale</option>
            <option value="telegram">Telegram</option>
          </select>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">{t("broadcast.status")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {job?.active ? (
            <>
              <p className="text-sm">
                {job.status}: {job.sent}/{job.total} (failed {job.failed})
              </p>
              <Button variant="destructive" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                {t("broadcast.cancel")}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("broadcast.idle")}</p>
          )}
        </CardContent>
      </Card>

      {!job?.active && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="text-base">{t("broadcast.start")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>{t("broadcast.type")}</Label>
              <select className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="text">text</option>
                <option value="photo">photo</option>
                <option value="video">video</option>
                <option value="voice">voice</option>
                <option value="document">document</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t("broadcast.segment")}</Label>
              <select className={selectClass} value={segment} onChange={(e) => setSegment(e.target.value)}>
                <option value="all">all</option>
                <option value="buyers">buyers</option>
                <option value="never_bought">never_bought</option>
                <option value="recent">recent</option>
                <option value="vip">vip</option>
                <option value="inactive_30">inactive_30</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t("broadcast.text")}</Label>
              <Textarea className="min-h-24" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("broadcast.media")}</Label>
              <Input className="font-mono text-sm" value={media} onChange={(e) => setMedia(e.target.value)} />
            </div>
            <Button disabled={start.isPending || !text} onClick={() => start.mutate()}>
              {t("broadcast.start")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
