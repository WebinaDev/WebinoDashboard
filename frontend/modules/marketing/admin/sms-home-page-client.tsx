"use client"

import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"

import { ListStatsStrip } from "@/components/ListStatsStrip"
import { isSmsUnavailable, SmsServiceBanner } from "@/components/marketing/SmsServiceBanner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { dashboardPath } from "@/kernel/paths"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatNumber, toLocaleDigits } from "@/lib/locale"
import {
  fetchSmsAds,
  fetchSmsDashboard,
  smsQueryOptions,
  type SmsAdCampaign,
  type SmsMessage,
} from "../lib/modirpayamak-api"
import {
  formatSmsDateTime,
  localMessagePreview,
  localRecipientsPreview,
} from "../lib/sms-report"
import { SmsPanelShell } from "../lib/sms-panel-shell"
import { translateSmsStatus } from "../lib/sms-ui"

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")
  const tAds = useTranslations("smsAds")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const none = tCommon("none")

  const dashQ = useQuery({
    queryKey: ["sms", "dashboard"],
    queryFn: () => fetchSmsDashboard(),
    ...smsQueryOptions,
  })

  const adsQ = useQuery({
    queryKey: ["sms", "ads"],
    queryFn: fetchSmsAds,
    ...smsQueryOptions,
  })

  const unavailable = dashQ.data ? isSmsUnavailable(dashQ.data) : false
  const account = unavailable ? null : (dashQ.data?.account ?? null)
  const messages: SmsMessage[] = unavailable ? [] : (dashQ.data?.messages?.slice(0, 10) ?? [])
  const campaigns: SmsAdCampaign[] = adsQ.data?.items ?? []
  const loading = dashQ.isPending || dashQ.isFetching

  return (
    <SmsPanelShell title={t("dashboardTitle")} description={t("dashboardDesc")}>
      {dashQ.isError ? (
        <SmsServiceBanner message={getApiErrorMessage(dashQ.error)} onRetry={() => void dashQ.refetch()} />
      ) : null}
      {unavailable ? (
        <SmsServiceBanner
          message={String((dashQ.data as { message?: string })?.message ?? "")}
          onRetry={() => void dashQ.refetch()}
        />
      ) : null}

      <Card className="mb-4 overflow-hidden shadow-soft">
        <CardContent className="grid gap-4 pt-6 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <h2 className="text-xl font-semibold md:text-2xl">{tAds("heroTitle")}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{tAds("heroDesc")}</p>
            <Button asChild size="sm">
              <Link href={dashboardPath("marketing/sms/ads/new")}>{tAds("createCta")}</Link>
            </Button>
          </div>
          <div className="grid gap-2 text-sm">
            {(
              [
                ["bannerVolume", "bannerVolumeDesc"],
                ["bannerSegments", "bannerSegmentsDesc"],
                ["bannerCopy", "bannerCopyDesc"],
              ] as const
            ).map(([title, desc]) => (
              <div key={title} className="border-border rounded-lg border p-3">
                <p className="font-medium">{tAds(title)}</p>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{tAds(desc)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ListStatsStrip
          currency="IRT"
          items={[
            {
              id: "balance",
              label: t("balance"),
              value: loading ? "…" : (account?.balance ?? 0),
              money: !loading,
            },
            {
              id: "status",
              label: t("status"),
              value: account?.status ?? (unavailable ? none : "…"),
            },
            {
              id: "recent",
              label: t("recentSends"),
              value: toLocaleDigits(messages.length, locale),
            },
          ]}
        />
        <Button asChild disabled={unavailable} size="sm">
          <Link href={dashboardPath("marketing/sms/topup")}>{t("topup")}</Link>
        </Button>
      </div>

      <Card className="mb-4 shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">{tAds("campaignsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {adsQ.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : campaigns.length === 0 ? (
            <p className="text-muted-foreground text-sm">{tAds("noCampaigns")}</p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {campaigns.slice(0, 8).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link className="text-primary truncate hover:underline" href={dashboardPath(`marketing/sms/ads/${c.id}`)}>
                    {c.name}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {tAds(`status.${c.status}` as "status.scheduled")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">{t("recentSends")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noMessages")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("type")}</TableHead>
                    <TableHead>{t("recipient")}</TableHead>
                    <TableHead>{t("message")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead>{t("cost")}</TableHead>
                    <TableHead>{t("sentAt")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map((m) => {
                    const row = m as unknown as Record<string, unknown>
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <Badge variant="outline">{m.sending_type || none}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate font-mono text-xs" dir="ltr">
                          {localRecipientsPreview(row)}
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate">{localMessagePreview(row)}</TableCell>
                        <TableCell>{translateSmsStatus(t, m.status)}</TableCell>
                        <TableCell dir="ltr">
                          {m.cost != null ? toLocaleDigits(formatNumber(m.cost, locale), locale) : none}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatSmsDateTime(m.created_at, locale, none)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </SmsPanelShell>
  )
}
