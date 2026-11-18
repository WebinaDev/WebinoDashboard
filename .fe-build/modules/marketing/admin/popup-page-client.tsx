"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { MediaPickerField } from "@/components/content/MediaPickerField"
import { PopupCard, type PopupContent } from "@/components/marketing/PopupCard"
import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { dashboardPath } from "@/kernel/paths"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatNumber } from "@/lib/locale"

import { MarketingSection } from "../lib/marketing-admin-ui"

type Popup = {
  id?: number
  name: string
  status: "draft" | "active" | "paused"
  priority: number
  content: PopupContent
  trigger: "load" | "delay" | "scroll" | "exit" | "idle"
  trigger_value: number
  targeting: {
    include: string[]
    exclude: string[]
    devices: ("desktop" | "mobile")[]
    audience: "all" | "guest" | "logged_in"
    new_visitors_only: boolean
  }
  display: { frequency: "always" | "session" | "once" | "days"; days: number; max_views: number }
  starts_at: string | null
  ends_at: string | null
  views?: number
  clicks?: number
  closes?: number
  leads?: number
}

const EMPTY: Popup = {
  name: "",
  status: "draft",
  priority: 0,
  content: {
    title: "",
    body: "",
    image_url: "",
    cta_label: "",
    cta_url: "",
    coupon_code: "",
    collect: "none",
    position: "center",
    theme: { bg: "#ffffff", text: "#0f172a", accent: "#0f766e", radius: 16 },
  },
  trigger: "delay",
  trigger_value: 5,
  targeting: {
    include: [],
    exclude: [],
    devices: ["desktop", "mobile"],
    audience: "all",
    new_visitors_only: false,
  },
  display: { frequency: "session", days: 7, max_views: 0 },
  starts_at: null,
  ends_at: null,
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean)
const toLocal = (v: string | null) => (v ? v.slice(0, 16) : null)

