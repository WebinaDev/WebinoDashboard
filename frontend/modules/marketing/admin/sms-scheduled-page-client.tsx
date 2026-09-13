"use client"

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

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
import { cancelScheduledSms, fetchSmsOutbox, smsQueryOptions } from "../lib/modirpayamak-api"
import {
  formatSmsDateTime,
  isUnixFuture,
  outboxId,
  outboxMessage,
  outboxSender,
  outboxTime,
  outboxType,
  resolveOutboxStatus,
  smsNum,
  unwrapSmsList,
} from "../lib/sms-report"
import { SmsPanelShell } from "../lib/sms-panel-shell"

const PAGE_SIZE = 50

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")
  const locale = useLocale()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const outboxQ = useQuery({
    queryKey: ["sms", "outbox", "scheduled", page],
    queryFn: () => fetchSmsOutbox(page, PAGE_SIZE),
    ...smsQueryOptions,
  })

  const unavailable = outboxQ.data ? isSmsUnavailable(outboxQ.data) : false
  const allItems = useMemo(
    () => (unavailable ? [] : unwrapSmsList(outboxQ.data?.data)),
    [unavailable, outboxQ.data],
  )

  const scheduled = useMemo(
    () =>
      allItems.filter((m) => {
        const stateId = smsNum(m, "state_id")
        if (isUnixFuture(outboxTime(m))) return true
        if (stateId != null && [0, 1, 5].includes(stateId) && isUnixFuture(m.time_send ?? m.time)) {
          return true
        }
        return false
      }),
    [allItems],
  )

  const loading = outboxQ.isPending

  const cancel = async (id: string) => {
    setCancellingId(id)
    try {
      const res = await cancelScheduledSms(id)
      if (res.ok) {
        toast.success(t("cancelled"))
        void qc.invalidateQueries({ queryKey: ["sms", "outbox"] })
      } else {
        toast.error(t("cancelFailed"))
      }
    } catch (e) {
      toast.error(getApiErrorMessage(e as Error))
    }
    setCancellingId(null)
  }

  return (
    <SmsPanelShell title={t("scheduledTitle")} description={t("scheduledHint")}>
      {outboxQ.isError ? (
        <SmsServiceBanner
          message={getApiErrorMessage(outboxQ.error)}
          onRetry={() => void outboxQ.refetch()}
        />
      ) : null}
      {unavailable ? (
        <SmsServiceBanner
          message={String((outboxQ.data as { message?: string })?.message ?? "")}
          onRetry={() => void outboxQ.refetch()}
        />
      ) : null}

      <div className="mb-3 flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void outboxQ.refetch()}>
          <RefreshCw className="me-2 h-4 w-4" />
          {t("refresh")}
        </Button>
      </div>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">{t("scheduledTitle")}</CardTitle>
          <CardDescription>{t("scheduledHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("outboxId")}</TableHead>
                  <TableHead>{t("senderLine")}</TableHead>
                  <TableHead>{t("type")}</TableHead>
                  <TableHead>{t("message")}</TableHead>
                  <TableHead>{t("scheduledFor")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 5 }, (_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={7}>
                          <Skeleton className="h-7 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : scheduled.length === 0
                    ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-muted-foreground text-sm">
                            {t("noScheduled")}
                          </TableCell>
                        </TableRow>
                      )
                    : scheduled.map((m, i) => {
                        const id = outboxId(m)
                        return (
                          <TableRow key={`${id}-${i}`}>
                            <TableCell className="font-mono text-xs" dir="ltr">
                              {toLocaleDigits(id, locale)}
                            </TableCell>
                            <TableCell className="font-mono text-xs" dir="ltr">
                              {outboxSender(m)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{outboxType(m)}</Badge>
                            </TableCell>
                            <TableCell className="max-w-[16rem] truncate" title={outboxMessage(m)}>
                              {outboxMessage(m)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {formatSmsDateTime(outboxTime(m), locale)}
                            </TableCell>
                            <TableCell>{resolveOutboxStatus(t, m)}</TableCell>
                            <TableCell>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={cancellingId === id || unavailable || id === "—"}
                                onClick={() => void cancel(id)}
                              >
                                {cancellingId === id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  t("cancelSend")
                                )}
                              </Button>
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
              disabled={page <= 1 || loading}
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
              disabled={loading || allItems.length < PAGE_SIZE}
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
