"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Megaphone, Send, Square } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { MediaPickerField } from "@/components/content/MediaPickerField"
import { FormSettingsSkeleton } from "@/components/TableListSkeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useEnumLabel } from "@/lib/enum-labels"
import { cn } from "@/lib/utils"

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

const MESSAGE_TYPES = ["text", "photo", "video", "voice", "document"] as const
const SEGMENTS = ["all", "buyers", "never_bought", "recent", "vip", "inactive_30"] as const

function mediaAcceptFor(type: string): "image" | "video" | "all" {
  if (type === "photo") return "image"
  if (type === "video") return "video"
  return "all"
}

export function BotBroadcastPanel({ provider }: { provider: BotProvider }) {
  const t = useTranslations("bots")
  const enumLabel = useEnumLabel()
  const qc = useQueryClient()
  const [type, setType] = useState<(typeof MESSAGE_TYPES)[number]>("text")
  const [text, setText] = useState("")
  const [media, setMedia] = useState("")
  const [segment, setSegment] = useState<(typeof SEGMENTS)[number]>("all")

  const q = useQuery({
    queryKey: ["bots", provider, "broadcast"],
    queryFn: () => api<BroadcastPayload>(`/api/v1/bots/${provider}/broadcast`),
    refetchInterval: (query) => (query.state.data?.job?.active ? 3000 : false),
  })

  const start = useMutation({
    mutationFn: () =>
      api(`/api/v1/bots/${provider}/broadcast/start`, {
        method: "POST",
        json: { type, text, media: media || null, segment },
      }),
    onSuccess: async () => {
      toast.success(t("broadcast.started"))
      await qc.invalidateQueries({ queryKey: ["bots", provider, "broadcast"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const cancel = useMutation({
    mutationFn: () => api(`/api/v1/bots/${provider}/broadcast/cancel`, { method: "POST", json: {} }),
    onSuccess: async () => {
      toast.success(t("broadcast.cancelled"))
      await qc.invalidateQueries({ queryKey: ["bots", provider, "broadcast"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const job = q.data?.job
  const needsMedia = type !== "text"
  const progressPct = useMemo(() => {
    const total = job?.total ?? 0
    const sent = job?.sent ?? 0
    if (!total) return 0
    return Math.min(100, Math.round((sent / total) * 100))
  }, [job?.sent, job?.total])

  if (q.isLoading) return <FormSettingsSkeleton cards={2} fieldsPerCard={3} />

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Composer */}
      <section className="space-y-4 rounded-xl border border-border/80 bg-card p-5 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
            <Send className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{t("broadcast.composerTitle")}</h2>
            <p className="text-muted-foreground text-sm">{t("broadcast.composerHint")}</p>
          </div>
        </div>

        <fieldset disabled={Boolean(job?.active)} className="space-y-4 disabled:opacity-60">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("broadcast.type")}</Label>
              <Select
                value={type}
                onValueChange={(v) => {
                  setType(v as (typeof MESSAGE_TYPES)[number])
                  if (v === "text") setMedia("")
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESSAGE_TYPES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {t(`broadcast.types.${v}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("broadcast.segment")}</Label>
              <Select value={segment} onValueChange={(v) => setSegment(v as (typeof SEGMENTS)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEGMENTS.map((v) => (
                    <SelectItem key={v} value={v}>
                      {t(`broadcast.segments.${v}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("broadcast.text")}</Label>
            <Textarea
              required
              className="min-h-32"
              value={text}
              placeholder={t("broadcast.textPlaceholder")}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {needsMedia ? (
            <MediaPickerField
              label={t("broadcast.media")}
              imageUrl={media}
              accept={mediaAcceptFor(type)}
              onPick={(item) => setMedia(item.url)}
              onClear={() => setMedia("")}
            />
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              disabled={start.isPending || !text.trim() || (needsMedia && !media)}
              onClick={() => start.mutate()}
            >
              <Send className="size-4" />
              {t("broadcast.start")}
            </Button>
          </div>
        </fieldset>
      </section>

      {/* Preview + status */}
      <div className="space-y-4">
        <section className="space-y-4 rounded-xl border border-border/80 bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{t("broadcast.previewTitle")}</h2>
            <Badge variant="secondary">{t(`broadcast.types.${type}`)}</Badge>
          </div>
          <div
            className={cn(
              "rounded-2xl border border-border/60 bg-muted/30 p-4",
              "min-h-[11rem] space-y-3",
            )}
          >
            {media && needsMedia ? (
              type === "video" ? (
                <video src={media} className="max-h-40 w-full rounded-lg object-cover" controls playsInline preload="metadata" />
              ) : type === "photo" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media} alt="" className="max-h-40 w-full rounded-lg object-cover" />
              ) : (
                <p className="text-muted-foreground truncate font-mono text-xs">{media}</p>
              )
            ) : null}
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {text.trim() || <span className="text-muted-foreground">{t("broadcast.previewEmpty")}</span>}
            </p>
            <p className="text-muted-foreground text-xs">
              {t("broadcast.previewAudience")}: {t(`broadcast.segments.${segment}`)}
            </p>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border/80 bg-card p-5 shadow-soft">
          <div className="flex items-start gap-3">
            <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
              <Megaphone className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold">{t("broadcast.status")}</h2>
              {job?.active ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm">
                    {t("broadcast.progress", {
                      status: enumLabel("job_status", job.status),
                      sent: job.sent ?? 0,
                      total: job.total ?? 0,
                      failed: job.failed ?? 0,
                    })}
                  </p>
                  <Progress value={progressPct} className="h-2" />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate()}
                  >
                    <Square className="size-3.5" />
                    {t("broadcast.cancel")}
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground mt-2 text-sm">{t("broadcast.idle")}</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
