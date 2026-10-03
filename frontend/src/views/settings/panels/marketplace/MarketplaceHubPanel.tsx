"use client"

import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { MARKETPLACE_SETTINGS_BASE, type MarketplaceHubRow } from "@/lib/marketplace"
import { formatDisplayDateTime } from "@/lib/format-date"

export function MarketplaceHubPanel() {
  const t = useTranslations("marketplace_admin")
  const locale = useLocale()
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ["marketplace-hub"],
    queryFn: () => api<{ platforms: MarketplaceHubRow[] }>("/api/v1/marketplace/hub"),
  })

  const toggle = useMutation({
    mutationFn: ({ platform, enabled }: { platform: string; enabled: boolean }) =>
      api(`/api/v1/marketplace/${platform}/settings`, { method: "POST", json: { enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketplace-hub"] }),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (q.isLoading) return <p className="text-muted-foreground text-sm">{t("loading")}</p>
  if (q.error) return <p className="text-destructive text-sm">{getApiErrorMessage(q.error)}</p>

  const rows = q.data?.platforms ?? []
  const groups: { key: "api" | "feed"; title: string; hint: string }[] = [
    { key: "api", title: t("hub.marketplaces"), hint: t("hub.marketplaces_hint") },
    { key: "feed", title: t("hub.search_engines"), hint: t("hub.search_engines_hint") },
  ]

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.key} className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">{g.title}</h2>
            <p className="text-muted-foreground text-sm">{g.hint}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows
              .filter((r) => r.kind === g.key)
              .map((r) => (
                <Card key={r.platform}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{locale === "en" ? r.label_en : r.label}</CardTitle>
                      <Switch
                        checked={r.enabled}
                        disabled={toggle.isPending}
                        onCheckedChange={(v) => {
                          if (r.platform === "digikala" && v && !r.has_webhook_secret) {
                            toast.error(t("digikala.secret_missing"))
                            return
                          }
                          toggle.mutate({ platform: r.platform, enabled: v })
                        }}
                        aria-label={t("enabled")}
                      />
                    </div>
                    <CardDescription className="flex flex-wrap gap-1 pt-1">
                      <Badge variant={r.configured ? "secondary" : "outline"}>
                        {r.configured ? t("hub.configured") : t("hub.not_configured")}
                      </Badge>
                      {r.auto_sync ? <Badge variant="secondary">{t("auto_sync")}</Badge> : null}
                      {r.failed_jobs > 0 ? (
                        <Badge variant="destructive">{t("hub.failed_jobs", { count: r.failed_jobs })}</Badge>
                      ) : null}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {r.kind === "api" ? (
                      <dl className="text-muted-foreground grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <dt>{t("hub.maps")}</dt>
                          <dd className="text-foreground text-sm font-medium">{r.maps_count}</dd>
                        </div>
                        <div>
                          <dt>{t("hub.map_errors")}</dt>
                          <dd className={r.map_errors ? "text-destructive text-sm font-medium" : "text-foreground text-sm font-medium"}>
                            {r.map_errors}
                          </dd>
                        </div>
                        <div>
                          <dt>{t("hub.orders")}</dt>
                          <dd className="text-foreground text-sm font-medium">{r.orders_count}</dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="text-muted-foreground text-xs">{t("hub.feed_hint")}</p>
                    )}
                    {r.last_sync_at ? (
                      <p className="text-muted-foreground text-xs">
                        {t("last_sync")}: {formatDisplayDateTime(r.last_sync_at, locale)}
                      </p>
                    ) : null}
                    <Button asChild variant="outline" size="sm">
                      <Link href={`${MARKETPLACE_SETTINGS_BASE}/${r.platform}`}>{t("hub.manage")}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
          </div>
        </section>
      ))}
    </div>
  )
}
