"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { FormSettingsSkeleton } from "@/components/TableListSkeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import type { BotProvider } from "./BotProviderSwitcher"

type BroadcastPayload = {
  job?: {
    active?: boolean
    status?: string
    total?: number
    sent?: number
    failed?: number
  } | null
}

export function BotBroadcastPanel({ provider }: { provider: BotProvider }) {
  const t = useTranslations("bots")
  const qc = useQueryClient()
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

  if (q.isLoading) return <FormSettingsSkeleton cards={2} fieldsPerCard={3} />

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <section className="rounded-lg border border-border p-4 text-sm shadow-soft">
        <h3 className="font-medium">{t("broadcast.status")}</h3>
        {job?.active ? (
          <div className="mt-2 space-y-2">
            <p>
              {job.status}: {job.sent}/{job.total} (failed {job.failed})
            </p>
            <Button type="button" variant="destructive" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              {t("broadcast.cancel")}
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground mt-2">{t("broadcast.idle")}</p>
        )}
      </section>

      {!job?.active ? (
        <form
          className="space-y-4 rounded-lg border border-border p-4 shadow-soft"
          onSubmit={(e) => {
            e.preventDefault()
            start.mutate()
          }}
        >
          <div className="space-y-2">
            <Label>{t("broadcast.type")}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["text", "photo", "video", "voice", "document"].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("broadcast.segment")}</Label>
            <Select value={segment} onValueChange={setSegment}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["all", "buyers", "never_bought", "recent", "vip", "inactive_30"].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("broadcast.text")}</Label>
            <Textarea required className="min-h-24" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("broadcast.media")}</Label>
            <Input className="font-mono text-sm" value={media} onChange={(e) => setMedia(e.target.value)} />
          </div>
          <Button type="submit" disabled={start.isPending}>
            {t("broadcast.start")}
          </Button>
        </form>
      ) : null}
    </div>
  )
}
