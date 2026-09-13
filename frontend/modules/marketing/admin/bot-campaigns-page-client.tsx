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

type CampaignItem = {
  id: number
  name: string
  status: string
  scheduled_at?: number | null
  sent: number
  failed: number
}

type CampaignsResponse = {
  enabled: boolean
  items: CampaignItem[]
}

export default function BotCampaignsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("bots_admin")
  const qc = useQueryClient()
  const [provider, setProvider] = useState<Provider>("bale")
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

  const items = q.data?.items ?? []

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">{t("campaigns.title")}</h1>
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">{t("campaigns.create")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>{t("campaigns.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("campaigns.schedule")}</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("broadcast.type")}</Label>
            <select className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="text">text</option>
              <option value="photo">photo</option>
              <option value="video">video</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t("broadcast.text")}</Label>
            <Textarea className="min-h-20" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("broadcast.media")}</Label>
            <Input className="font-mono text-sm" value={media} onChange={(e) => setMedia(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("campaigns.audience")}</Label>
            <select className={selectClass} value={audience} onChange={(e) => setAudience(e.target.value as "all" | "imported")}>
              <option value="all">{t("campaigns.audienceAll")}</option>
              <option value="imported">{t("campaigns.audienceImported")}</option>
            </select>
          </div>
          <Button disabled={create.isPending || !name} onClick={() => create.mutate()}>
            {t("campaigns.submit")}
          </Button>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">{t("campaigns.import")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            className="min-h-24 font-mono text-xs"
            placeholder="chat_id,phone,name"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          <Button variant="secondary" disabled={importCsv.isPending || !csv.trim()} onClick={() => importCsv.mutate()}>
            {t("campaigns.import")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("campaigns.list")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
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
                    <td colSpan={4} className="p-3 text-muted-foreground">{t("campaigns.empty")}</td>
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
        </CardContent>
      </Card>
    </div>
  )
}
