"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarClock, ListOrdered, Upload } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { MediaPickerField } from "@/components/content/MediaPickerField"
import { ScrollTable } from "@/components/ScrollTable"
import { FormSettingsSkeleton } from "@/components/TableListSkeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useEnumLabel } from "@/lib/enum-labels"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"

import type { BotProvider } from "./BotProviderSwitcher"

type CampaignItem = {
  id: number
  name: string
  status: string
  sent: number
  failed: number
  scheduled_at?: number | null
  audience?: string
  type?: string
}

type CampaignsResponse = {
  enabled: boolean
  items: CampaignItem[]
}

const MESSAGE_TYPES = ["text", "photo", "video", "voice", "document"] as const

function mediaAcceptFor(type: string): "image" | "video" | "all" {
  if (type === "photo") return "image"
  if (type === "video") return "video"
  return "all"
}

export function BotCampaignsPanel({ provider }: { provider: BotProvider }) {
  const enumLabel = useEnumLabel()
  const t = useTranslations("bots")
  const locale = normalizeUiLocale(useLocale())
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [scheduledAt, setScheduledAt] = useState("")
  const [type, setType] = useState<(typeof MESSAGE_TYPES)[number]>("text")
  const [text, setText] = useState("")
  const [media, setMedia] = useState("")
  const [audience, setAudience] = useState<"all" | "imported">("all")
  const [launchNow, setLaunchNow] = useState(true)
  const [csv, setCsv] = useState("")

  const q = useQuery({
    queryKey: ["bots", provider, "campaigns"],
    queryFn: () => api<CampaignsResponse>(`/api/v1/bots/${provider}/campaigns`),
    refetchInterval: (query) =>
      (query.state.data?.items ?? []).some((c) => c.status === "running" || c.status === "scheduled") ? 5000 : false,
  })

  const create = useMutation({
    mutationFn: () => {
      const when = scheduledAt
        ? Math.floor(new Date(scheduledAt).getTime() / 1000)
        : Math.floor(Date.now() / 1000)
      return api(`/api/v1/bots/${provider}/campaigns`, {
        method: "POST",
        json: {
          name,
          scheduled_at: when,
          type,
          text,
          media: media || null,
          audience,
          launch_now: launchNow || !scheduledAt,
        },
      })
    },
    onSuccess: async () => {
      toast.success(t("campaigns.created"))
      setName("")
      setText("")
      setMedia("")
      setScheduledAt("")
      await qc.invalidateQueries({ queryKey: ["bots", provider, "campaigns"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const importCsv = useMutation({
    mutationFn: () => api<{ imported?: number }>(`/api/v1/bots/${provider}/users/import`, { method: "POST", json: { csv } }),
    onSuccess: (data) => {
      toast.success(t("campaigns.imported", { count: data?.imported ?? 0 }))
      setCsv("")
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (q.isLoading) return <FormSettingsSkeleton cards={2} fieldsPerCard={4} />
  const items = q.data?.items ?? []
  const needsMedia = type !== "text"

  return (
    <div className="space-y-4">
      {!q.data?.enabled ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">{t("campaigns.disabled")}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Create form */}
        <section className="space-y-4 rounded-xl border border-border/80 bg-card p-5 shadow-soft">
          <div className="flex items-start gap-3">
            <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
              <CalendarClock className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold">{t("campaigns.create")}</h2>
              <p className="text-muted-foreground text-sm">{t("campaigns.createHint")}</p>
            </div>
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              create.mutate()
            }}
          >
            <div className="space-y-2">
              <Label>{t("campaigns.name")}</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t("campaigns.namePlaceholder")} />
            </div>

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
                <Label>{t("campaigns.schedule")}</Label>
                <LocaleDatePicker
                  locale={locale}
                  withTime
                  value={scheduledAt}
                  onChange={(value) => setScheduledAt(value ?? "")}
                  aria-label={t("campaigns.schedule")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("broadcast.text")}</Label>
              <Textarea
                className="min-h-28"
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

            <fieldset className="space-y-3 rounded-lg border border-border/60 p-3">
              <legend className="px-1 text-sm font-medium">{t("campaigns.audience")}</legend>
              <RadioGroup value={audience} onValueChange={(v) => setAudience(v as "all" | "imported")}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="aud-all" />
                  <Label htmlFor="aud-all" className="cursor-pointer font-normal">
                    {t("campaigns.audienceAll")}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="imported" id="aud-imp" />
                  <Label htmlFor="aud-imp" className="cursor-pointer font-normal">
                    {t("campaigns.audienceImported")}
                  </Label>
                </div>
              </RadioGroup>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={launchNow} onCheckedChange={(v) => setLaunchNow(v === true)} />
                {t("campaigns.launchNow")}
              </label>
            </fieldset>

            <Button type="submit" disabled={create.isPending || !name.trim() || (needsMedia && !media)}>
              {launchNow ? t("campaigns.submit") : t("campaigns.scheduleSubmit")}
            </Button>
          </form>
        </section>

        {/* List + import */}
        <div className="space-y-4">
          <section className="space-y-3 rounded-xl border border-border/80 bg-card p-5 shadow-soft">
            <div className="flex items-start gap-3">
              <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
                <ListOrdered className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold">{t("campaigns.list")}</h2>
                <p className="text-muted-foreground text-sm">{t("campaigns.listHint")}</p>
              </div>
            </div>

            <ScrollTable className="rounded-lg border border-border/70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-start text-xs text-muted-foreground">
                    <th className="p-2.5 font-medium">{t("campaigns.colName")}</th>
                    <th className="p-2.5 font-medium">{t("campaigns.colStatus")}</th>
                    <th className="p-2.5 font-medium">{t("campaigns.colSent")}</th>
                    <th className="p-2.5 font-medium">{t("campaigns.colFailed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-muted-foreground p-6 text-center text-sm">
                        {t("campaigns.empty")}
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => (
                      <tr key={it.id} className="border-t border-border/60">
                        <td className="p-2.5">
                          <div className="font-medium">{it.name}</div>
                          {it.type ? (
                            <div className="text-muted-foreground text-xs">{t(`broadcast.types.${it.type}` as "broadcast.types.text")}</div>
                          ) : null}
                        </td>
                        <td className="p-2.5">
                          <Badge variant={it.status === "running" ? "default" : "secondary"}>
                            {enumLabel("job_status", it.status)}
                          </Badge>
                        </td>
                        <td className="p-2.5 tabular-nums">{formatNumber(it.sent, locale)}</td>
                        <td className="p-2.5 tabular-nums">{formatNumber(it.failed, locale)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </ScrollTable>
          </section>

          <section className="space-y-3 rounded-xl border border-border/80 bg-card p-5 shadow-soft">
            <div className="flex items-start gap-3">
              <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Upload className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{t("campaigns.import")}</h2>
                <p className="text-muted-foreground text-sm">{t("campaigns.importHint")}</p>
              </div>
            </div>
            <Textarea
              className="min-h-28 font-mono text-xs"
              placeholder={t("campaigns.csvPlaceholder")}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={importCsv.isPending || !csv.trim()}
              onClick={() => importCsv.mutate()}
            >
              <Upload className="size-4" />
              {t("campaigns.import")}
            </Button>
          </section>
        </div>
      </div>
    </div>
  )
}
