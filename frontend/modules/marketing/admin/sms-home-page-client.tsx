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
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatNumber, toLocaleDigits } from "@/lib/locale"
import { fetchSmsDashboard, smsQueryOptions, type SmsMessage } from "../lib/modirpayamak-api"
import {
  formatSmsDateTime,
  localMessagePreview,
  localRecipientsPreview,
} from "../lib/sms-report"
import { SmsPanelShell } from "../lib/sms-panel-shell"
import { translateSmsStatus } from "../lib/sms-ui"

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")
  const locale = useLocale()

  const dashQ = useQuery({
    queryKey: ["sms", "dashboard"],
    queryFn: () => fetchSmsDashboard(),
    ...smsQueryOptions,
  })

  const unavailable = dashQ.data ? isSmsUnavailable(dashQ.data) : false
  const account = unavailable ? null : (dashQ.data?.account ?? null)
  const messages: SmsMessage[] = unavailable ? [] : (dashQ.data?.messages?.slice(0, 10) ?? [])
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ListStatsStrip
          items={[
            {
              id: "balance",
              label: t("balance"),
              value: loading
                ? "…"
                : `${toLocaleDigits(formatNumber(account?.balance ?? 0, locale), locale)} ${t("toman")}`,
            },
            {
              id: "status",
              label: t("status"),
              value: account?.status ?? (unavailable ? "—" : "…"),
            },
            {
              id: "recent",
              label: t("recentSends"),
              value: toLocaleDigits(messages.length, locale),
            },
          ]}
        />
        <Button asChild disabled={unavailable} size="sm">
          <Link href="/admin/marketing/sms/topup">{t("topup")}</Link>
        </Button>
      </div>

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
                          <Badge variant="outline">{m.sending_type || "—"}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate font-mono text-xs" dir="ltr">
                          {localRecipientsPreview(row)}
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate">{localMessagePreview(row)}</TableCell>
                        <TableCell>{translateSmsStatus(t, m.status)}</TableCell>
                        <TableCell dir="ltr">
                          {m.cost != null
                            ? toLocaleDigits(formatNumber(m.cost, locale), locale)
                            : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatSmsDateTime(m.created_at, locale)}
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
