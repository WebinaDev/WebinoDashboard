"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Stage = { delay_hours: number; message: string; coupon_type: "none" | "percent" | "fixed"; coupon_amount: number; coupon_expires_days: number }
type Settings = { enabled: boolean; channels: { bot: boolean; sms: boolean }; min_subtotal: number; stages: Stage[] }
type Row = {
  id: number
  user: { name: string; phone: string | null } | null
  channel: string
  items: number
  subtotal_minor: number
  last_activity: string | null
  recovery_stage: number
}

export default function AbandonedCartsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("abandoned_carts")
  const qc = useQueryClient()
  const sq = useQuery({ queryKey: ["abandoned-carts", "settings"], queryFn: () => api<{ data: Settings }>("/api/v1/marketing/abandoned-carts/settings") })
  const lq = useQuery({ queryKey: ["abandoned-carts", "list"], queryFn: () => api<{ data: Row[] }>("/api/v1/marketing/abandoned-carts") })
  const [draft, setDraft] = useState<Settings | null>(null)
  useEffect(() => {
    if (sq.data) setDraft(sq.data.data)
  }, [sq.data])

  const save = useMutation({
    mutationFn: (s: Settings) => api("/api/v1/marketing/abandoned-carts/settings", { method: "PUT", json: s }),
    onSuccess: async () => {
      toast.success(t("saved"))
      await qc.invalidateQueries({ queryKey: ["abandoned-carts"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const run = useMutation({
    mutationFn: () => api<{ data: { sent: number } }>("/api/v1/marketing/abandoned-carts/run", { method: "POST" }),
    onSuccess: async (r) => {
      toast.success(t("ran", { n: r.data.sent }))
      await qc.invalidateQueries({ queryKey: ["abandoned-carts", "list"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const setStage = (i: number, patch: Partial<Stage>) =>
    setDraft((d) => (d ? { ...d, stages: d.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : d))

  return (
    <PageShell title={t("title")} description={t("description")}>
      {draft ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("settings")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
                {t("enabled")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={draft.channels.bot} onCheckedChange={(v) => setDraft({ ...draft, channels: { ...draft.channels, bot: v } })} />
                {t("channel_bot")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={draft.channels.sms} onCheckedChange={(v) => setDraft({ ...draft, channels: { ...draft.channels, sms: v } })} />
                {t("channel_sms")}
              </label>
              <div className="grid max-w-xs gap-1">
                <Label>{t("min_subtotal")}</Label>
                <Input type="number" min={0} value={draft.min_subtotal} onChange={(e) => setDraft({ ...draft, min_subtotal: Number(e.target.value) || 0 })} />
              </div>
              <p className="text-muted-foreground text-xs">{t("vars")}</p>
              {draft.stages.map((s, i) => (
                <div key={i} className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">{t("stage", { n: i + 1 })}</p>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <div className="grid gap-1">
                      <Label className="text-xs">{t("delay_hours")}</Label>
                      <Input type="number" min={1} value={s.delay_hours} onChange={(e) => setStage(i, { delay_hours: Number(e.target.value) || 1 })} />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs">{t("coupon_type")}</Label>
                      <select
                        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                        value={s.coupon_type}
                        onChange={(e) => setStage(i, { coupon_type: e.target.value as Stage["coupon_type"] })}
                      >
                        <option value="none">{t("coupon_none")}</option>
                        <option value="percent">{t("coupon_percent")}</option>
                        <option value="fixed">{t("coupon_fixed")}</option>
                      </select>
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs">{t("coupon_amount")}</Label>
                      <Input type="number" min={0} value={s.coupon_amount} onChange={(e) => setStage(i, { coupon_amount: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs">{t("coupon_days")}</Label>
                      <Input type="number" min={1} value={s.coupon_expires_days} onChange={(e) => setStage(i, { coupon_expires_days: Number(e.target.value) || 1 })} />
                    </div>
                  </div>
                  <textarea
                    className="border-input bg-background min-h-20 w-full rounded-md border p-2 text-sm"
                    value={s.message}
                    onChange={(e) => setStage(i, { message: e.target.value })}
                  />
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button disabled={save.isPending} onClick={() => save.mutate(draft)}>
                  {t("save")}
                </Button>
                <Button variant="outline" disabled={run.isPending || !draft.enabled} onClick={() => run.mutate()}>
                  {t("run_now")}
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("list")}</CardTitle>
            </CardHeader>
            <CardContent>
              {(lq.data?.data ?? []).length ? (
                <ul className="divide-y text-sm">
                  {(lq.data?.data ?? []).map((r) => (
                    <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>
                        {r.user ? `${r.user.name} ${r.user.phone ?? ""}` : t("guest")} · {r.channel}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {t("row", { items: r.items, total: r.subtotal_minor.toLocaleString("fa-IR"), stage: r.recovery_stage })}
                        {r.last_activity ? ` · ${new Date(r.last_activity).toLocaleString("fa-IR")}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">{t("empty")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </PageShell>
  )
}
