"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { FormSettingsSkeleton } from "@/components/TableListSkeleton"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { BotSection, textareaClass } from "../lib/bot-admin-ui"
import type { BotSettings } from "../lib/bot-settings"
import { settingsPath } from "../lib/bot-settings"
import type { LiveBotProvider } from "../lib/platforms"

export function BotNotificationsPanel({ provider }: { provider: LiveBotProvider }) {
  const t = useTranslations("bots")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [cascadeOn, setCascadeOn] = useState(false)
  const [cascadeTemplate, setCascadeTemplate] = useState("")
  const [cascadeStatuses, setCascadeStatuses] = useState("processing,completed")
  const [notifyCustomer, setNotifyCustomer] = useState(true)
  const [abandon, setAbandon] = useState({
    enabled: false,
    delay_hours: 24,
    message: "",
    delay_hours_2: 48,
    message_2: "",
    delay_hours_3: 72,
    message_3: "",
  })

  const q = useQuery({
    queryKey: ["bots", provider, "settings"],
    queryFn: () => api<BotSettings>(settingsPath(provider)),
  })

  useEffect(() => {
    if (!q.data) return
    const m = q.data.meta ?? {}
    setCascadeOn(Boolean(m.addons?.order_cascade))
    const cascade = (m.cascade ?? {}) as Record<string, unknown>
    setCascadeTemplate(String(cascade.template ?? ""))
    setCascadeStatuses(String(cascade.statuses ?? "processing,completed"))
    setNotifyCustomer(cascade.notify_customer !== false)
    const n = (m.notifications ?? {}) as Record<string, unknown>
    const ab = (n.abandon_cart ?? {}) as Record<string, unknown>
    setAbandon({
      enabled: Boolean(ab.enabled),
      delay_hours: Number(ab.delay_hours ?? 24),
      message: String(ab.message ?? ""),
      delay_hours_2: Number(ab.delay_hours_2 ?? 48),
      message_2: String(ab.message_2 ?? ""),
      delay_hours_3: Number(ab.delay_hours_3 ?? 72),
      message_3: String(ab.message_3 ?? ""),
    })
  }, [q.data])

  const save = useMutation({
    mutationFn: () =>
      api(settingsPath(provider), {
        method: "PUT",
        json: {
          meta: {
            ...(q.data?.meta ?? {}),
            addons: { ...(q.data?.meta?.addons ?? {}), order_cascade: cascadeOn },
            cascade: {
              template: cascadeTemplate,
              statuses: cascadeStatuses,
              notify_customer: notifyCustomer,
            },
            notifications: {
              ...((q.data?.meta?.notifications as Record<string, unknown>) ?? {}),
              abandon_cart: abandon,
            },
          },
        },
      }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await qc.invalidateQueries({ queryKey: ["bots", provider, "settings"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (q.isLoading) return <FormSettingsSkeleton cards={2} fieldsPerCard={4} />

  return (
    <div className="space-y-4">
      <BotSection title={t("cascade.title")} description={t("cascade.hint")}>
        <div className="grid max-w-xl gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={cascadeOn} onCheckedChange={(v) => setCascadeOn(Boolean(v))} />
            {t("addons.order_cascade")}
          </label>
          <div className="space-y-1">
            <Label>{t("cascade.template")}</Label>
            <Input value={cascadeTemplate} onChange={(e) => setCascadeTemplate(e.target.value)} placeholder={t("cascade.templatePh")} />
          </div>
          <div className="space-y-1">
            <Label>{t("cascade.statuses")}</Label>
            <Input value={cascadeStatuses} onChange={(e) => setCascadeStatuses(e.target.value)} placeholder={t("cascade.statusesPh")} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={notifyCustomer} onCheckedChange={(v) => setNotifyCustomer(Boolean(v))} />
            {t("cascade.notifyCustomer")}
          </label>
        </div>
      </BotSection>

      <BotSection title={t("notifications.abandonTitle")} description={t("notifications.abandonHint")} badge={t("hub.partial")}>
        <div className="grid max-w-xl gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={abandon.enabled}
              onCheckedChange={(v) => setAbandon((p) => ({ ...p, enabled: Boolean(v) }))}
            />
            {t("notifications.abandonEnabled")}
          </label>
          <Input
            type="number"
            min={1}
            value={abandon.delay_hours}
            onChange={(e) => setAbandon((p) => ({ ...p, delay_hours: Number(e.target.value) || 24 }))}
          />
          <textarea
            className={textareaClass}
            value={abandon.message}
            onChange={(e) => setAbandon((p) => ({ ...p, message: e.target.value }))}
            placeholder={t("notifications.abandonMessage")}
          />
          <p className="text-muted-foreground text-xs">{t("notifications.stage2")}</p>
          <Input
            type="number"
            min={1}
            value={abandon.delay_hours_2}
            onChange={(e) => setAbandon((p) => ({ ...p, delay_hours_2: Number(e.target.value) || 48 }))}
          />
          <textarea
            className={textareaClass}
            value={abandon.message_2}
            onChange={(e) => setAbandon((p) => ({ ...p, message_2: e.target.value }))}
          />
          <p className="text-muted-foreground text-xs">{t("notifications.stage3")}</p>
          <Input
            type="number"
            min={1}
            value={abandon.delay_hours_3}
            onChange={(e) => setAbandon((p) => ({ ...p, delay_hours_3: Number(e.target.value) || 72 }))}
          />
          <textarea
            className={textareaClass}
            value={abandon.message_3}
            onChange={(e) => setAbandon((p) => ({ ...p, message_3: e.target.value }))}
          />
        </div>
      </BotSection>

      <Button disabled={save.isPending} onClick={() => save.mutate()}>
        {tCommon("save")}
      </Button>
    </div>
  )
}