export default function PopupPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("marketing_popup")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const qc = useQueryClient()
  const [edit, setEdit] = useState<Popup | null>(null)

  const list = useQuery({
    queryKey: ["marketing-popups"],
    queryFn: () => api<Popup[]>("/api/v1/marketing/popups"),
  })

  const save = useMutation({
    mutationFn: (p: Popup) =>
      p.id
        ? api(`/api/v1/marketing/popups/${p.id}`, { method: "PUT", json: p })
        : api("/api/v1/marketing/popups", { method: "POST", json: p }),
    onSuccess: async () => {
      toast.success(t("saved"))
      setEdit(null)
      await qc.invalidateQueries({ queryKey: ["marketing-popups"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const del = useMutation({
    mutationFn: (id: number) => api(`/api/v1/marketing/popups/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success(t("deleted"))
      await qc.invalidateQueries({ queryKey: ["marketing-popups"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (edit) {
    const set = (patch: Partial<Popup>) => setEdit({ ...edit, ...patch })
    const c = (patch: Partial<PopupContent>) => set({ content: { ...edit.content, ...patch } })
    const th = (patch: NonNullable<PopupContent["theme"]>) =>
      c({ theme: { ...(edit.content.theme ?? {}), ...patch } })
    const tg = (patch: Partial<Popup["targeting"]>) => set({ targeting: { ...edit.targeting, ...patch } })
    const dp = (patch: Partial<Popup["display"]>) => set({ display: { ...edit.display, ...patch } })
    const toggleDevice = (d: "desktop" | "mobile", on: boolean) =>
      tg({
        devices: on
          ? Array.from(new Set([...edit.targeting.devices, d]))
          : edit.targeting.devices.filter((x) => x !== d),
      })

    return (
      <PageShell
        title={edit.id ? t("edit_heading") : t("create_heading")}
        description={t("designer_hint")}
        eyebrow={t("eyebrow")}
        actions={
          <Button variant="outline" onClick={() => setEdit(null)}>
            {tCommon("cancel")}
          </Button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <MarketingSection title={t("section_general")}>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-2 sm:col-span-1">
                  <Label>{t("name_field")}</Label>
                  <Input value={edit.name} onChange={(e) => set({ name: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>{t("status_field")}</Label>
                  <select
                    className={selectClass}
                    value={edit.status}
                    onChange={(e) => set({ status: e.target.value as Popup["status"] })}
                  >
                    <option value="draft">{t("status_draft")}</option>
                    <option value="active">{t("status_active")}</option>
                    <option value="paused">{t("status_paused")}</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label>{t("priority")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={edit.priority}
                    onChange={(e) => set({ priority: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </MarketingSection>

            <MarketingSection title={t("section_content")} description={t("section_content_hint")}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
                  <Label>{t("content_title")}</Label>
                  <Input
                    value={edit.content.title ?? ""}
                    onChange={(e) => c({ title: e.target.value })}
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label>{t("content_body")}</Label>
                  <Textarea
                    rows={3}
                    value={edit.content.body ?? ""}
                    onChange={(e) => c({ body: e.target.value })}
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <MediaPickerField
                    label={t("content_image")}
                    accept="image"
                    imageUrl={edit.content.image_url || ""}
                    onPick={(item) => c({ image_url: item.url })}
                    onClear={() => c({ image_url: "" })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("cta_label")}</Label>
                  <Input
                    value={edit.content.cta_label ?? ""}
                    onChange={(e) => c({ cta_label: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("cta_url")}</Label>
                  <Input
                    dir="ltr"
                    value={edit.content.cta_url ?? ""}
                    onChange={(e) => c({ cta_url: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("coupon_code")}</Label>
                  <Input
                    dir="ltr"
                    value={edit.content.coupon_code ?? ""}
                    onChange={(e) => c({ coupon_code: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("collect")}</Label>
                  <select
                    className={selectClass}
                    value={edit.content.collect ?? "none"}
                    onChange={(e) => c({ collect: e.target.value as PopupContent["collect"] })}
                  >
                    <option value="none">{t("collect_none")}</option>
                    <option value="phone">{t("collect_phone")}</option>
                    <option value="email">{t("collect_email")}</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label>{t("position")}</Label>
                  <select
                    className={selectClass}
                    value={edit.content.position ?? "center"}
                    onChange={(e) => c({ position: e.target.value as PopupContent["position"] })}
                  >
                    <option value="center">{t("position_center")}</option>
                    <option value="bottom">{t("position_bottom")}</option>
                    <option value="corner">{t("position_corner")}</option>
                  </select>
                </div>
              </div>
            </MarketingSection>

            <MarketingSection title={t("section_theme")} description={t("section_theme_hint")}>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="grid gap-2">
                  <Label>{t("theme_bg")}</Label>
                  <Input
                    type="color"
                    value={edit.content.theme?.bg || "#ffffff"}
                    onChange={(e) => th({ bg: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("theme_text")}</Label>
                  <Input
                    type="color"
                    value={edit.content.theme?.text || "#0f172a"}
                    onChange={(e) => th({ text: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("theme_accent")}</Label>
                  <Input
                    type="color"
                    value={edit.content.theme?.accent || "#0f766e"}
                    onChange={(e) => th({ accent: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("theme_radius")}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={48}
                    value={edit.content.theme?.radius ?? 16}
                    onChange={(e) => th({ radius: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </MarketingSection>

            <MarketingSection title={t("section_trigger")}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>{t("trigger")}</Label>
                  <select
                    className={selectClass}
                    value={edit.trigger}
                    onChange={(e) => set({ trigger: e.target.value as Popup["trigger"] })}
                  >
                    {(["load", "delay", "scroll", "exit", "idle"] as const).map((k) => (
                      <option key={k} value={k}>
                        {t(`triggers.${k}`)}
                      </option>
                    ))}
                  </select>
                </div>
                {edit.trigger === "delay" || edit.trigger === "idle" || edit.trigger === "scroll" ? (
                  <div className="grid gap-2">
                    <Label>{edit.trigger === "scroll" ? t("trigger_scroll") : t("trigger_seconds")}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={edit.trigger === "scroll" ? 100 : 3600}
                      value={edit.trigger_value}
                      onChange={(e) => set({ trigger_value: Number(e.target.value) || 0 })}
                    />
                  </div>
                ) : null}
              </div>
            </MarketingSection>

            <MarketingSection title={t("section_targeting")}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>{t("include_paths")}</Label>
                  <Textarea
                    dir="ltr"
                    rows={3}
                    defaultValue={edit.targeting.include.join("\n")}
                    onBlur={(e) => tg({ include: lines(e.target.value) })}
                    placeholder={"/\n/shop*\n/product/*"}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("exclude_paths")}</Label>
                  <Textarea
                    dir="ltr"
                    rows={3}
                    defaultValue={edit.targeting.exclude.join("\n")}
                    onBlur={(e) => tg({ exclude: lines(e.target.value) })}
                    placeholder={"/cart\n/checkout*"}
                  />
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={edit.targeting.devices.includes("desktop")}
                      onCheckedChange={(v) => toggleDevice("desktop", v)}
                    />
                    {t("device_desktop")}
                  </label>
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={edit.targeting.devices.includes("mobile")}
                      onCheckedChange={(v) => toggleDevice("mobile", v)}
                    />
                    {t("device_mobile")}
                  </label>
                </div>
                <div className="grid gap-2">
                  <Label>{t("audience")}</Label>
                  <select
                    className={selectClass}
                    value={edit.targeting.audience}
                    onChange={(e) =>
                      tg({ audience: e.target.value as Popup["targeting"]["audience"] })
                    }
                  >
                    <option value="all">{t("audience_all")}</option>
                    <option value="guest">{t("audience_guest")}</option>
                    <option value="logged_in">{t("audience_logged_in")}</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <Switch
                    checked={edit.targeting.new_visitors_only}
                    onCheckedChange={(v) => tg({ new_visitors_only: v })}
                  />
                  {t("new_visitors_only")}
                </label>
              </div>
            </MarketingSection>

            <MarketingSection title={t("section_display")}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>{t("frequency")}</Label>
                  <select
                    className={selectClass}
                    value={edit.display.frequency}
                    onChange={(e) =>
                      dp({ frequency: e.target.value as Popup["display"]["frequency"] })
                    }
                  >
                    {(["always", "session", "once", "days"] as const).map((k) => (
                      <option key={k} value={k}>
                        {t(`freq.${k}`)}
                      </option>
                    ))}
                  </select>
                </div>
                {edit.display.frequency === "days" ? (
                  <div className="grid gap-2">
                    <Label>{t("freq_days")}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={edit.display.days}
                      onChange={(e) => dp({ days: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </div>
                ) : null}
                <div className="grid gap-2">
                  <Label>{t("max_views")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={edit.display.max_views}
                    onChange={(e) => dp({ max_views: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("starts_at")}</Label>
                  <LocaleDatePicker
                    locale={locale}
                    withTime
                    value={toLocal(edit.starts_at)}
                    onChange={(v) => set({ starts_at: v })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("ends_at")}</Label>
                  <LocaleDatePicker
                    locale={locale}
                    withTime
                    value={toLocal(edit.ends_at)}
                    onChange={(v) => set({ ends_at: v })}
                  />
                </div>
              </div>
            </MarketingSection>

            <div className="flex flex-wrap gap-2">
              <Button disabled={!edit.name.trim() || save.isPending} onClick={() => save.mutate(edit)}>
                {tCommon("save")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEdit(null)}>
                {tCommon("cancel")}
              </Button>
            </div>
          </div>

          <div className="lg:sticky lg:top-4 lg:self-start">
            <MarketingSection title={t("preview")}>
              <div className="rounded-xl border bg-muted/40 p-4">
                <PopupCard content={edit.content} onClose={() => undefined} />
              </div>
              <p className="text-muted-foreground mt-2 text-xs">{t("preview_hint")}</p>
            </MarketingSection>
          </div>
        </div>
      </PageShell>
    )
  }

  const rows = Array.isArray(list.data) ? list.data : []

  return (
    <PageShell
      title={t("title")}
      description={t("subtitle")}
      eyebrow={t("eyebrow")}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={dashboardPath("marketing/customer-return")}>{t("back_hub")}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/theme-builder">
              <ExternalLink className="size-3.5" />
              {t("advanced_builder")}
            </Link>
          </Button>
          <Button onClick={() => setEdit({ ...EMPTY })}>
            <Plus className="size-4" />
            {t("create")}
          </Button>
        </div>
      }
    >
      <MarketingSection title={t("list_heading")} description={t("list_hint")}>
        {list.isLoading ? (
          <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{p.name}</p>
                    <Badge variant={p.status === "active" ? "default" : "secondary"} className="text-[10px]">
                      {t(`status_${p.status}`)}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t(`triggers.${p.trigger}`)} · {t(`freq.${p.display?.frequency ?? "session"}`)} ·{" "}
                    {t("stats_line", {
                      views: formatNumber(p.views ?? 0, locale),
                      clicks: formatNumber(p.clicks ?? 0, locale),
                      leads: formatNumber(p.leads ?? 0, locale),
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEdit({
                        ...EMPTY,
                        ...p,
                        content: {
                          ...EMPTY.content,
                          ...p.content,
                          theme: { ...EMPTY.content.theme, ...(p.content?.theme ?? {}) },
                        },
                        targeting: { ...EMPTY.targeting, ...p.targeting },
                        display: { ...EMPTY.display, ...p.display },
                      })
                    }
                  >
                    <Pencil className="size-3.5" />
                    {t("design")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={del.isPending}
                    onClick={() => {
                      if (p.id && window.confirm(t("confirm_delete"))) del.mutate(p.id)
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </MarketingSection>
    </PageShell>
  )
}
