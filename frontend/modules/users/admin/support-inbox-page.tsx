"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { MediaPickerField } from "@/components/content/MediaPickerField"
import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { LiveChatPanel } from "./live-chat-panel"
import TicketsPage from "./tickets-page"

type OnlineSettings = {
  enabled?: boolean
  position?: "bottom-right" | "bottom-left"
  primary_color?: string
  launcher_label_fa?: string
  launcher_label_en?: string
  greeting_fa?: string
  greeting_en?: string
  avatar_url?: string | null
  show_agent_name?: boolean
  agent_name_fa?: string
  agent_name_en?: string
  hours?: {
    enabled?: boolean
    timezone?: string
    schedule?: Record<string, [string, string] | null>
  }
  offline?: {
    message_fa?: string
    message_en?: string
    form_enabled?: boolean
    create_ticket?: boolean
    default_department_id?: number | null
  }
  channels?: Record<string, { enabled?: boolean; url?: string; number?: string; address?: string }>
  pages?: { show_on_all?: boolean; hide_paths?: string[] }
}

type Dept = { id: number; name_fa: string; name_en?: string | null }

const DAYS = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"] as const

export default function SupportInboxPage({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("online_support")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const qc = useQueryClient()
  const search = useSearchParams()
  const [tab, setTab] = useState(() => {
    const q = search?.get("tab")
    return q === "live" || q === "widget" || q === "hours" || q === "channels" ? q : "inbox"
  })
  const [draft, setDraft] = useState<OnlineSettings>({})

  const settings = useQuery({
    queryKey: ["support", "settings"],
    queryFn: () => api<{ online: OnlineSettings; tickets: unknown }>("/api/v1/support/settings"),
  })
  const deps = useQuery({
    queryKey: ["support", "departments"],
    queryFn: () => api<{ items: Dept[] }>("/api/v1/support/departments"),
  })

  useEffect(() => {
    if (settings.data?.online) setDraft(settings.data.online)
  }, [settings.data])

  const save = useMutation({
    mutationFn: () => api("/api/v1/support/settings", { method: "PUT", json: { online: draft } }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["support", "settings"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const setChannel = (key: string, patch: Record<string, unknown>) => {
    setDraft((d) => ({
      ...d,
      channels: {
        ...(d.channels ?? {}),
        [key]: { ...(d.channels?.[key] ?? {}), ...patch },
      },
    }))
  }

  const dayLabel = (d: string) => t(`day_${d}` as "day_sat")
  const deptName = (d: Dept) => (locale.startsWith("fa") ? d.name_fa : d.name_en || d.name_fa)

  return (
    <PageShell
      title={t("title")}
      description={t("subtitle")}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/tickets">{t("all_tickets")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/tickets/settings">{t("ticket_settings")}</Link>
          </Button>
        </div>
      }
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex h-auto flex-wrap">
          <TabsTrigger value="inbox">{t("tab_inbox")}</TabsTrigger>
          <TabsTrigger value="live">{t("tab_live")}</TabsTrigger>
          <TabsTrigger value="widget">{t("tab_widget")}</TabsTrigger>
          <TabsTrigger value="hours">{t("tab_hours")}</TabsTrigger>
          <TabsTrigger value="channels">{t("tab_channels")}</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox">
          <TicketsPage route={route} forceStatus="open" embedded />
        </TabsContent>

        <TabsContent value="live">
          <LiveChatPanel />
        </TabsContent>

        <TabsContent value="widget" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("appearance")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-2 md:col-span-2">
                <Switch checked={Boolean(draft.enabled)} onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))} />
                <Label>{t("enabled")}</Label>
                {draft.enabled ? <Badge>{t("live")}</Badge> : <Badge variant="outline">{t("off")}</Badge>}
              </div>
              <div className="space-y-1">
                <Label>{t("position")}</Label>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={draft.position ?? "bottom-right"}
                  onChange={(e) => setDraft((d) => ({ ...d, position: e.target.value as OnlineSettings["position"] }))}
                >
                  <option value="bottom-right">{t("pos_bottom_right")}</option>
                  <option value="bottom-left">{t("pos_bottom_left")}</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>{t("primary_color")}</Label>
                <Input
                  type="color"
                  value={draft.primary_color ?? "#0f766e"}
                  onChange={(e) => setDraft((d) => ({ ...d, primary_color: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("launcher_fa")}</Label>
                <Input
                  value={draft.launcher_label_fa ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, launcher_label_fa: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("launcher_en")}</Label>
                <Input
                  value={draft.launcher_label_en ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, launcher_label_en: e.target.value }))}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>{t("greeting_fa")}</Label>
                <Textarea
                  rows={2}
                  value={draft.greeting_fa ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, greeting_fa: e.target.value }))}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>{t("greeting_en")}</Label>
                <Textarea
                  rows={2}
                  value={draft.greeting_en ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, greeting_en: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("agent_name_fa")}</Label>
                <Input
                  value={draft.agent_name_fa ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, agent_name_fa: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("agent_name_en")}</Label>
                <Input
                  value={draft.agent_name_en ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, agent_name_en: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <MediaPickerField
                  label={t("avatar")}
                  accept="image"
                  imageUrl={draft.avatar_url ?? ""}
                  onPick={(item) => setDraft((d) => ({ ...d, avatar_url: item.url }))}
                  onClear={() => setDraft((d) => ({ ...d, avatar_url: null }))}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>{t("hide_paths")}</Label>
                <Input
                  value={(draft.pages?.hide_paths ?? []).join(", ")}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      pages: {
                        ...(d.pages ?? {}),
                        hide_paths: e.target.value
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      },
                    }))
                  }
                  placeholder="/checkout, /cart"
                />
              </div>
              <div className="md:col-span-2">
                <Button type="button" disabled={save.isPending} onClick={() => void save.mutateAsync()}>
                  {tCommon("save")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hours" className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={Boolean(draft.hours?.enabled)}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, hours: { ...(d.hours ?? {}), enabled: v } }))}
                />
                <Label>{t("hours_enabled")}</Label>
              </div>
              <div className="space-y-1 max-w-sm">
                <Label>{t("timezone")}</Label>
                <Input
                  value={draft.hours?.timezone ?? "Asia/Tehran"}
                  onChange={(e) => setDraft((d) => ({ ...d, hours: { ...(d.hours ?? {}), timezone: e.target.value } }))}
                />
              </div>
              <div className="space-y-2">
                {DAYS.map((day) => {
                  const range = draft.hours?.schedule?.[day]
                  const open = Array.isArray(range)
                  return (
                    <div key={day} className="flex flex-wrap items-center gap-2">
                      <label className="flex w-28 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={open}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              hours: {
                                ...(d.hours ?? {}),
                                schedule: {
                                  ...(d.hours?.schedule ?? {}),
                                  [day]: e.target.checked ? (["09:00", "21:00"] as [string, string]) : null,
                                },
                              },
                            }))
                          }
                        />
                        {dayLabel(day)}
                      </label>
                      {open ? (
                        <>
                          <Input
                            className="w-28"
                            type="time"
                            value={range?.[0] ?? "09:00"}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                hours: {
                                  ...(d.hours ?? {}),
                                  schedule: {
                                    ...(d.hours?.schedule ?? {}),
                                    [day]: [e.target.value, range?.[1] ?? "21:00"],
                                  },
                                },
                              }))
                            }
                          />
                          <span className="text-muted-foreground text-xs">–</span>
                          <Input
                            className="w-28"
                            type="time"
                            value={range?.[1] ?? "21:00"}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                hours: {
                                  ...(d.hours ?? {}),
                                  schedule: {
                                    ...(d.hours?.schedule ?? {}),
                                    [day]: [range?.[0] ?? "09:00", e.target.value],
                                  },
                                },
                              }))
                            }
                          />
                        </>
                      ) : (
                        <span className="text-muted-foreground text-xs">{t("closed_day")}</span>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label>{t("offline_message_fa")}</Label>
                  <Textarea
                    rows={2}
                    value={draft.offline?.message_fa ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, offline: { ...(d.offline ?? {}), message_fa: e.target.value } }))
                    }
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>{t("offline_message_en")}</Label>
                  <Textarea
                    rows={2}
                    value={draft.offline?.message_en ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, offline: { ...(d.offline ?? {}), message_en: e.target.value } }))
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={draft.offline?.form_enabled ?? true}
                    onCheckedChange={(v) =>
                      setDraft((d) => ({ ...d, offline: { ...(d.offline ?? {}), form_enabled: v } }))
                    }
                  />
                  <Label>{t("offline_form")}</Label>
                </div>
                <div className="space-y-1">
                  <Label>{t("default_department")}</Label>
                  <select
                    className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                    value={draft.offline?.default_department_id ? String(draft.offline.default_department_id) : ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        offline: {
                          ...(d.offline ?? {}),
                          default_department_id: e.target.value ? Number(e.target.value) : null,
                        },
                      }))
                    }
                  >
                    <option value="">{tCommon("all")}</option>
                    {(deps.data?.items ?? []).map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        {deptName(d)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Button type="button" disabled={save.isPending} onClick={() => void save.mutateAsync()}>
                {tCommon("save")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels" className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-4">
              {(["ticket", "live_chat", "telegram", "bale", "whatsapp", "phone", "email"] as const).map((ch) => (
                <div key={ch} className="grid gap-2 rounded-md border p-3 md:grid-cols-[8rem_1fr_auto] md:items-center">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={Boolean(draft.channels?.[ch]?.enabled)}
                      onCheckedChange={(v) => setChannel(ch, { enabled: v })}
                    />
                    <Label>{t(`channel_${ch}` as "channel_ticket")}</Label>
                  </div>
                  {ch === "telegram" || ch === "bale" || ch === "whatsapp" ? (
                    <Input
                      placeholder="https://"
                      value={draft.channels?.[ch]?.url ?? ""}
                      onChange={(e) => setChannel(ch, { url: e.target.value })}
                    />
                  ) : ch === "phone" ? (
                    <Input
                      placeholder="+98..."
                      value={draft.channels?.[ch]?.number ?? ""}
                      onChange={(e) => setChannel(ch, { number: e.target.value })}
                    />
                  ) : ch === "email" ? (
                    <Input
                      placeholder="support@example.com"
                      value={draft.channels?.[ch]?.address ?? ""}
                      onChange={(e) => setChannel(ch, { address: e.target.value })}
                    />
                  ) : ch === "live_chat" ? (
                    <p className="text-muted-foreground text-xs">{t("channel_live_chat_hint")}</p>
                  ) : (
                    <p className="text-muted-foreground text-xs">{t("channel_ticket_hint")}</p>
                  )}
                </div>
              ))}
              <Button type="button" disabled={save.isPending} onClick={() => void save.mutateAsync()}>
                {tCommon("save")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}
