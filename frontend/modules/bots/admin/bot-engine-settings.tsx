"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Provider = "bale" | "telegram"
type Meta = Record<string, unknown>
type SettingsPayload = { meta?: Meta }
type FaqItem = { q: string; a: string; keywords?: string }
type ChannelPost = {
  id: number
  text: string | null
  status: string
  scheduled_at: string | null
  published_at: string | null
  source: string
  last_error: string | null
}
type OutboxRow = { id: number; chat_id: string; method: string; status: string; attempts: number; last_error: string | null }

const TEMPLATE_KEYS = ["welcome", "order_created", "paid", "cart_empty", "ask_contact", "ask_address", "unknown"] as const
const textareaClass = "border-input bg-background min-h-20 w-full rounded-md border p-2 text-sm"

const faqToText = (items: unknown) =>
  (Array.isArray(items) ? (items as FaqItem[]) : [])
    .map((i) => [i.q, i.a, i.keywords ?? ""].join(" | ").replace(/ \| $/, ""))
    .join("\n")
const textToFaq = (text: string): FaqItem[] =>
  text
    .split("\n")
    .map((l) => l.split("|").map((x) => x.trim()))
    .filter((p) => p[0] && p[1])
    .map((p) => ({ q: p[0], a: p[1], keywords: p[2] ?? "" }))

