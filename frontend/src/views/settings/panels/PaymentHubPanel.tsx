"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, Settings } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

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
  gateway_id: string
  enabled: boolean
  available: boolean
  configured?: boolean
  settings_path: string
}

type HubPayload = {
  items: HubItem[]
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

export function PaymentHubPanel() {
  const t = useTranslations("payments_hub")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [geoDraft, setGeoDraft] = useState<GeoNotice>(DEFAULT_GEO)
  const [otherOpen, setOtherOpen] = useState(false)

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
  const serverGeo = useMemo(() => normalizeGeo(hubQ.data?.geo_notice), [hubQ.data])
  const geoDirty = useMemo(
    () => JSON.stringify(geoDraft) !== JSON.stringify(serverGeo),
    [geoDraft, serverGeo],
  )

  return (
    <div className="space-y-6">
      <div className="bg-background/60 space-y-4 rounded-xl border px-3 py-3">
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
      </div>

      <div className="grid gap-2">
        {hubQ.isLoading ? (
          <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
        ) : (
          items.map((item) => {
            const warning =
              !item.available && item.id !== "cod"
                ? t("warn_config")
                : !item.configured && item.id !== "cod" && item.id !== "wallet" && item.id !== "c2c" && item.id !== "bale_pay"
                  ? t("warn_config")
                  : ""
            return (
              <div
                key={item.id}
                className="bg-background/60 flex items-center gap-3 rounded-xl border px-3 py-3"
              >
                <Switch
                  checked={item.enabled}
                  disabled={(!item.available && item.id !== "cod") || toggle.isPending}
                  onCheckedChange={() => void toggle.mutateAsync(item)}
                  aria-label={t(item.title_key as "zarinpal")}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t(item.title_key as "zarinpal")}</p>
                  <p className="text-muted-foreground text-xs">
                    {t(`${item.title_key}_desc` as "zarinpal_desc")}
                  </p>
                  {warning ? <p className="text-destructive/80 mt-0.5 text-xs">{warning}</p> : null}
                </div>
                {item.settings_path ? (
                  <Button type="button" variant="ghost" size="icon" asChild>
                    <Link href={item.settings_path} aria-label={t("open_settings")}>
                      <Settings className="size-4" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            )
          })
        )}
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between"
          onClick={() => setOtherOpen((v) => !v)}
        >
          {t("other_gateways")}
          <ChevronDown className={`size-4 transition ${otherOpen ? "rotate-180" : ""}`} />
        </Button>
        {otherOpen ? (
          <p className="text-muted-foreground rounded-xl border border-dashed px-3 py-4 text-sm">
            {t("no_other")}
          </p>
        ) : null}
      </div>
    </div>
  )
}
