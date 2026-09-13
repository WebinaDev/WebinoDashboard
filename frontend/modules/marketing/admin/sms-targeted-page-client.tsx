"use client"

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"

import { isSmsUnavailable, SmsServiceBanner } from "@/components/marketing/SmsServiceBanner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
import {
  fetchSmsBulkRecipients,
  fetchSmsBulkStats,
  fetchSmsOutbox,
  smsQueryOptions,
} from "../lib/modirpayamak-api"
import {
  formatSmsDateTime,
  outboxId,
  outboxMessage,
  outboxSender,
  outboxTime,
  outboxType,
  resolveOutboxStatus,
  smsField,
  unwrapSmsList,
} from "../lib/sms-report"
import { SmsPanelShell } from "../lib/sms-panel-shell"
import { translateSmsStatus } from "../lib/sms-ui"

function statsEntries(data: unknown): Array<{ key: string; value: string }> {
  if (!data || typeof data !== "object") return []
  const obj = data as Record<string, unknown>
  const src =
    obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)
      ? (obj.data as Record<string, unknown>)
      : obj
  return Object.entries(src)
    .filter(([, v]) => v !== null && typeof v !== "object")
    .map(([key, value]) => ({ key, value: String(value) }))
}

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")
  const locale = useLocale()
  const [selected, setSelected] = useState("")

  const outboxQ = useQuery({
    queryKey: ["sms", "outbox", "targeted"],
    queryFn: () => fetchSmsOutbox(1, 40),
    ...smsQueryOptions,
  })
  const unavailable = outboxQ.data ? isSmsUnavailable(outboxQ.data) : false
  const rows = useMemo(
    () => (unavailable ? [] : unwrapSmsList(outboxQ.data?.data)),
    [unavailable, outboxQ.data],
  )

  const statsQ = useQuery({
    queryKey: ["sms", "bulk-stats", selected],
    queryFn: () => fetchSmsBulkStats(selected),
    enabled: !!selected,
    ...smsQueryOptions,
  })
  const recipientsQ = useQuery({
    queryKey: ["sms", "bulk-recipients", selected],
    queryFn: () => fetchSmsBulkRecipients(selected, 1),
    enabled: !!selected,
    ...smsQueryOptions,
  })

  const stats = statsEntries(statsQ.data?.data ?? statsQ.data)
  const recipients = unwrapSmsList(recipientsQ.data?.data ?? recipientsQ.data)

  return (
    <SmsPanelShell title={t("targetedTitle")} description={t("targetedHint")}>
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
          <CardTitle className="text-base">{t("pickCampaign")}</CardTitle>
          <CardDescription>{t("selectOutbox")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            className="max-w-xs font-mono"
            dir="ltr"
            placeholder={t("outboxIdPlaceholder")}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("outboxId")}</TableHead>
                  <TableHead>{t("senderLine")}</TableHead>
                  <TableHead>{t("type")}</TableHead>
                  <TableHead>{t("message")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("sentAt")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {outboxQ.isPending
                  ? Array.from({ length: 4 }, (_, i) => (
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
                        const id = outboxId(r)
                        return (
                          <TableRow key={`${id}-${i}`}>
                            <TableCell className="font-mono text-xs" dir="ltr">
                              {toLocaleDigits(id, locale)}
                            </TableCell>
                            <TableCell className="font-mono text-xs" dir="ltr">
                              {outboxSender(r)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{outboxType(r)}</Badge>
                            </TableCell>
                            <TableCell className="max-w-[14rem] truncate" title={outboxMessage(r)}>
                              {outboxMessage(r)}
                            </TableCell>
                            <TableCell>{resolveOutboxStatus(t, r)}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              {formatSmsDateTime(outboxTime(r), locale)}
                            </TableCell>
                            <TableCell className="text-end">
                              {id !== "—" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={selected === id ? "default" : "outline"}
                                  onClick={() => setSelected(id)}
                                >
                                  {t("viewStats")}
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        )
                      })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selected ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">{t("bulkStats")}</CardTitle>
            </CardHeader>
            <CardContent>
              {statsQ.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : stats.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("common.empty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("statKey")}</TableHead>
                        <TableHead>{t("statValue")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell className="font-mono text-xs" dir="ltr">
                            {row.key}
                          </TableCell>
                          <TableCell dir="ltr">{row.value}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">{t("recipients")}</CardTitle>
            </CardHeader>
            <CardContent>
              {recipientsQ.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : recipients.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("common.empty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("phone")}</TableHead>
                        <TableHead>{t("status")}</TableHead>
                        <TableHead>{t("date")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recipients.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs" dir="ltr">
                            {smsField(r, "recipient", "phone", "to", "mobile", "number") || "—"}
                          </TableCell>
                          <TableCell>
                            {translateSmsStatus(t, r.status ?? r.state ?? r.deliver_status)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatSmsDateTime(r.time ?? r.created_at ?? r.send_time, locale)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </SmsPanelShell>
  )
}