/** In-bot shop engine options: admins, FAQ, templates, channel publisher, club, retry queue. */
export function BotEngineSettings({ provider, addons }: { provider: Provider; addons: Record<string, boolean> }) {
  const t = useTranslations("bots.engine")
  const qc = useQueryClient()
  const key = ["bots", provider, "settings"]
  const q = useQuery({ queryKey: key, queryFn: () => api<SettingsPayload>(`/api/v1/bots/${provider}/settings`) })

  const [admins, setAdmins] = useState("")
  const [faq, setFaq] = useState("")
  const [templates, setTemplates] = useState<Record<string, string>>({})
  const [channelId, setChannelId] = useState("")
  const [channelTpl, setChannelTpl] = useState("")
  const [autoNew, setAutoNew] = useState(false)
  const [syncEdits, setSyncEdits] = useState(false)
  const [autoDelay, setAutoDelay] = useState(0)
  const [dailyPoints, setDailyPoints] = useState(0)

  useEffect(() => {
    const m = (q.data?.meta ?? {}) as Meta
    const a = m.admin_chat_ids
    setAdmins(Array.isArray(a) ? a.join(", ") : String(a ?? ""))
    setFaq(faqToText(m.faq))
    setTemplates({ ...((m.templates as Record<string, string>) ?? {}) })
    const ch = (m.channel ?? {}) as Record<string, unknown>
    setChannelId(String(ch.channel_id ?? ""))
    setChannelTpl(String(ch.template ?? ""))
    setAutoNew(Boolean(ch.auto_new_products))
    setSyncEdits(Boolean(ch.sync_edits))
    setAutoDelay(Number(ch.auto_delay_minutes ?? 0))
    setDailyPoints(Number(((m.club ?? {}) as Record<string, unknown>).daily_points ?? 0))
  }, [q.data])

  const save = useMutation({
    mutationFn: () =>
      api(`/api/v1/bots/${provider}/settings`, {
        method: "PUT",
        json: {
          meta: {
            ...(q.data?.meta ?? {}),
            admin_chat_ids: admins,
            faq: textToFaq(faq),
            templates,
            channel: {
              channel_id: channelId.trim(),
              template: channelTpl,
              auto_new_products: autoNew,
              sync_edits: syncEdits,
              auto_delay_minutes: autoDelay,
            },
            club: { daily_points: dailyPoints },
          },
        },
      }),
    onSuccess: async () => {
      toast.success(t("saved"))
      await qc.invalidateQueries({ queryKey: key })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  return (
    <>
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{t("hint")}</p>
          <div className="space-y-1">
            <Label>{t("admins")}</Label>
            <Input dir="ltr" value={admins} onChange={(e) => setAdmins(e.target.value)} placeholder="12345678, 87654321" />
            <p className="text-muted-foreground text-xs">{t("adminsHint")}</p>
          </div>
          {addons.faq ? (
            <div className="space-y-1">
              <Label>{t("faq")}</Label>
              <textarea className={textareaClass} value={faq} onChange={(e) => setFaq(e.target.value)} placeholder={t("faqPh")} />
            </div>
          ) : null}
          {addons.loyalty ? (
            <div className="space-y-1">
              <Label>{t("dailyPoints")}</Label>
              <Input type="number" min={0} value={dailyPoints} onChange={(e) => setDailyPoints(Number(e.target.value) || 0)} />
            </div>
          ) : null}
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">{t("templates")}</summary>
            <p className="text-muted-foreground my-2 text-xs">{t("templatesHint")}</p>
            <div className="space-y-3">
              {TEMPLATE_KEYS.map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{t(`tpl.${k}`)}</Label>
                  <textarea
                    className={textareaClass}
                    value={templates[k] ?? ""}
                    onChange={(e) => setTemplates((prev) => ({ ...prev, [k]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </details>
          {addons.channel_publish ? (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">{t("channel")}</p>
              <div className="space-y-1">
                <Label className="text-xs">{t("channelId")}</Label>
                <Input dir="ltr" value={channelId} onChange={(e) => setChannelId(e.target.value)} placeholder="@mychannel" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("channelTpl")}</Label>
                <textarea className={textareaClass} value={channelTpl} onChange={(e) => setChannelTpl(e.target.value)} placeholder={"🆕 {name}\n💰 {price}\n\n{description}"} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={autoNew} onCheckedChange={(v) => setAutoNew(Boolean(v))} />
                {t("autoNew")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={syncEdits} onCheckedChange={(v) => setSyncEdits(Boolean(v))} />
                {t("syncEdits")}
              </label>
              <div className="space-y-1">
                <Label className="text-xs">{t("autoDelay")}</Label>
                <Input type="number" min={0} value={autoDelay} onChange={(e) => setAutoDelay(Number(e.target.value) || 0)} />
              </div>
            </div>
          ) : null}
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {t("save")}
          </Button>
        </CardContent>
      </Card>
      {addons.channel_publish ? <ChannelPostsCard provider={provider} /> : null}
      <OutboxCard provider={provider} />
    </>
  )
}

function ChannelPostsCard({ provider }: { provider: Provider }) {
  const t = useTranslations("bots.engine")
  const qc = useQueryClient()
  const key = ["bots", provider, "channel-posts"]
  const q = useQuery({ queryKey: key, queryFn: () => api<{ data: ChannelPost[] }>(`/api/v1/bots/${provider}/channel-posts`) })
  const [text, setText] = useState("")
  const [productId, setProductId] = useState("")
  const [when, setWhen] = useState("")
  const refresh = () => qc.invalidateQueries({ queryKey: key })
  const create = useMutation({
    mutationFn: () =>
      api(`/api/v1/bots/${provider}/channel-posts`, {
        method: "POST",
        json: {
          text: text || null,
          product_id: productId ? Number(productId) : null,
          scheduled_at: when ? new Date(when).toISOString() : null,
        },
      }),
    onSuccess: async () => {
      setText("")
      setProductId("")
      setWhen("")
      await refresh()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const act = useMutation({
    mutationFn: ({ id, op }: { id: number; op: "publish" | "delete" }) =>
      op === "delete"
        ? api(`/api/v1/bots/${provider}/channel-posts/${id}`, { method: "DELETE" })
        : api(`/api/v1/bots/${provider}/channel-posts/${id}/publish`, { method: "POST" }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="text-base">{t("posts")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea className={textareaClass} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("postText")} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Input dir="ltr" value={productId} onChange={(e) => setProductId(e.target.value)} placeholder={t("productId")} />
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <Button disabled={create.isPending || (!text && !productId)} onClick={() => create.mutate()}>
          {when ? t("schedule") : t("publishNow")}
        </Button>
        <ul className="divide-y text-sm">
          {(q.data?.data ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 flex-1 truncate">
                {p.text ?? "—"}{" "}
                <span className="text-muted-foreground text-xs">
                  ({t(`status.${p.status}`)}{p.source === "auto" ? ` · ${t("auto")}` : ""})
                </span>
                {p.last_error ? <span className="text-destructive block text-xs">{p.last_error}</span> : null}
              </span>
              <span className="flex gap-1">
                {p.status !== "published" ? (
                  <Button size="sm" variant="outline" onClick={() => act.mutate({ id: p.id, op: "publish" })}>
                    {t("publishNow")}
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: p.id, op: "delete" })}>
                  {t("delete")}
                </Button>
              </span>
            </li>
          ))}
          {q.data && !q.data.data.length ? <li className="text-muted-foreground py-2">{t("empty")}</li> : null}
        </ul>
      </CardContent>
    </Card>
  )
}

function OutboxCard({ provider }: { provider: Provider }) {
  const t = useTranslations("bots.engine")
  const qc = useQueryClient()
  const key = ["bots", provider, "outbox"]
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<{ data: OutboxRow[] }>(`/api/v1/bots/${provider}/outbox?status=dead`),
  })
  const retry = useMutation({
    mutationFn: (id: number) => api(`/api/v1/bots/${provider}/outbox/${id}/retry`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })
  const rows = q.data?.data ?? []
  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="text-base">{t("outbox")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground text-xs">{t("outboxHint")}</p>
        {rows.length ? (
          rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border-b py-1">
              <span dir="ltr" className="truncate text-xs">
                {r.chat_id} · {r.method} · {r.attempts}× · {r.last_error ?? ""}
              </span>
              <Button size="sm" variant="outline" onClick={() => retry.mutate(r.id)}>
                {t("retry")}
              </Button>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground">{t("outboxEmpty")}</p>
        )}
      </CardContent>
    </Card>
  )
}
