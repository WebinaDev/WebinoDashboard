"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { dashboardPath } from "@/kernel/paths"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatNumber } from "@/lib/locale"

import { cancelSmsAd, fetchSmsAdStats, smsQueryOptions } from "../lib/modirpayamak-api"
import { formatSmsDateTime } from "../lib/sms-report"
import { SmsPanelShell } from "../lib/sms-panel-shell"

export default function PageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("smsAds")
  const tSms = useTranslations("sms")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const adId = String(route.params?.adId ?? "")
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ["sms", "ads", "stats", adId],
    queryFn: () => fetchSmsAdStats(adId),
    enabled: !!adId,
    ...smsQueryOptions,
  })

  const cancelMut = useMutation({
    mutationFn: () => cancelSmsAd(adId),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["sms", "ads"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const fmt = (n: number) => formatNumber(n, locale)
  const none = tCommon("none")

  if (q.isLoading) {
    return (
      <SmsPanelShell title={t("detailTitle")}>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </SmsPanelShell>
    )
  }

  const data = q.data
  const camp = data?.campaign

  if (!data || !camp) {
    return (
      <SmsPanelShell title={t("detailTitle")}>
        <p className="text-muted-foreground text-sm">{t("notFound")}</p>
        <Button asChild className="mt-3" variant="outline">
          <Link href={dashboardPath("marketing/sms")}>{t("backHome")}</Link>
        </Button>
      </SmsPanelShell>
    )
  }

  const kpis = [
    { label: t("kpi.sent"), value: fmt(data.sent) },
    { label: t("kpi.failed"), value: fmt(data.failed) },
    { label: t("kpi.cost"), value: fmt(data.cost) },
    { label: t("kpi.orders"), value: fmt(data.orders) },
    { label: t("kpi.revenue"), value: fmt(data.revenue) },
    { label: t("kpi.roas"), value: data.roas == null ? none : fmt(data.roas) },
    { label: t("kpi.conversion"), value: `${fmt(data.conversion_pct)}%` },
  ]

  const canCancel = camp.status === "scheduled"

  return (
    <SmsPanelShell title={camp.name} description={t("detailTitle")}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            {t(`status.${camp.status}` as "status.scheduled")} ·{" "}
            {formatSmsDateTime(
              camp.scheduled_at ? new Date(camp.scheduled_at * 1000).toISOString() : "",
              locale,
              none,
            )}
          </p>
          <div className="flex gap-2">
            {canCancel ? (
              <Button
                type="button"
                variant="outline"
                disabled={cancelMut.isPending}
                onClick={() => cancelMut.mutate()}
              >
                {t("cancelCampaign")}
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href={dashboardPath("marketing/sms")}>{t("backHome")}</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label} className="shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-sm font-normal">{k.label}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{k.value}</CardContent>
            </Card>
          ))}
        </div>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>{t("attributedOrders")}</CardTitle>
          </CardHeader>
          <CardContent>
            {(data.order_samples ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noOrders")}</p>
            ) : (
              <ul className="divide-border divide-y text-sm">
                {data.order_samples.map((o) => (
                  <li key={o.id} className="flex justify-between gap-2 py-2">
                    <Link className="text-primary hover:underline" href={dashboardPath(`orders/${o.id}`)}>
                      #{o.number}
                    </Link>
                    <span dir="ltr">{fmt(o.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>{tSms("message")}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted/40 whitespace-pre-wrap rounded-lg p-3 text-sm">{camp.message}</pre>
          </CardContent>
        </Card>
      </div>
    </SmsPanelShell>
  )
}
