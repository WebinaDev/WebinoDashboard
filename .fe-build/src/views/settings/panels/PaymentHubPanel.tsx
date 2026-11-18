"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BookOpen, ChevronDown, Settings } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type GeoServices = {
  cloudflare: boolean
  woocommerce: boolean
  analytics: boolean
  ip_api: boolean
  ipwho: boolean
  geojs: boolean
  country_is: boolean
}

type GeoNotice = {
  enabled: boolean
  services: GeoServices
  colors: Record<string, string>
}

type HubItem = {
  id: string
  title_key: string
  label_fa?: string
  label_en?: string
  category: string
  gateway_id: string
  enabled: boolean
  available: boolean
  configured?: boolean
  status?: string
  coming_soon?: boolean
  docs_url?: string | null
  supports?: string[]
  settings_path: string
}

type HubCategory = {
  id: string
  label_fa: string
  label_en: string
  order: number
}

type HubPayload = {
  items: HubItem[]
  categories?: HubCategory[]
  geo_notice?: GeoNotice
  curated_gateway_ids?: string[]
}

const SERVICE_KEYS: (keyof GeoServices)[] = [
  "cloudflare",
  "woocommerce",
  "analytics",
  "ip_api",
  "ipwho",
  "geojs",
  "country_is",
]

const GEO_COLOR_KEYS = ["bg", "border", "text", "icon", "button_bg", "button_text"] as const

const DEFAULT_GEO_COLORS: Record<string, string> = {
  bg: "#fff7ed",
  border: "#fdba74",
  text: "#9a3412",
  icon: "#ea580c",
  button_bg: "#ea580c",
  button_text: "#ffffff",
}

const DEFAULT_GEO: GeoNotice = {
  enabled: true,
  colors: { ...DEFAULT_GEO_COLORS },
  services: {
    cloudflare: true,
    woocommerce: true,
    analytics: true,
    ip_api: true,
    ipwho: true,
    geojs: true,
    country_is: true,
  },
}

function normalizeGeo(raw?: GeoNotice | null): GeoNotice {
  const base: GeoNotice = {
    enabled: DEFAULT_GEO.enabled,
    colors: { ...DEFAULT_GEO_COLORS },
    services: { ...DEFAULT_GEO.services },
  }
  if (!raw || typeof raw !== "object") return base
  base.enabled = raw.enabled !== false
  if (raw.services && typeof raw.services === "object") {
    for (const key of SERVICE_KEYS) {
      if (key in raw.services) base.services[key] = Boolean(raw.services[key])
    }
  }
  if (raw.colors && typeof raw.colors === "object") {
    for (const key of GEO_COLOR_KEYS) {
      const v = raw.colors[key]
      if (typeof v === "string" && v.trim()) base.colors[key] = v
    }
  }
  return base
}

function itemTitle(item: HubItem, locale: string, t: (key: string) => string): string {
  if (locale.startsWith("fa") && item.label_fa) return item.label_fa
  if (item.label_en) return item.label_en
  try {
    return t(item.title_key as "zarinpal")
  } catch {
    return item.id
  }
}

