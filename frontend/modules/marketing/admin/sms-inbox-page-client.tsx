"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"

import { isSmsUnavailable, SmsServiceBanner } from "@/components/marketing/SmsServiceBanner"
import { Badge } from "@/components/ui/badge"
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
import { toLocaleDigits } from "@/lib/locale"
import { fetchSmsInbox, smsQueryOptions } from "../lib/modirpayamak-api"
import { formatSmsDateTime, smsField, unwrapSmsList } from "../lib/sms-report"
import { SmsPanelShell } from "../lib/sms-panel-shell"

const PAGE_SIZE = 30

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")
  const locale = useLocale()
  const [page, setPage] = useState(1)

  const q = useQuery({
    queryKey: ["sms", "inbox", page],
    queryFn: () => fetchSmsInbox(page, PAGE_SIZE),
    ...smsQueryOptions,
  })

  const unavailable = q.data ? isSmsUnavailable(q.data) : false
  const rows = unavailable ? [] : unwrapSmsList(q.data?.data)

  return (
    <SmsPanelShell title={t("inboxTitle")} description={t("inboxHint")}>
      {q.isError ? (
        <SmsServiceBanner message={getApiErrorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : null}
      {unavailable ? (
        <SmsServiceBanner
          message={String((q.data as { message?: string })?.message ?? "")}
          onRetry={() => void q.refetch()}
        />
      ) : null}

      <div className="mb-3 flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
          <RefreshCw className="me-2 h-4 w-4" />
          {t("refresh")}
        </Button>
      </div>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">{t("inboxTitle")}</CardTitle>
          <CardDescription>{t("inboxHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("outboxId")}</TableHead>
                  <TableHead>{t("from")}</TableHead>
                  <TableHead>{t("toLine")}</TableHead>
                  <TableHead>{t("message")}</TableHead>
                  <TableHead>{t("type")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isPending
                  ? Array.from({ length: 6 }, (_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={7}>
                          <Skeleton className="h-7 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : rows.length === 0
                    ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-muted-foreground text-sm">
                            {t("noMessages")}
                          </TableCell>
                        </TableRow>
                      )
                    : rows.map((r, i) => {
                        const id = smsField(r, "messages_inbox_id", "id") || String(i + 1)
                        const seen = smsField(r, "seen")
                        const message = smsField(r, "message", "text", "body")
                        return (
                          <TableRow key={`${id}-${i}`}>
                            <TableCell className="font-mono text-xs" dir="ltr">
                              {toLocaleDigits(id, locale)}
                            </TableCell>
                            <TableCell className="font-mono text-xs" dir="ltr">
                              {smsField(r, "from", "sender") || "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs" dir="ltr">
                              {smsField(r, "number", "to", "line") || "—"}
                            </TableCell>
                            <TableCell className="max-w-[22rem] truncate" title={message}>
                              {message || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{smsField(r, "type") || "—"}</Badge>
                            </TableCell>
                            <TableCell>
                              {seen === "1" || seen === "true" ? t("seen") : t("unseen")}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {formatSmsDateTime(r.time ?? r.created_at ?? r.received_at, locale)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || q.isPending}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-muted-foreground text-sm">
              {toLocaleDigits(t("pageOf", { page: String(page) }), locale)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={q.isPending || rows.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </SmsPanelShell>
  )
}
