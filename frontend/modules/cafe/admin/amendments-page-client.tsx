"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MoneyText } from "@/components/currency/MoneyDisplay"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useLocaleNext } from "@/hooks/use-locale-next"

import { CafeAdminShell, CafeEmptyState, cafeSelectClass } from "./cafe-admin-ui"

type Amendment = {
  id: number
  order_id: number
  delta_minor: number
  reason: string
  status: "pending" | "approved" | "rejected" | "settled"
  changes?: Record<string, unknown> | null
  requested_by_name?: string | null
  approved_by_name?: string | null
  approved_at?: string | null
  rejection_reason?: string | null
  settlement_tender?: string | null
  settled_at?: string | null
  created_at?: string | null
  order?: { id: number; number: string | null; total_minor: number; status: string; customer_name: string | null } | null
}

const TENDERS = ["cash", "card_to_card", "pos_terminal", "online", "wallet", "other"] as const

/**
 * Editing an invoice that has already been paid.
 *
 * `OrderAmendments` shipped with request / approve / reject / settle and five API routes, and
 * no screen called any of them — so the feature could only be exercised with curl. The order
 * is never rewritten in place: an amendment records what changed and the money that has to
 * move, so the original receipt stays verifiable and a manager signs off on the delta.
 */
export default function AmendmentsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.amendments")
  const tPos = useTranslations("cafe_admin.pos")
  const tCommon = useTranslations("common")
  const { formatDateTime } = useLocaleNext()
  const qc = useQueryClient()

  const [orderId, setOrderId] = useState("")
  const [reason, setReason] = useState("")
  const [delta, setDelta] = useState("")
  const [describing, setDescribing] = useState("")
  // Which tender each approved row will settle into, keyed by amendment id.
  const [tenders, setTenders] = useState<Record<number, string>>({})

  const pendingQ = useQuery({
    queryKey: ["cafe-amendments"],
    queryFn: () => api<Amendment[]>("/api/v1/cafe/amendments/pending"),
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["cafe-amendments"] })
    void qc.invalidateQueries({ queryKey: ["cafe-workbench"] })
  }

  const request = useMutation({
    mutationFn: () =>
      api(`/api/v1/cafe/orders/${Number(orderId)}/amendments`, {
        method: "POST",
        json: {
          reason: reason.trim(),
          // The server can derive the delta from changes, but the counter knows the figure it
          // wants to collect or refund; sending it explicitly avoids guessing.
          delta_minor: Number(delta || 0),
          changes: { note: describing.trim() || reason.trim() },
        },
      }),
    onSuccess: () => {
      toast.success(t("requested"))
      setOrderId("")
      setReason("")
      setDelta("")
      setDescribing("")
      invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const decide = useMutation({
    mutationFn: (vars: { id: number; action: "approve" | "reject" | "settle"; tender?: string }) =>
      api(`/api/v1/cafe/amendments/${vars.id}/${vars.action}`, {
        method: "POST",
        json: vars.action === "reject"
          ? { reason: t("rejected_default_reason") }
          : vars.action === "settle"
            ? { tender: vars.tender ?? "cash" }
            : {},
      }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const rows = pendingQ.data ?? []

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("new_request")}</CardTitle>
            <CardDescription>{t("new_request_hint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>{t("order_id")}</Label>
                <Input
                  inputMode="numeric"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("order_id_placeholder")}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("delta")}</Label>
                <Input
                  inputMode="numeric"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ""))}
                  placeholder={t("delta_placeholder")}
                />
                <p className="text-muted-foreground text-xs">{t("delta_hint")}</p>
              </div>
              <div className="space-y-1">
                <Label>{t("reason")}</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reason_placeholder")} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>{t("what_changed")}</Label>
              <textarea
                className={`${cafeSelectClass} min-h-16 w-full py-2`}
                value={describing}
                onChange={(e) => setDescribing(e.target.value)}
                placeholder={t("what_changed_placeholder")}
              />
            </div>

            <Button
              type="button"
              disabled={!orderId || !reason.trim() || request.isPending}
              onClick={() => void request.mutateAsync()}
            >
              {t("submit_request")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("queue_title")}</CardTitle>
            <CardDescription>{t("queue_hint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingQ.isPending ? <p className="text-muted-foreground text-sm">{t("loading")}</p> : null}
            {!pendingQ.isPending && rows.length === 0 ? (
              <CafeEmptyState message={t("queue_empty")} />
            ) : null}

            {rows.map((row) => {
              const owesMore = row.delta_minor > 0
              return (
                <div key={row.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {t("order")} {row.order?.number ?? row.order_id}
                      </span>
                      <Badge variant={row.status === "approved" ? "default" : "secondary"}>
                        {t(`status_${row.status}`)}
                      </Badge>
                      <span className="font-mono text-xs">
                        {owesMore ? "+" : ""}
                        <MoneyText amount={row.delta_minor} />
                      </span>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {row.requested_by_name ?? "—"}
                      {row.created_at ? ` · ${formatDateTime(row.created_at)}` : ""}
                    </span>
                  </div>

                  <p className="mt-2 text-sm">{row.reason}</p>
                  {row.changes && typeof row.changes.note === "string" && row.changes.note !== row.reason ? (
                    <p className="text-muted-foreground mt-1 text-xs">{row.changes.note}</p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {row.status === "pending" ? (
                      <>
                        <Button
                          size="sm"
                          disabled={decide.isPending}
                          onClick={() => void decide.mutateAsync({ id: row.id, action: "approve" })}
                        >
                          {t("approve")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={decide.isPending}
                          onClick={() => void decide.mutateAsync({ id: row.id, action: "reject" })}
                        >
                          {t("reject")}
                        </Button>
                      </>
                    ) : null}

                    {/* Approved means the money still has to move — collect it or refund it. */}
                    {row.status === "approved" ? (
                      <div className="flex items-center gap-2">
                        <select
                          className={`${cafeSelectClass} h-8 w-auto`}
                          value={tenders[row.id] ?? "cash"}
                          aria-label={t("tender")}
                          onChange={(e) => setTenders((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        >
                          {TENDERS.map((tender) => (
                            <option key={tender} value={tender}>
                              {tPos(`tender_${tender}`)}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          disabled={decide.isPending}
                          onClick={() =>
                            void decide.mutateAsync({
                              id: row.id,
                              action: "settle",
                              tender: tenders[row.id] ?? "cash",
                            })
                          }
                        >
                          {t("settle")}
                        </Button>
                      </div>
                    ) : null}

                    {row.status === "settled" ? (
                      <span className="text-muted-foreground text-xs">
                        {t("settled_via", { tender: row.settlement_tender ?? "—" })}
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </CafeAdminShell>
  )
}