export function PaymentHubPanel() {
  const t = useTranslations("payments_hub")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const qc = useQueryClient()
  const [geoDraft, setGeoDraft] = useState<GeoNotice>(DEFAULT_GEO)
  const [geoOpen, setGeoOpen] = useState(false)
  const [query, setQuery] = useState("")

  const hubQ = useQuery({
    queryKey: ["payments-hub"],
    queryFn: () => api<HubPayload>("/api/v1/payments/hub"),
  })

  useEffect(() => {
    if (hubQ.data?.geo_notice) setGeoDraft(normalizeGeo(hubQ.data.geo_notice))
  }, [hubQ.data])

  const toggle = useMutation({
    mutationFn: async (item: HubItem) =>
      api(`/api/v1/payments/hub/${item.id}/toggle`, {
        method: "POST",
        json: { enabled: !item.enabled },
      }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await qc.invalidateQueries({ queryKey: ["payments-hub"] })
      await qc.invalidateQueries({ queryKey: ["payment-gateways"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const geoSave = useMutation({
    mutationFn: (geo_notice: GeoNotice) =>
      api<HubPayload>("/api/v1/payments/hub", {
        method: "POST",
        json: { geo_notice },
      }),
    onSuccess: (data) => {
      qc.setQueryData(["payments-hub"], data)
      setGeoDraft(normalizeGeo(data.geo_notice))
      toast.success(tCommon("saved"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const items = hubQ.data?.items ?? []
  const categories = useMemo(() => {
    const cats = [...(hubQ.data?.categories ?? [])].sort((a, b) => a.order - b.order)
    if (cats.length) return cats
    return [
      { id: "bnpl", label_fa: "اعتباری", label_en: "BNPL", order: 10 },
      { id: "aggregator", label_fa: "پرداختیار", label_en: "Aggregators", order: 20 },
      { id: "psp", label_fa: "مستقیم", label_en: "PSP", order: 30 },
      { id: "other", label_fa: "سایر", label_en: "Other", order: 40 },
      { id: "fx_crypto", label_fa: "ارزی", label_en: "FX / Crypto", order: 50 },
    ]
  }, [hubQ.data])

  const serverGeo = useMemo(() => normalizeGeo(hubQ.data?.geo_notice), [hubQ.data])
  const geoDirty = useMemo(
    () => JSON.stringify(geoDraft) !== JSON.stringify(serverGeo),
    [geoDraft, serverGeo],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const title = itemTitle(item, locale, t).toLowerCase()
      return title.includes(q) || item.id.includes(q)
    })
  }, [items, query, locale, t])

  const enabledCount = items.filter((i) => i.enabled).length

  return (
    <PageShell
      title={t("title")}
      description={t("subtitle")}
      eyebrow={t("eyebrow")}
      actions={
        <p className="text-muted-foreground text-xs">
          {t("enabled_count", { count: enabledCount, total: items.length })}
        </p>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
          />
        </div>

        <div className="bg-background/60 space-y-3 rounded-xl border px-3 py-3">
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full justify-between px-1 py-1"
            onClick={() => setGeoOpen((v) => !v)}
          >
            <span className="text-sm font-medium">{t("geo_notice")}</span>
            <ChevronDown className={`size-4 transition ${geoOpen ? "rotate-180" : ""}`} />
          </Button>
          {geoOpen ? (
            <>
              <div className="flex items-center gap-3">
                <Switch
                  id="geo-notice-enabled"
                  checked={geoDraft.enabled}
                  disabled={hubQ.isLoading || geoSave.isPending}
                  onCheckedChange={(v) => setGeoDraft((prev) => ({ ...prev, enabled: v }))}
                />
                <div className="min-w-0 flex-1">
                  <Label htmlFor="geo-notice-enabled" className="text-sm font-medium">
                    {t("geo_notice")}
                  </Label>
                  <p className="text-muted-foreground text-xs">{t("geo_notice_hint")}</p>
                </div>
              </div>

              <div className={geoDraft.enabled ? "space-y-4" : "pointer-events-none space-y-4 opacity-50"}>
                <div>
                  <p className="mb-2 text-sm font-medium">{t("geo_services_title")}</p>
                  <p className="text-muted-foreground mb-3 text-xs">{t("geo_services_hint")}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SERVICE_KEYS.map((key) => (
                      <label
                        key={key}
                        htmlFor={`geo-svc-${key}`}
                        className="bg-muted/30 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                      >
                        <span className="text-sm">{t(`geo_service.${key}`)}</span>
                        <Switch
                          id={`geo-svc-${key}`}
                          checked={geoDraft.services[key]}
                          disabled={!geoDraft.enabled || geoSave.isPending}
                          onCheckedChange={(v) =>
                            setGeoDraft((prev) => ({
                              ...prev,
                              services: { ...prev.services, [key]: v },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">{t("geo_colors_title")}</p>
                  <p className="text-muted-foreground mb-3 text-xs">{t("geo_colors_hint")}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {GEO_COLOR_KEYS.map((key) => (
                      <label key={key} className="grid gap-1">
                        <span className="text-xs">{t(`geo_color.${key}`)}</span>
                        <Input
                          type="color"
                          dir="ltr"
                          value={geoDraft.colors?.[key] ?? DEFAULT_GEO_COLORS[key]}
                          disabled={!geoDraft.enabled || geoSave.isPending}
                          onChange={(e) =>
                            setGeoDraft((prev) => ({
                              ...prev,
                              colors: { ...prev.colors, [key]: e.target.value },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={hubQ.isLoading || geoSave.isPending || !geoDirty}
                  onClick={() => void geoSave.mutateAsync(geoDraft)}
                >
                  {geoSave.isPending ? tCommon("saving") : tCommon("save")}
                </Button>
              </div>
            </>
          ) : null}
        </div>

        {hubQ.isLoading ? (
          <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
        ) : (
          categories.map((cat) => {
            const group = filtered.filter((item) => item.category === cat.id)
            if (!group.length) return null
            const catLabel = locale.startsWith("fa") ? cat.label_fa : cat.label_en
            return (
              <section key={cat.id} className="space-y-2">
                <h2 className="text-sm font-semibold tracking-tight">{catLabel}</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.map((item) => {
                    const title = itemTitle(item, locale, t)
                    const soon = Boolean(item.coming_soon) || item.status === "scaffold"
                    const warning =
                      !soon &&
                      !item.configured &&
                      item.id !== "cod" &&
                      item.id !== "wallet" &&
                      item.id !== "c2c" &&
                      item.id !== "basalam_pay"
                        ? t("warn_config")
                        : ""
                    return (
                      <div
                        key={item.id}
                        className="bg-background/60 flex items-start gap-3 rounded-xl border px-3 py-3"
                      >
                        <Switch
                          className="mt-1"
                          checked={item.enabled}
                          disabled={toggle.isPending}
                          onCheckedChange={() => void toggle.mutateAsync(item)}
                          aria-label={title}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-medium">{title}</p>
                            {soon ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {t("coming_soon")}
                              </Badge>
                            ) : item.configured ? (
                              <Badge variant="outline" className="text-[10px]">
                                {t("status_live")}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">
                                {t("status_needs_keys")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground text-xs">
                            {soon ? t("scaffold_hint") : t("configure_hint")}
                          </p>
                          {warning ? (
                            <p className="text-destructive/80 text-xs">{warning}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {item.docs_url ? (
                            <Button type="button" variant="ghost" size="icon" asChild>
                              <a
                                href={item.docs_url}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={t("docs")}
                              >
                                <BookOpen className="size-4" />
                              </a>
                            </Button>
                          ) : null}
                          {item.settings_path ? (
                            <Button type="button" variant="ghost" size="icon" asChild>
                              <Link href={item.settings_path} aria-label={t("open_settings")}>
                                <Settings className="size-4" />
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })
        )}
      </div>
    </PageShell>
  )
}
