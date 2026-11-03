"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { SettingsSaveBar } from "@/views/settings/use-tenant-settings"

type Perf = Record<string, string | boolean | number>

type InsightAction = {
  id: string
  priority: string
  title: string
  hint: string
  setting?: string
}

type Insights = {
  score: number
  structure: number
  grade: string
  last_purge?: { at?: string; reason?: string } | null
  checklist: Array<{ id: string; ok: boolean; weight: number; label: string }>
  actions: InsightAction[]
  db_tips?: string[]
}

function SettingSwitch({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex max-w-2xl items-center justify-between gap-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer font-normal">
          {label}
        </Label>
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function scoreTone(score: number): string {
  if (score >= 90) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
  if (score >= 70) return "bg-amber-500/15 text-amber-800 dark:text-amber-200"
  return "bg-rose-500/15 text-rose-700 dark:text-rose-300"
}

export function PerformanceSettingsPanel() {
  const t = useTranslations("settings_hub.performance")
  const locale = useLocale()
  const [draft, setDraft] = useState<Perf | null>(null)
  const [insights, setInsights] = useState<Insights | null>(null)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [purgeNote, setPurgeNote] = useState<string | null>(null)
  const [tab, setTab] = useState("overview")

  const loadInsights = useCallback(async () => {
    try {
      const res = await api<Insights>("/api/v1/performance/insights")
      setInsights(res)
    } catch {
      // Insights are advisory; settings can still load.
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api<Perf>("/api/v1/performance/settings")
        if (!cancelled) setDraft(res)
        await loadInsights()
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadInsights])

  function patch(key: string, value: string | boolean | number) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function save() {
    if (!draft) return
    setPending(true)
    setError(null)
    try {
      const res = await api<Perf>("/api/v1/performance/settings", { method: "PUT", json: draft })
      setDraft(res)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      toast.success(t("saved"))
      await loadInsights()
    } catch (e: unknown) {
      const msg = getApiErrorMessage(e)
      setError(msg)
      toast.error(msg)
    } finally {
      setPending(false)
    }
  }

  async function purge() {
    setPending(true)
    try {
      const res = await api<{ cleared: string[] }>("/api/v1/performance/purge", {
        method: "POST",
        json: { reason: "manual" },
      })
      setPurgeNote(t("purged", { keys: (res.cleared ?? []).join(", ") }))
      toast.success(t("purge_ok"))
      await loadInsights()
    } catch (e: unknown) {
      const msg = getApiErrorMessage(e)
      setError(msg)
      toast.error(msg)
    } finally {
      setPending(false)
    }
  }

  async function applyAction(setting?: string) {
    if (!setting || !draft) return
    patch(setting, true)
    setTab(
      setting.startsWith("cdn") || setting === "cdn_cache_hint"
        ? "cdn"
        : setting.includes("cache") || setting.startsWith("purge") || setting.startsWith("browser")
          ? "caching"
          : setting.includes("webp") ||
              setting.includes("lazy") ||
              setting.includes("image") ||
              setting.includes("avif") ||
              setting.includes("lcp")
            ? "images"
            : setting.includes("font")
              ? "fonts"
              : setting.includes("db")
                ? "database"
                : "assets",
    )
  }

  const lastPurgeLabel = useMemo(() => {
    const at = insights?.last_purge?.at
    if (!at) return t("never_purged")
    try {
      return new Date(at).toLocaleString(locale.startsWith("fa") ? "fa-IR" : "en-US")
    } catch {
      return at
    }
  }, [insights?.last_purge?.at, locale, t])

  if (!draft) {
    return <p className="text-muted-foreground text-sm">{error ? error : t("loading")}</p>
  }

  const moduleOn = Boolean(draft.enabled)

  return (
    <PageShell
      title={t("title")}
      description={t("description")}
      eyebrow={t("eyebrow")}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={scoreTone(insights?.score ?? 0)}>
            {t("score_badge", { score: insights?.score ?? "—", grade: insights?.grade ?? "—" })}
          </Badge>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => void purge()}>
            {t("purge_now")}
          </Button>
        </div>
      }
    >
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="mb-3 flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">{t("tab_overview")}</TabsTrigger>
          <TabsTrigger value="general">{t("tab_general")}</TabsTrigger>
          <TabsTrigger value="caching">{t("tab_caching")}</TabsTrigger>
          <TabsTrigger value="assets">{t("tab_assets")}</TabsTrigger>
          <TabsTrigger value="images">{t("tab_images")}</TabsTrigger>
          <TabsTrigger value="fonts">{t("tab_fonts")}</TabsTrigger>
          <TabsTrigger value="cdn">{t("tab_cdn")}</TabsTrigger>
          <TabsTrigger value="database">{t("tab_database")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t("perf_score")}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{insights?.score ?? "—"}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">{t("perf_score_hint")}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t("structure_score")}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{insights?.structure ?? "—"}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">{t("structure_score_hint")}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{t("last_purge")}</CardDescription>
                <CardTitle className="text-base font-medium">{lastPurgeLabel}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                {insights?.last_purge?.reason
                  ? t("purge_reason", { reason: insights.last_purge.reason })
                  : t("purge_hint")}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("actions_title")}</CardTitle>
              <CardDescription>{t("actions_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(insights?.actions ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("actions_empty")}</p>
              ) : (
                (insights?.actions ?? []).map((action) => (
                  <div
                    key={action.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{t(`action.${action.title}` as "action.enable_module")}</p>
                        <Badge variant="secondary" className="text-[10px] uppercase">
                          {t(`priority.${action.priority}` as "priority.high")}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {t(`action.${action.hint}` as "action.enable_module_hint")}
                      </p>
                    </div>
                    {action.setting ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => void applyAction(action.setting)}>
                        {t("fix_setting")}
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("checklist_title")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {(insights?.checklist ?? []).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <span>{t(`check.${item.label}` as "check.module_enabled")}</span>
                  <Badge variant={item.ok ? "default" : "outline"}>{item.ok ? t("ok") : t("todo")}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("general_title")}</CardTitle>
              <CardDescription>{t("general_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingSwitch
                id="perf-enabled"
                label={t("enabled")}
                hint={t("enabled_hint")}
                checked={moduleOn}
                onCheckedChange={(v) => patch("enabled", v)}
              />
              <div className="grid max-w-sm gap-2">
                <Label>{t("preset")}</Label>
                <Select value={String(draft.preset ?? "recommended")} onValueChange={(v) => patch("preset", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">{t("preset_beginner")}</SelectItem>
                    <SelectItem value="recommended">{t("preset_recommended")}</SelectItem>
                    <SelectItem value="aggressive">{t("preset_aggressive")}</SelectItem>
                    <SelectItem value="custom">{t("preset_custom")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid max-w-sm gap-2">
                <Label>{t("isr_revalidate_seconds")}</Label>
                <Input
                  type="number"
                  dir="ltr"
                  value={Number(draft.isr_revalidate_seconds ?? 60)}
                  onChange={(e) => patch("isr_revalidate_seconds", Number(e.target.value))}
                />
              </div>
              <SettingSwitch
                id="score-monitoring"
                label={t("score_monitoring")}
                checked={Boolean(draft.score_monitoring)}
                onCheckedChange={(v) => patch("score_monitoring", v)}
              />
              <SettingSwitch
                id="alert-on-drop"
                label={t("alert_on_drop")}
                hint={t("alert_on_drop_hint")}
                checked={Boolean(draft.alert_on_drop)}
                onCheckedChange={(v) => patch("alert_on_drop", v)}
              />
              <div className="grid max-w-xl gap-2">
                <Label>{t("notes")}</Label>
                <Textarea value={String(draft.notes ?? "")} onChange={(e) => patch("notes", e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="caching" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("caching_title")}</CardTitle>
              <CardDescription>{t("caching_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingSwitch
                id="page-cache"
                label={t("page_cache_enabled")}
                checked={Boolean(draft.page_cache_enabled)}
                onCheckedChange={(v) => patch("page_cache_enabled", v)}
              />
              <div className="grid max-w-sm gap-2">
                <Label>{t("page_cache_driver")}</Label>
                <Select
                  value={String(draft.page_cache_driver ?? "file")}
                  onValueChange={(v) => patch("page_cache_driver", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="file">{t("driver_file")}</SelectItem>
                    <SelectItem value="redis">{t("driver_redis")}</SelectItem>
                    <SelectItem value="memcached">{t("driver_memcached")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <SettingSwitch
                id="cache-guests"
                label={t("cache_separate_guests")}
                checked={Boolean(draft.cache_separate_guests)}
                onCheckedChange={(v) => patch("cache_separate_guests", v)}
              />
              <SettingSwitch
                id="cache-device"
                label={t("cache_by_device")}
                checked={Boolean(draft.cache_by_device)}
                onCheckedChange={(v) => patch("cache_by_device", v)}
              />
              <SettingSwitch
                id="cache-qs"
                label={t("cache_query_string")}
                hint={t("cache_query_string_hint")}
                checked={Boolean(draft.cache_query_string)}
                onCheckedChange={(v) => patch("cache_query_string", v)}
              />
              <SettingSwitch
                id="preload-cache"
                label={t("preload_cache")}
                checked={Boolean(draft.preload_cache)}
                onCheckedChange={(v) => patch("preload_cache", v)}
              />
              <SettingSwitch
                id="object-cache"
                label={t("object_cache_enabled")}
                hint={t("object_cache_hint")}
                checked={Boolean(draft.object_cache_enabled)}
                onCheckedChange={(v) => patch("object_cache_enabled", v)}
              />
              <SettingSwitch
                id="browser-cache"
                label={t("browser_cache_enabled")}
                checked={Boolean(draft.browser_cache_enabled)}
                onCheckedChange={(v) => patch("browser_cache_enabled", v)}
              />
              <div className="grid max-w-sm gap-2">
                <Label>{t("browser_cache_ttl")}</Label>
                <Input
                  type="number"
                  dir="ltr"
                  value={Number(draft.browser_cache_ttl ?? 604800)}
                  onChange={(e) => patch("browser_cache_ttl", Number(e.target.value))}
                />
              </div>
              <SettingSwitch
                id="cache-busting"
                label={t("cache_busting")}
                checked={Boolean(draft.cache_busting)}
                onCheckedChange={(v) => patch("cache_busting", v)}
              />
              <SettingSwitch
                id="purge-product"
                label={t("purge_on_product_save")}
                checked={Boolean(draft.purge_on_product_save)}
                onCheckedChange={(v) => patch("purge_on_product_save", v)}
              />
              <SettingSwitch
                id="purge-content"
                label={t("purge_on_content_save")}
                checked={Boolean(draft.purge_on_content_save)}
                onCheckedChange={(v) => patch("purge_on_content_save", v)}
              />
              {purgeNote ? <p className="text-muted-foreground text-xs">{purgeNote}</p> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("assets_title")}</CardTitle>
              <CardDescription>{t("assets_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingSwitch id="minify-html" label={t("minify_html")} checked={Boolean(draft.minify_html)} onCheckedChange={(v) => patch("minify_html", v)} />
              <SettingSwitch id="minify-css" label={t("minify_css")} checked={Boolean(draft.minify_css)} onCheckedChange={(v) => patch("minify_css", v)} />
              <SettingSwitch id="minify-js" label={t("minify_js")} checked={Boolean(draft.minify_js)} onCheckedChange={(v) => patch("minify_js", v)} />
              <SettingSwitch id="minify-inline" label={t("minify_inline_css")} checked={Boolean(draft.minify_inline_css)} onCheckedChange={(v) => patch("minify_inline_css", v)} />
              <SettingSwitch id="critical-css" label={t("critical_css")} hint={t("critical_css_hint")} checked={Boolean(draft.critical_css)} onCheckedChange={(v) => patch("critical_css", v)} />
              <SettingSwitch id="remove-unused" label={t("remove_unused_css")} checked={Boolean(draft.remove_unused_css)} onCheckedChange={(v) => patch("remove_unused_css", v)} />
              <SettingSwitch id="combine-css" label={t("combine_css")} checked={Boolean(draft.combine_css)} onCheckedChange={(v) => patch("combine_css", v)} />
              <SettingSwitch id="combine-js" label={t("combine_js")} checked={Boolean(draft.combine_js)} onCheckedChange={(v) => patch("combine_js", v)} />
              <SettingSwitch id="defer-js" label={t("defer_js")} checked={Boolean(draft.defer_js)} onCheckedChange={(v) => patch("defer_js", v)} />
              <SettingSwitch id="delay-js" label={t("delay_js")} hint={t("delay_js_hint")} checked={Boolean(draft.delay_js)} onCheckedChange={(v) => patch("delay_js", v)} />
              <SettingSwitch id="brotli" label={t("brotli_gzip")} checked={Boolean(draft.brotli_gzip)} onCheckedChange={(v) => patch("brotli_gzip", v)} />
              <div className="grid max-w-sm gap-2">
                <Label>{t("compression_level")}</Label>
                <Input
                  type="number"
                  dir="ltr"
                  min={1}
                  max={11}
                  value={Number(draft.compression_level ?? 5)}
                  onChange={(e) => patch("compression_level", Number(e.target.value))}
                />
              </div>
              <SettingSwitch id="defer-analytics" label={t("defer_analytics")} checked={Boolean(draft.defer_analytics)} onCheckedChange={(v) => patch("defer_analytics", v)} />
              <SettingSwitch id="delay-third" label={t("delay_third_party")} checked={Boolean(draft.delay_third_party)} onCheckedChange={(v) => patch("delay_third_party", v)} />
              <SettingSwitch id="facades" label={t("third_party_facades")} hint={t("third_party_facades_hint")} checked={Boolean(draft.third_party_facades)} onCheckedChange={(v) => patch("third_party_facades", v)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="images" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("images_title")}</CardTitle>
              <CardDescription>{t("images_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingSwitch id="webp" label={t("webp_enabled")} checked={Boolean(draft.webp_enabled)} onCheckedChange={(v) => patch("webp_enabled", v)} />
              <SettingSwitch id="avif" label={t("avif_enabled")} checked={Boolean(draft.avif_enabled)} onCheckedChange={(v) => patch("avif_enabled", v)} />
              <SettingSwitch id="lazy" label={t("lazy_load")} checked={Boolean(draft.lazy_load)} onCheckedChange={(v) => patch("lazy_load", v)} />
              <SettingSwitch id="responsive" label={t("responsive_images")} checked={Boolean(draft.responsive_images)} onCheckedChange={(v) => patch("responsive_images", v)} />
              <SettingSwitch id="strip-meta" label={t("strip_image_meta")} checked={Boolean(draft.strip_image_meta)} onCheckedChange={(v) => patch("strip_image_meta", v)} />
              <SettingSwitch id="cdn-img" label={t("cdn_image_optimization")} hint={t("cdn_image_optimization_hint")} checked={Boolean(draft.cdn_image_optimization)} onCheckedChange={(v) => patch("cdn_image_optimization", v)} />
              <SettingSwitch id="preload-lcp" label={t("preload_lcp_image")} checked={Boolean(draft.preload_lcp_image)} onCheckedChange={(v) => patch("preload_lcp_image", v)} />
              <SettingSwitch id="fetchpriority" label={t("fetchpriority_lcp")} checked={Boolean(draft.fetchpriority_lcp)} onCheckedChange={(v) => patch("fetchpriority_lcp", v)} />
              <SettingSwitch id="retina" label={t("retina_images")} checked={Boolean(draft.retina_images)} onCheckedChange={(v) => patch("retina_images", v)} />
              <div className="grid max-w-sm gap-2">
                <Label>{t("image_quality")}</Label>
                <Input
                  type="number"
                  dir="ltr"
                  min={40}
                  max={100}
                  value={Number(draft.image_quality ?? 82)}
                  onChange={(e) => patch("image_quality", Number(e.target.value))}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fonts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("fonts_title")}</CardTitle>
              <CardDescription>{t("fonts_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingSwitch id="preload-fonts" label={t("preload_fonts")} checked={Boolean(draft.preload_fonts)} onCheckedChange={(v) => patch("preload_fonts", v)} />
              <div className="grid max-w-sm gap-2">
                <Label>{t("font_display")}</Label>
                <Select value={String(draft.font_display ?? "swap")} onValueChange={(v) => patch("font_display", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="swap">swap</SelectItem>
                    <SelectItem value="optional">optional</SelectItem>
                    <SelectItem value="fallback">fallback</SelectItem>
                    <SelectItem value="block">block</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <SettingSwitch id="self-host" label={t("self_host_fonts")} checked={Boolean(draft.self_host_fonts)} onCheckedChange={(v) => patch("self_host_fonts", v)} />
              <SettingSwitch id="reduce-weights" label={t("reduce_font_weights")} checked={Boolean(draft.reduce_font_weights)} onCheckedChange={(v) => patch("reduce_font_weights", v)} />
              <SettingSwitch id="preload-critical" label={t("preload_critical")} checked={Boolean(draft.preload_critical)} onCheckedChange={(v) => patch("preload_critical", v)} />
              <SettingSwitch id="prefetch-next" label={t("prefetch_next")} checked={Boolean(draft.prefetch_next)} onCheckedChange={(v) => patch("prefetch_next", v)} />
              <SettingSwitch id="preconnect" label={t("preconnect_third_party")} checked={Boolean(draft.preconnect_third_party)} onCheckedChange={(v) => patch("preconnect_third_party", v)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cdn" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("cdn_title")}</CardTitle>
              <CardDescription>{t("cdn_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid max-w-sm gap-2">
                <Label>{t("cdn_provider")}</Label>
                <Select value={String(draft.cdn_provider ?? "auto")} onValueChange={(v) => patch("cdn_provider", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t("cdn_auto")}</SelectItem>
                    <SelectItem value="none">{t("cdn_none")}</SelectItem>
                    <SelectItem value="cloudflare">{t("cdn_cloudflare")}</SelectItem>
                    <SelectItem value="arvan">{t("cdn_arvan")}</SelectItem>
                    <SelectItem value="parspack">{t("cdn_parspack")}</SelectItem>
                    <SelectItem value="custom">{t("cdn_custom")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid max-w-md gap-2">
                <Label>{t("cdn_zone")}</Label>
                <Input dir="ltr" value={String(draft.cdn_zone ?? "")} onChange={(e) => patch("cdn_zone", e.target.value)} />
              </div>
              <div className="grid max-w-md gap-2">
                <Label>{t("cdn_api_token")}</Label>
                <Input
                  type="password"
                  dir="ltr"
                  autoComplete="off"
                  placeholder={t("cdn_api_token_placeholder")}
                  value={String(draft.cdn_api_token ?? "")}
                  onChange={(e) => patch("cdn_api_token", e.target.value)}
                />
              </div>
              <SettingSwitch id="cdn-hint" label={t("cdn_cache_hint")} hint={t("cdn_cache_hint_help")} checked={Boolean(draft.cdn_cache_hint)} onCheckedChange={(v) => patch("cdn_cache_hint", v)} />
              <div className="grid max-w-md gap-2">
                <Label>{t("cdn_cache_control")}</Label>
                <Input dir="ltr" value={String(draft.cdn_cache_control ?? "")} onChange={(e) => patch("cdn_cache_control", e.target.value)} placeholder="public, max-age=3600" />
              </div>
              <div className="grid max-w-md gap-2">
                <Label>{t("surrogate_control")}</Label>
                <Input dir="ltr" value={String(draft.surrogate_control ?? "")} onChange={(e) => patch("surrogate_control", e.target.value)} />
              </div>
              <SettingSwitch id="early-hints" label={t("cdn_early_hints")} checked={Boolean(draft.cdn_early_hints)} onCheckedChange={(v) => patch("cdn_early_hints", v)} />
              <SettingSwitch id="cdn-device" label={t("cdn_mobile_desktop_rules")} checked={Boolean(draft.cdn_mobile_desktop_rules)} onCheckedChange={(v) => patch("cdn_mobile_desktop_rules", v)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="database" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("database_title")}</CardTitle>
              <CardDescription>{t("database_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingSwitch id="db-tips" label={t("db_tips_enabled")} checked={Boolean(draft.db_tips_enabled)} onCheckedChange={(v) => patch("db_tips_enabled", v)} />
              <SettingSwitch id="db-cleanup" label={t("db_cleanup_enabled")} hint={t("db_cleanup_hint")} checked={Boolean(draft.db_cleanup_enabled)} onCheckedChange={(v) => patch("db_cleanup_enabled", v)} />
              <div className="grid max-w-sm gap-2">
                <Label>{t("db_cleanup_schedule")}</Label>
                <Select
                  value={String(draft.db_cleanup_schedule ?? "weekly")}
                  onValueChange={(v) => patch("db_cleanup_schedule", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{t("schedule_daily")}</SelectItem>
                    <SelectItem value="weekly">{t("schedule_weekly")}</SelectItem>
                    <SelectItem value="monthly">{t("schedule_monthly")}</SelectItem>
                    <SelectItem value="manual">{t("schedule_manual")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(insights?.db_tips ?? []).length > 0 ? (
                <ul className="text-muted-foreground list-disc space-y-1 ps-5 text-sm">
                  {(insights?.db_tips ?? []).map((tip) => (
                    <li key={tip}>{t(`db_tip.${tip}` as "db_tip.index_hot_queries")}</li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SettingsSaveBar onSave={() => void save()} pending={pending} saved={saved} error={error} />
    </PageShell>
  )
}
