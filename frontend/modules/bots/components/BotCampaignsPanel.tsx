"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { FormSettingsSkeleton } from "@/components/TableListSkeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import type { BotProvider } from "./BotProviderSwitcher"

type CampaignItem = {
  id: number
  name: string
  status: string
  sent: number
  failed: number
}

type CampaignsResponse = {
  enabled: boolean
  items: CampaignItem[]
}

export function BotCampaignsPanel({ provider }: { provider: BotProvider }) {
  const t = useTranslations("bots")
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [scheduledAt, setScheduledAt] = useState("")
  const [type, setType] = useState("text")
  const [text, setText] = useState("")
  const [media, setMedia] = useState("")
  const [audience, setAudience] = useState<"all" | "imported">("all")
  const [csv, setCsv] = useState("")
  const [error, setError] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ["bots", provider, "campaigns"],
    queryFn: () => api<CampaignsResponse>(`/api/v1/bots/${provider}/campaigns`),
  })

  const create = useMutation({
    mutationFn: () =>
      api(`/api/v1/bots/${provider}/campaigns`, {
        method: "POST",
        json: {
          name,
          scheduled_at: scheduledAt ? Math.floor(new Date(scheduledAt).getTime() / 1000) : Math.floor(Date.now() / 1000),
          type,
          text,
          media,
          audience,
          launch_now: true,
        },
      }),
    onSuccess: async () => {
      setError(null)
      setName("")
      setText("")
      await qc.invalidateQueries({ queryKey: ["bots", provider, "campaigns"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const importCsv = useMutation({
    mutationFn: () => api(`/api/v1/bots/${provider}/users/import`, { method: "POST", json: { csv } }),
    onSuccess: () => setError(null),
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  if (q.isLoading) return <FormSettingsSkeleton cards={2} fieldsPerCard={4} />
  const items = q.data?.items ?? []

  return (
    <div className="space-y-8">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {!q.data?.enabled ? (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm">{t("campaigns.disabled")}</p>
      ) : null}

      <form
        className="mx-auto max-w-xl space-y-4 rounded-lg border border-border p-4 shadow-soft"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        <div>
          <Label>{t("campaigns.name")}</Label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label>{t("campaigns.schedule")}</Label>
          <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-1" />
        </div>
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
          <Label>{t("broadcast.text")}</Label>
          <Textarea className="min-h-20" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div>
          <Label>{t("broadcast.media")}</Label>
          <Input value={media} onChange={(e) => setMedia(e.target.value)} className="mt-1 font-mono text-sm" />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("campaigns.audience")}</legend>
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
        </fieldset>
        <Button type="submit" disabled={create.isPending || !name}>
          {t("campaigns.submit")}
        </Button>
      </form>

      <section className="mx-auto max-w-xl space-y-3 rounded-lg border border-border p-4 shadow-soft">
        <h3 className="text-sm font-semibold">{t("campaigns.import")}</h3>
        <Textarea className="min-h-24 font-mono text-xs" placeholder="chat_id,phone,name" value={csv} onChange={(e) => setCsv(e.target.value)} />
        <Button type="button" variant="secondary" disabled={importCsv.isPending || !csv.trim()} onClick={() => importCsv.mutate()}>
          {t("campaigns.import")}
        </Button>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">{t("campaigns.list")}</h3>
        <div className="overflow-x-auto rounded-lg border border-border shadow-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start text-xs text-muted-foreground">
                <th className="p-2">{t("campaigns.colName")}</th>
                <th className="p-2">{t("campaigns.colStatus")}</th>
                <th className="p-2">{t("campaigns.colSent")}</th>
                <th className="p-2">{t("campaigns.colFailed")}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted-foreground p-3">
                    {t("campaigns.empty")}
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="p-2">{it.name}</td>
                    <td className="p-2">{it.status}</td>
                    <td className="p-2">{it.sent}</td>
                    <td className="p-2">{it.failed}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
