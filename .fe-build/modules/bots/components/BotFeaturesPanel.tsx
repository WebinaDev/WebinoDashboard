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
import { ADDON_KEYS, type BotSettings } from "../lib/bot-settings"
import { settingsPath } from "../lib/bot-settings"
import type { LiveBotProvider } from "../lib/platforms"

export function BotFeaturesPanel({ provider }: { provider: LiveBotProvider }) {
  const t = useTranslations("bots")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [addons, setAddons] = useState<Record<string, boolean>>({})
  const [channelId, setChannelId] = useState("")
  const [channelTpl, setChannelTpl] = useState("")
  const [autoNew, setAutoNew] = useState(false)
  const [autoBlog, setAutoBlog] = useState(false)
  const [syncEdits, setSyncEdits] = useState(false)
  const [autoDelay, setAutoDelay] = useState(0)
  const [forceJoin, setForceJoin] = useState({
    enabled: false,
    mode: "mandatory" as "mandatory" | "optional",
    channel_id: "",
    channel_link: "",
    message: "",
    check_btn: "",
  })
  const [webappUrl, setWebappUrl] = useState("")
  const [blogTpl, setBlogTpl] = useState("")
  const [widgetGreeting, setWidgetGreeting] = useState("")
  const [widgetPosition, setWidgetPosition] = useState("bottom-left")
  const [widgetShowOnMobile, setWidgetShowOnMobile] = useState(true)
  const [cascadeTemplate, setCascadeTemplate] = useState("")
  const [cascadeStatuses, setCascadeStatuses] = useState("processing,completed")
  const [cascadeNotifyCustomer, setCascadeNotifyCustomer] = useState(true)

  const q = useQuery({
    queryKey: ["bots", provider, "settings"],
    queryFn: () => api<BotSettings>(settingsPath(provider)),
  })

  useEffect(() => {
    if (!q.data) return
    const m = q.data.meta ?? {}
    setAddons({ ...(m.addons ?? {}) })
    const ch = (m.channel ?? {}) as Record<string, unknown>
    setChannelId(String(ch.channel_id ?? ""))
    setChannelTpl(String(ch.template ?? ""))
    setAutoNew(Boolean(ch.auto_new_products))
    setAutoBlog(Boolean(ch.auto_new_blog))
    setSyncEdits(Boolean(ch.sync_edits))
    setAutoDelay(Number(ch.auto_delay_minutes ?? 0))
    setBlogTpl(String(ch.blog_template ?? ""))
    const fj = (m.force_join ?? {}) as Record<string, unknown>
    setForceJoin({
      enabled: Boolean(fj.enabled ?? m.addons?.force_join),
      mode: fj.mode === "optional" ? "optional" : "mandatory",
      channel_id: String(fj.channel_id ?? ""),
      channel_link: String(fj.channel_link ?? ""),
      message: String(fj.message ?? ""),
      check_btn: String(fj.check_button_text ?? ""),
    })
    setWebappUrl(String(((m.club ?? {}) as Record<string, unknown>).webapp_base_url ?? (m.widget as Record<string, unknown>)?.webapp_url ?? ""))
    const widget = (m.widget ?? {}) as Record<string, unknown>
    setWidgetGreeting(String(widget.greeting ?? ""))
    setWidgetPosition(String(widget.position ?? "bottom-left"))
    setWidgetShowOnMobile(widget.show_on_mobile !== false)
    const cascade = (m.cascade ?? {}) as Record<string, unknown>
    setCascadeTemplate(String(cascade.template ?? ""))
    setCascadeStatuses(String(cascade.statuses ?? "processing,completed"))
    setCascadeNotifyCustomer(cascade.notify_customer !== false)
  }, [q.data])

  const save = useMutation({
    mutationFn: () =>
      api(settingsPath(provider), {
        method: "PUT",
        json: {
          meta: {
            ...(q.data?.meta ?? {}),
            addons: {
              ...addons,
              force_join: forceJoin.enabled,
              webapp: Boolean(addons.webapp),
            },
            channel: {
              channel_id: channelId.trim(),
              template: channelTpl,
              blog_template: blogTpl,
              auto_new_products: autoNew,
              auto_new_blog: autoBlog,
              sync_edits: syncEdits,
              auto_delay_minutes: autoDelay,
            },
            force_join: {
              enabled: forceJoin.enabled,
              mode: forceJoin.mode,
              channel_id: forceJoin.channel_id,
              channel_link: forceJoin.channel_link,
              message: forceJoin.message,
              check_button_text: forceJoin.check_btn,
            },
            club: {
              ...((q.data?.meta?.club as Record<string, unknown>) ?? {}),
              webapp_base_url: webappUrl,
            },
            widget: {
              greeting: widgetGreeting,
              position: widgetPosition,
              show_on_mobile: widgetShowOnMobile,
              webapp_url: webappUrl,
            },
            cascade: {
              template: cascadeTemplate,
              statuses: cascadeStatuses,
              notify_customer: cascadeNotifyCustomer,
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

  if (q.isLoading) return <FormSettingsSkeleton cards={3} fieldsPerCard={4} />

  return (
    <div className="space-y-4">
      <BotSection title={t("addons.title")} description={t("addons.hint")}>
        <div className="grid gap-2 sm:grid-cols-2">
          {ADDON_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={Boolean(addons[key]) || (key === "force_join" && forceJoin.enabled)}
                onCheckedChange={(v) => {
                  const on = Boolean(v)
                  setAddons((prev) => ({ ...prev, [key]: on }))
                  if (key === "force_join") setForceJoin((p) => ({ ...p, enabled: on }))
                }}
              />
              {t(`addons.${key}`)}
            </label>
          ))}
        </div>
      </BotSection>

      <BotSection
        title={t("features.channelTitle")}
        description={t("features.channelHint")}
        badge={addons.channel_publish ? undefined : t("features.needsAddon")}
      >
        <div className="grid max-w-2xl gap-3">
          <div className="space-y-1">
            <Label>{t("engine.channelId")}</Label>
            <Input dir="ltr" value={channelId} onChange={(e) => setChannelId(e.target.value)} placeholder="@mychannel" />
          </div>
          <div className="space-y-1">
            <Label>{t("engine.channelTpl")}</Label>
            <textarea className={textareaClass} value={channelTpl} onChange={(e) => setChannelTpl(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={autoNew} onCheckedChange={(v) => setAutoNew(Boolean(v))} />
            {t("engine.autoNew")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={autoBlog} onCheckedChange={(v) => setAutoBlog(Boolean(v))} />
            {t("features.autoBlog")}
          </label>
          <div className="space-y-1">
            <Label>{t("features.blogTpl")}</Label>
            <textarea
              className={textareaClass}
              value={blogTpl}
              onChange={(e) => setBlogTpl(e.target.value)}
              placeholder={"📝 {title}\n\n{excerpt}"}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={syncEdits} onCheckedChange={(v) => setSyncEdits(Boolean(v))} />
            {t("engine.syncEdits")}
          </label>
          <div className="space-y-1">
            <Label>{t("engine.autoDelay")}</Label>
            <Input type="number" min={0} value={autoDelay} onChange={(e) => setAutoDelay(Number(e.target.value) || 0)} />
          </div>
        </div>
      </BotSection>

      <BotSection title={t("features.forceJoinTitle")} description={t("features.forceJoinHint")}>
        <div className="grid max-w-xl gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={forceJoin.enabled}
              onCheckedChange={(v) => {
                const on = Boolean(v)
                setForceJoin((p) => ({ ...p, enabled: on }))
                setAddons((prev) => ({ ...prev, force_join: on }))
              }}
            />
            {t("features.forceJoinEnabled")}
          </label>
          <div className="space-y-1">
            <Label>{t("features.forceJoinMode")}</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={forceJoin.mode}
              onChange={(e) =>
                setForceJoin((p) => ({ ...p, mode: e.target.value === "optional" ? "optional" : "mandatory" }))
              }
            >
              <option value="mandatory">{t("features.forceJoinModes.mandatory")}</option>
              <option value="optional">{t("features.forceJoinModes.optional")}</option>
            </select>
          </div>
          <Input
            dir="ltr"
            placeholder={t("features.forceJoinChannelId")}
            value={forceJoin.channel_id}
            onChange={(e) => setForceJoin((p) => ({ ...p, channel_id: e.target.value }))}
          />
          <Input
            dir="ltr"
            placeholder={t("features.forceJoinLink")}
            value={forceJoin.channel_link}
            onChange={(e) => setForceJoin((p) => ({ ...p, channel_link: e.target.value }))}
          />
          <textarea
            className={textareaClass}
            placeholder={t("features.forceJoinMessage")}
            value={forceJoin.message}
            onChange={(e) => setForceJoin((p) => ({ ...p, message: e.target.value }))}
          />
          <Input
            placeholder={t("features.forceJoinCheckBtn")}
            value={forceJoin.check_btn}
            onChange={(e) => setForceJoin((p) => ({ ...p, check_btn: e.target.value }))}
          />
        </div>
      </BotSection>

      <BotSection title={t("features.webappTitle")} description={t("features.webappHint")}>
        <div className="grid max-w-xl gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={Boolean(addons.webapp)}
              onCheckedChange={(v) => setAddons((prev) => ({ ...prev, webapp: Boolean(v) }))}
            />
            {t("addons.webapp")}
          </label>
          <Input dir="ltr" value={webappUrl} onChange={(e) => setWebappUrl(e.target.value)} placeholder="https://…" />
          <p className="text-muted-foreground text-xs">{t("features.webappLiveHint")}</p>
        </div>
      </BotSection>

      {addons.site_widget ? (
        <BotSection title={t("widget.title")} description={t("widget.hint")}>
          <div className="grid max-w-xl gap-3">
            <div className="space-y-1">
              <Label>{t("widget.greeting")}</Label>
              <Input value={widgetGreeting} onChange={(e) => setWidgetGreeting(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("widget.position")}</Label>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                value={widgetPosition}
                onChange={(e) => setWidgetPosition(e.target.value)}
              >
                <option value="bottom-left">{t("widget.positions.bottom_left")}</option>
                <option value="bottom-right">{t("widget.positions.bottom_right")}</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={widgetShowOnMobile} onCheckedChange={(v) => setWidgetShowOnMobile(Boolean(v))} />
              {t("widget.showOnMobile")}
            </label>
          </div>
        </BotSection>
      ) : null}

      {addons.order_cascade ? (
        <BotSection title={t("cascade.title")} description={t("cascade.hint")}>
          <div className="grid max-w-xl gap-3">
            <Input value={cascadeTemplate} onChange={(e) => setCascadeTemplate(e.target.value)} placeholder={t("cascade.templatePh")} />
            <Input value={cascadeStatuses} onChange={(e) => setCascadeStatuses(e.target.value)} placeholder={t("cascade.statusesPh")} />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={cascadeNotifyCustomer} onCheckedChange={(v) => setCascadeNotifyCustomer(Boolean(v))} />
              {t("cascade.notifyCustomer")}
            </label>
          </div>
        </BotSection>
      ) : null}

      <Button disabled={save.isPending} onClick={() => save.mutate()}>
        {tCommon("save")}
      </Button>
    </div>
  )
}
