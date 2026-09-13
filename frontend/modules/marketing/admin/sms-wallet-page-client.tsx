"use client"

import Link from "next/link"
import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { isSmsUnavailable, SmsServiceBanner } from "@/components/marketing/SmsServiceBanner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { fetchSmsAccount, fetchSmsLedger, smsQueryOptions } from "../lib/modirpayamak-api"
import { formatSmsDateTime } from "../lib/sms-report"
import { SmsPanelShell } from "../lib/sms-panel-shell"

const LEDGER_PAGE_SIZE = 30

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")
  const locale = useLocale()
  const [page, setPage] = useState(1)

  const accountQ = useQuery({
    queryKey: ["sms", "account"],
    queryFn: fetchSmsAccount,
    ...smsQueryOptions,
  })

  const ledgerQ = useQuery({
    queryKey: ["sms", "ledger", page],
    queryFn: () => fetchSmsLedger(page, LEDGER_PAGE_SIZE),
    ...smsQueryOptions,
  })

  const unavailable = isSmsUnavailable(accountQ.data) || isSmsUnavailable(ledgerQ.data)
  const account = isSmsUnavailable(accountQ.data) ? null : (accountQ.data?.account ?? null)
  const ledger = isSmsUnavailable(ledgerQ.data) ? [] : (ledgerQ.data?.ledger ?? [])
  const balanceLoading = accountQ.isPending

  return (
    <SmsPanelShell title={t("walletTitle")} description={t("walletHint")}>
      {(accountQ.isError || ledgerQ.isError) && (
        <SmsServiceBanner
          message={getApiErrorMessage(accountQ.error ?? ledgerQ.error)}
          onRetry={() => {
            void accountQ.refetch()
            void ledgerQ.refetch()
          }}
        />
      )}
      {unavailable ? (
        <SmsServiceBanner
          message={String(
            (accountQ.data as { message?: string })?.message ??
              (ledgerQ.data as { message?: string })?.message ??
              "",
          )}
          onRetry={() => {
            void accountQ.refetch()
            void ledgerQ.refetch()
          }}
        />
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">{t("balance")}</CardTitle>
          </CardHeader>
          <CardContent>
            {balanceLoading ? (
              <Skeleton className="h-9 w-40" />
            ) : (
              <p className="text-3xl font-bold">
                {toLocaleDigits(formatNumber(account?.balance ?? 0, locale), locale)}{" "}
                <span className="text-base font-normal">{t("toman")}</span>
              </p>
            )}
            <Button asChild className="mt-4" variant="outline" disabled={unavailable}>
              <Link href="/admin/marketing/sms/topup">{t("topup")}</Link>
            </Button>
          </CardContent>
        </Card>

        {account ? (
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">{t("walletAccount")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-1 text-sm">
                {account.domain ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t("walletDomain")}</dt>
                    <dd>{account.domain}</dd>
                  </div>
                ) : null}
                {account.default_from ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t("fromNumber")}</dt>
                    <dd dir="ltr">{account.default_from}</dd>
                  </div>
                ) : null}
                {account.status ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t("status")}</dt>
                    <dd>{account.status}</dd>
                  </div>
                ) : null}
                {account.price_per_unit != null ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t("unitPrice")}</dt>
                    <dd>{account.price_per_unit}</dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>
        ) : balanceLoading ? (
          <Card className="shadow-soft">
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">{t("ledger")}</CardTitle>
          <CardDescription>{t("ledgerTitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t("ledgerDate")}</TableHead>
                  <TableHead>{t("ledgerDescription")}</TableHead>
                  <TableHead>{t("ledgerAmount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgerQ.isPending
                  ? Array.from({ length: 6 }, (_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={4}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : ledger.length === 0
                    ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-muted-foreground text-sm">
                            {t("ledgerEmpty")}
                          </TableCell>
                        </TableRow>
                      )
                    : ledger.map((row, i) => (
                        <TableRow key={String(row.id ?? i)}>
                          <TableCell>
                            {toLocaleDigits(String(row.id ?? i + 1), locale)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatSmsDateTime(row.date ?? row.created_at ?? row.time, locale)}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {String(row.description ?? row.title ?? row.type ?? "—")}
                          </TableCell>
                          <TableCell>
                            {typeof row.amount === "number"
                              ? toLocaleDigits(formatNumber(row.amount, locale), locale)
                              : String(row.amount ?? "—")}
                          </TableCell>
                        </TableRow>
                      ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || ledgerQ.isPending}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">{toLocaleDigits(page, locale)}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={ledgerQ.isPending || ledger.length < LEDGER_PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </SmsPanelShell>
  )
}
