"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Reply = {
  id: number
  author: string
  is_staff: boolean
  body: string
  created_at: string
}

type TicketDetail = {
  id: number
  subject: string
  status: string
  user_name?: string
  user_email?: string
  csat_rating?: number | null
  replies: Reply[]
}

const STATUSES = ["open", "answered", "pending", "closed"] as const

export default function TicketDetailPage({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("tickets")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [body, setBody] = useState("")
  const [status, setStatus] = useState("")
  const id = Number(route.params?.ticketId ?? 0)

  const q = useQuery({
    queryKey: ["ticket", "staff", id],
    queryFn: () => api<TicketDetail>(`/api/v1/shop/tickets/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  })

  const reply = useMutation({
    mutationFn: () => api(`/api/v1/shop/tickets/${id}/replies`, { method: "POST", json: { body } }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setBody("")
      void qc.invalidateQueries({ queryKey: ["ticket"] })
      void qc.invalidateQueries({ queryKey: ["shop", "tickets"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const patchStatus = useMutation({
    mutationFn: (next: string) =>
      api(`/api/v1/shop/tickets/${id}`, { method: "PATCH", json: { status: next } }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["ticket"] })
      void qc.invalidateQueries({ queryKey: ["shop", "tickets"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const ticket = q.data
  const closed = ticket?.status === "closed"
  const statusLabel = (s: string) => {
    try {
      return t(`status_${s}` as "status_open")
    } catch {
      return s
    }
  }

  return (
    <PageShell title={ticket?.subject || t("detail_title")} description={ticket?.user_name}>
      {ticket ? (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Badge>{statusLabel(ticket.status)}</Badge>
          <select
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            value={status || ticket.status}
            onChange={(e) => {
              setStatus(e.target.value)
              void patchStatus.mutateAsync(e.target.value)
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
          {ticket.user_email ? (
            <span className="text-muted-foreground text-sm">{ticket.user_email}</span>
          ) : null}
        </div>
      ) : null}

      <div className="mb-6 space-y-3">
        {(ticket?.replies ?? []).map((r) => (
          <Card key={r.id} className={r.is_staff ? "border-primary/30" : undefined}>
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-medium">
                  {r.author}
                  {r.is_staff ? ` · ${t("staff_badge")}` : ""}
                </span>
                <span className="text-muted-foreground">{r.created_at}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!closed ? (
        <div className="space-y-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("reply_placeholder")}
            rows={4}
          />
          <Button
            type="button"
            disabled={!body.trim() || reply.isPending}
            onClick={() => void reply.mutateAsync()}
          >
            {t("send_reply")}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t("closed_hint")}</p>
      )}
    </PageShell>
  )
}
