"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Settings } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatDisplayDateTime } from "@/lib/format-date"
import {
  MARKETPLACE_PLATFORMS,
  MARKETPLACE_SETTINGS_BASE,
  type MarketplaceCategory,
  type MarketplaceHubCategory,
  type MarketplaceHubRow,
} from "@/lib/marketplace"

type HubPayload = {
  categories?: MarketplaceHubCategory[]
  platforms: MarketplaceHubRow[]
  matrix?: { live: string[]; scaffold: string[] }
}

const FALLBACK_CATEGORIES: MarketplaceHubCategory[] = [
  { id: "shops", label: "فروشگاه‌های شخص‌ثالث", label_en: "Third-party shops" },
  { id: "search", label: "موتورهای جستجوی کالا", label_en: "Shopping search" },
  { id: "classifieds", label: "آگهی‌ها", label_en: "Classifieds" },
]

function rowTitle(row: MarketplaceHubRow, locale: string): string {
  return locale.startsWith("en") ? row.label_en || row.label : row.label || row.label_en
}

function categoryLabel(cat: MarketplaceHubCategory, locale: string): string {
  return locale.startsWith("en") ? cat.label_en || cat.label : cat.label || cat.label_en
}

export function MarketplaceHubPanel() {
  const t = useTranslations("marketplace_admin")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const qc = useQueryClient()
  const [query, setQuery] = useState("")

  const q = useQuery({
    queryKey: ["marketplace-hub"],
    queryFn: () => api<HubPayload>("/api/v1/marketplace/hub"),
  })

  const toggle = useMutation({
    mutationFn: ({ platform, enabled }: { platform: string; enabled: boolean }) =>
      api(`/api/v1/marketplace/${platform}/settings`, { method: "POST", json: { enabled } }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await qc.invalidateQueries({ queryKey: ["marketplace-hub"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const platforms = q.data?.platforms ?? []
  const categories = useMemo(() => {
    if (q.data?.categories?.length) return q.data.categories
    return FALLBACK_CATEGORIES
  }, [q.data?.categories])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return platforms
    return platforms.filter((row) => {
      const title = rowTitle(row, locale).toLowerCase()
      return title.includes(needle) || row.platform.includes(needle)
    })
  }, [platforms, query, locale])

  const enabledCount = platforms.filter((r) => r.enabled).length
  const liveCount =
    q.data?.matrix?.live?.length ??
    platforms.filter((r) => r.status === "live" || (!r.coming_soon && r.status !== "scaffold")).length
  const scaffoldCount =
    q.data?.matrix?.scaffold?.length ??
    platforms.filter((r) => r.coming_soon || r.status === "scaffold").length

  return (
    <PageShell
      title={t("hub.title")}
      description={t("hub.subtitle")}
      eyebrow={t("hub.eyebrow")}
      actions={
        <div className="text-muted-foreground space-y-0.5 text-xs">
          <p>{t("hub.enabled_count", { count: enabledCount, total: platforms.length || MARKETPLACE_PLATFORMS.length })}</p>
          <p>{t("hub.matrix_hint", { live: liveCount, scaffold: scaffoldCount })}</p>
        </div>
      }
    >
      <div className="space-y-6">
        <Input
          className="max-w-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("hub.search")}
        />

        {q.isLoading ? (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        ) : q.error ? (
          <p className="text-destructive text-sm">{getApiErrorMessage(q.error)}</p>
        ) : (
          categories.map((cat) => {
            const group = filtered.filter((r) => (r.category || "shops") === cat.id)
            if (!group.length) return null
            return (
              <section key={cat.id} className="space-y-2">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight">{categoryLabel(cat, locale)}</h2>
                  <p className="text-muted-foreground text-xs">
                    {t(`hub.category_hint.${cat.id as MarketplaceCategory}`)}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.map((row) => {
                    const title = rowTitle(row, locale)
                    const soon = Boolean(row.coming_soon) || row.status === "scaffold"
                    return (
                      <div
                        key={row.platform}
                        className="bg-background/60 flex items-start gap-3 rounded-xl border px-3 py-3"
                      >
                        <Switch
                          className="mt-1"
                          checked={row.enabled}
                          disabled={soon || toggle.isPending}
                          onCheckedChange={(v) => {
                            if (soon) return
                            if (row.platform === "digikala" && v && !row.has_webhook_secret) {
                              toast.error(t("digikala.secret_missing"))
                              return
                            }
                            toggle.mutate({ platform: row.platform, enabled: v })
                          }}
                          aria-label={title}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-medium">{title}</p>
                            {soon ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {t("hub.coming_soon")}
                              </Badge>
                            ) : row.configured ? (
                              <Badge variant="outline" className="text-[10px]">
                                {t("hub.configured")}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">
                                {t("hub.not_configured")}
                              </Badge>
                            )}
                            {!soon && row.auto_sync ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {t("auto_sync")}
                              </Badge>
                            ) : null}
                            {!soon && row.failed_jobs > 0 ? (
                              <Badge variant="destructive" className="text-[10px]">
                                {t("hub.failed_jobs", { count: row.failed_jobs })}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-muted-foreground text-xs">
                            {soon
                              ? t("hub.coming_soon_desc")
                              : row.kind === "feed"
                                ? t("hub.feed_hint")
                                : t("hub.configure_hint")}
                          </p>
                          {!soon && row.kind === "api" ? (
                            <dl className="text-muted-foreground grid grid-cols-3 gap-2 pt-1 text-[11px]">
                              <div>
                                <dt>{t("hub.maps")}</dt>
                                <dd className="text-foreground text-sm font-medium">{row.maps_count}</dd>
                              </div>
                              <div>
                                <dt>{t("hub.map_errors")}</dt>
                                <dd
                                  className={
                                    row.map_errors
                                      ? "text-destructive text-sm font-medium"
                                      : "text-foreground text-sm font-medium"
                                  }
                                >
                                  {row.map_errors}
                                </dd>
                              </div>
                              <div>
                                <dt>{t("hub.orders")}</dt>
                                <dd className="text-foreground text-sm font-medium">{row.orders_count}</dd>
                              </div>
                            </dl>
                          ) : null}
                          {!soon && row.last_sync_at ? (
                            <p className="text-muted-foreground text-[11px]">
                              {t("last_sync")}: {formatDisplayDateTime(row.last_sync_at, locale)}
                            </p>
                          ) : null}
                        </div>
                        <Button type="button" variant="ghost" size="icon" asChild>
                          <Link
                            href={`${MARKETPLACE_SETTINGS_BASE}/${row.platform}`}
                            aria-label={soon ? t("hub.view_soon") : t("hub.manage")}
                          >
                            <Settings className="size-4" />
                          </Link>
                        </Button>
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
