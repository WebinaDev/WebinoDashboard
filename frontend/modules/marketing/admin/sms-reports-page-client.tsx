"use client"

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, Eye, RefreshCw } from "lucide-react"

import { isSmsUnavailable, SmsServiceBanner } from "@/components/marketing/SmsServiceBanner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatNumber, toLocaleDigits } from "@/lib/locale"
import {
  fetchSmsBulkRecipients,
  fetchSmsInbox,
  fetchSmsMessages,
  fetchSmsOutbox,
  smsQueryOptions,
} from "../lib/modirpayamak-api"
import {
  formatSmsDateTime,
  localMessagePreview,
  localRecipientsPreview,
  outboxId,
  outboxMessage,
  outboxSender,
  outboxTime,
  outboxType,
  resolveOutboxStatus,
  smsField,
  smsNum,
  unwrapSmsList,
} from "../lib/sms-report"
import { SmsPanelShell } from "../lib/sms-panel-shell"
import { translateSmsStatus } from "../lib/sms-ui"

const PAGE_SIZE = 20

function PaginationBar({
  page,
  loading,
  hasMore,
  onPrev,
  onNext,
  label,
}: {
  page: number
  loading: boolean
  hasMore: boolean
  onPrev: () => void
  onNext: () => void
  label: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={onPrev}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      <span className="text-muted-foreground text-sm">{label}</span>
      <Button variant="outline" size="sm" disabled={loading || !hasMore} onClick={onNext}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
    </div>
  )
}

function DetailRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="grid gap-1 border-b py-2 last:border-0 sm:grid-cols-[10rem_1fr]">
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      <div className="text-sm break-words whitespace-pre-wrap" dir={ltr ? "ltr" : undefined}>
        {value || "—"}
      </div>
    </div>
  )
}

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")
  const locale = useLocale()
  const [tab, setTab] = useState<"local" | "outbox" | "inbox">("outbox")
  const [localPage, setLocalPage] = useState(1)
  const [outboxPage, setOutboxPage] = useState(1)
  const [inboxPage, setInboxPage] = useState(1)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
  const detailId = detail ? outboxId(detail) : ""

  const messagesQ = useQuery({
    queryKey: ["sms", "messages", localPage],
    queryFn: () => fetchSmsMessages(localPage),
    ...smsQueryOptions,
  })
  const outboxQ = useQuery({
    queryKey: ["sms", "outbox", outboxPage],
    queryFn: () => fetchSmsOutbox(outboxPage, PAGE_SIZE),
    ...smsQueryOptions,
  })
  const inboxQ = useQuery({
    queryKey: ["sms", "inbox", inboxPage],
    queryFn: () => fetchSmsInbox(inboxPage, PAGE_SIZE),
    ...smsQueryOptions,
  })
  const recipientsQ = useQuery({
    queryKey: ["sms", "bulk-recipients", "report-detail", detailId],
    queryFn: () => fetchSmsBulkRecipients(detailId, 1),
    enabled: !!detail && detailId !== "—",
    ...smsQueryOptions,
  })

  const detailRecipients = unwrapSmsList(recipientsQ.data?.data ?? recipientsQ.data)
  const unavailable =
    isSmsUnavailable(messagesQ.data) || isSmsUnavailable(outboxQ.data) || isSmsUnavailable(inboxQ.data)

  const localMessages = useMemo(() => {
    if (isSmsUnavailable(messagesQ.data)) return []
    const raw = messagesQ.data?.messages
    return Array.isArray(raw) ? (raw as unknown as Array<Record<string, unknown>>) : []
  }, [messagesQ.data])

  const outboxItems = useMemo(
    () => (isSmsUnavailable(outboxQ.data) ? [] : unwrapSmsList(outboxQ.data?.data)),
    [outboxQ.data],
  )
  const inboxItems = useMemo(
    () => (isSmsUnavailable(inboxQ.data) ? [] : unwrapSmsList(inboxQ.data?.data)),
    [inboxQ.data],
  )

  const pageLabel = (page: number) =>
    toLocaleDigits(t("pageOf", { page: String(page) }), locale)

  const refreshAll = () => {
    void messagesQ.refetch()
    void outboxQ.refetch()
    void inboxQ.refetch()
  }

  const err =
    messagesQ.isError || outboxQ.isError || inboxQ.isError
      ? getApiErrorMessage(messagesQ.error ?? outboxQ.error ?? inboxQ.error)
      : null

  return (
    <SmsPanelShell title={t("reportsTitle")} description={t("reportsHint")}>
      {err ? <SmsServiceBanner message={err} onRetry={refreshAll} /> : null}
      {unavailable ? (
        <SmsServiceBanner
          message={String(
            (messagesQ.data as { message?: string })?.message ??
              (outboxQ.data as { message?: string })?.message ??
              (inboxQ.data as { message?: string })?.message ??
              "",
          )}
          onRetry={refreshAll}
        />
      ) : null}

      <div className="mb-3 flex justify-end">
        <Button variant="outline" size="sm" onClick={refreshAll}>
          <RefreshCw className="me-2 h-4 w-4" />
          {t("refresh")}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="outbox">{t("outbox")}</TabsTrigger>
          <TabsTrigger value="local">{t("localMessages")}</TabsTrigger>
          <TabsTrigger value="inbox">{t("inbox")}</TabsTrigger>
        </TabsList>

        <TabsContent value="outbox" className="mt-0">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">{t("outbox")}</CardTitle>
              <CardDescription>{t("outboxHint")}</CardDescription>
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
                      <TableHead>{t("recipientsCount")}</TableHead>
                      <TableHead>{t("exitCount")}</TableHead>
                      <TableHead>{t("status")}</TableHead>
                      <TableHead>{t("cost")}</TableHead>
                      <TableHead>{t("sentAt")}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outboxQ.isPending
                      ? Array.from({ length: 6 }, (_, i) => (
                          <TableRow key={i}>
                            <TableCell colSpan={10}>
                              <Skeleton className="h-7 w-full" />
                            </TableCell>
                          </TableRow>
                        ))
                      : outboxItems.length === 0
                        ? (
                            <TableRow>
                              <TableCell colSpan={10} className="text-muted-foreground text-sm">
                                {t("noMessages")}
                              </TableCell>
                            </TableRow>
                          )
                        : outboxItems.map((m, i) => {
                            const id = outboxId(m)
                            const cost = smsNum(m, "cost")
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
                                <TableCell className="max-w-[18rem] truncate" title={outboxMessage(m)}>
                                  {outboxMessage(m)}
                                </TableCell>
                                <TableCell dir="ltr">
                                  {smsField(m, "rcpts_count", "recipients_count") || "—"}
                                </TableCell>
                                <TableCell dir="ltr">{smsField(m, "exit_count") || "—"}</TableCell>
                                <TableCell>{resolveOutboxStatus(t, m)}</TableCell>
                                <TableCell dir="ltr">
                                  {cost != null ? toLocaleDigits(formatNumber(cost, locale), locale) : "—"}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {formatSmsDateTime(outboxTime(m), locale)}
                                </TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="sm" onClick={() => setDetail(m)}>
                                    <Eye className="me-1 h-4 w-4" />
                                    {t("details")}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                  </TableBody>
                </Table>
              </div>
              <PaginationBar
                page={outboxPage}
                loading={outboxQ.isPending}
                hasMore={outboxItems.length >= PAGE_SIZE}
                onPrev={() => setOutboxPage((p) => Math.max(1, p - 1))}
                onNext={() => setOutboxPage((p) => p + 1)}
                label={pageLabel(outboxPage)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="local" className="mt-0">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">{t("localMessages")}</CardTitle>
              <CardDescription>{t("localMessagesHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>{t("type")}</TableHead>
                      <TableHead>{t("recipient")}</TableHead>
                      <TableHead>{t("message")}</TableHead>
                      <TableHead>{t("event")}</TableHead>
                      <TableHead>{t("role")}</TableHead>
                      <TableHead>{t("status")}</TableHead>
                      <TableHead>{t("cost")}</TableHead>
                      <TableHead>{t("outboxId")}</TableHead>
                      <TableHead>{t("sentAt")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messagesQ.isPending
                      ? Array.from({ length: 6 }, (_, i) => (
                          <TableRow key={i}>
                            <TableCell colSpan={10}>
                              <Skeleton className="h-7 w-full" />
                            </TableCell>
                          </TableRow>
                        ))
                      : localMessages.length === 0
                        ? (
                            <TableRow>
                              <TableCell colSpan={10} className="text-muted-foreground text-sm">
                                {t("noMessages")}
                              </TableCell>
                            </TableRow>
                          )
                        : localMessages.map((m) => {
                            const id = smsField(m, "id") || "—"
                            const cost = smsNum(m, "cost")
                            const recipients = localRecipientsPreview(m)
                            const preview = localMessagePreview(m)
                            return (
                              <TableRow key={id}>
                                <TableCell dir="ltr">{toLocaleDigits(id, locale)}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">
                                    {smsField(m, "sending_type", "type") || "—"}
                                  </Badge>
                                </TableCell>
                                <TableCell
                                  className="max-w-[12rem] truncate font-mono text-xs"
                                  dir="ltr"
                                  title={recipients}
                                >
                                  {recipients}
                                </TableCell>
                                <TableCell className="max-w-[16rem] truncate" title={preview}>
                                  {preview}
                                </TableCell>
                                <TableCell>{smsField(m, "event_key") || "—"}</TableCell>
                                <TableCell>{smsField(m, "recipient_role", "role") || "—"}</TableCell>
                                <TableCell>{translateSmsStatus(t, smsField(m, "status"))}</TableCell>
                                <TableCell dir="ltr">
                                  {cost != null ? toLocaleDigits(formatNumber(cost, locale), locale) : "—"}
                                </TableCell>
                                <TableCell className="font-mono text-xs" dir="ltr">
                                  {smsField(m, "outbox_id") || "—"}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {formatSmsDateTime(m.created_at ?? m.updated_at, locale)}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                  </TableBody>
                </Table>
              </div>
              <PaginationBar
                page={localPage}
                loading={messagesQ.isPending}
                hasMore={localMessages.length >= PAGE_SIZE}
                onPrev={() => setLocalPage((p) => Math.max(1, p - 1))}
                onNext={() => setLocalPage((p) => p + 1)}
                label={pageLabel(localPage)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inbox" className="mt-0">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">{t("inbox")}</CardTitle>
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
                    {inboxQ.isPending
                      ? Array.from({ length: 6 }, (_, i) => (
                          <TableRow key={i}>
                            <TableCell colSpan={7}>
                              <Skeleton className="h-7 w-full" />
                            </TableCell>
                          </TableRow>
                        ))
                      : inboxItems.length === 0
                        ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-muted-foreground text-sm">
                                {t("noMessages")}
                              </TableCell>
                            </TableRow>
                          )
                        : inboxItems.map((r, i) => {
                            const id = smsField(r, "messages_inbox_id", "id") || String(i + 1)
                            const seen = smsField(r, "seen")
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
                                <TableCell
                                  className="max-w-[20rem] truncate"
                                  title={smsField(r, "message", "text", "body")}
                                >
                                  {smsField(r, "message", "text", "body") || "—"}
                                </TableCell>
                                <TableCell>{smsField(r, "type") || "—"}</TableCell>
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
              <PaginationBar
                page={inboxPage}
                loading={inboxQ.isPending}
                hasMore={inboxItems.length >= PAGE_SIZE}
                onPrev={() => setInboxPage((p) => Math.max(1, p - 1))}
                onNext={() => setInboxPage((p) => p + 1)}
                label={pageLabel(inboxPage)}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t("outboxDetail")}</SheetTitle>
          </SheetHeader>
          {detail ? (
            <div className="mt-4 space-y-1">
              <DetailRow label={t("outboxId")} value={outboxId(detail)} ltr />
              <DetailRow label={t("senderLine")} value={outboxSender(detail)} ltr />
              <DetailRow label={t("type")} value={outboxType(detail)} />
              <DetailRow label={t("status")} value={resolveOutboxStatus(t, detail)} />
              <DetailRow label={t("stateId")} value={smsField(detail, "state_id", "state") || "—"} ltr />
              <DetailRow
                label={t("recipientsCount")}
                value={smsField(detail, "rcpts_count") || "—"}
                ltr
              />
              <DetailRow label={t("exitCount")} value={smsField(detail, "exit_count") || "—"} ltr />
              <DetailRow
                label={t("cost")}
                value={smsNum(detail, "cost") != null ? String(smsNum(detail, "cost")) : "—"}
                ltr
              />
              <DetailRow label={t("sentAt")} value={formatSmsDateTime(outboxTime(detail), locale)} />
              <DetailRow label={t("message")} value={outboxMessage(detail)} />
              <div className="mt-4 space-y-2">
                <div className="text-sm font-medium">{t("recipients")}</div>
                {recipientsQ.isPending ? (
                  <Skeleton className="h-16 w-full" />
                ) : detailRecipients.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("noMessages")}</p>
                ) : (
                  <div className="space-y-2">
                    {detailRecipients.slice(0, 30).map((r, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0"
                      >
                        <span className="font-mono text-xs" dir="ltr">
                          {smsField(r, "recipient", "phone", "to", "mobile", "number") || "—"}
                        </span>
                        <span>{translateSmsStatus(t, r.status ?? r.state ?? r.deliver_status)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </SmsPanelShell>
  )
}
