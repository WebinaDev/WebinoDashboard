"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import {
  TicketReplyAttachments,
  TicketReplyComposer,
  buildTicketReplyFormData,
} from "@/components/tickets/TicketReplyComposer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Reply = {
  id: number
  author: string
  is_staff: boolean
  is_internal?: boolean
  body: string
  created_at: string
  attachments?: Array<{ name: string; mime?: string; kind?: string; url?: string | null }>
}

type TicketDetail = {
  id: number
  ticket_number?: string | null
  subject: string
  status: string
  priority?: string
  department_id?: number | null
  assignee_id?: number | null
  user_name?: string
  user_email?: string
  form_values?: Record<string, unknown>
  tags?: string[]
  csat_rating?: number | null
  replies: Reply[]
  events?: Array<{ id: number; type: string; actor?: string; payload?: Record<string, unknown>; created_at: string }>
}

type Dept = { id: number; name_fa: string; name_en?: string | null }
type StaffRow = { id: number; name: string }
type Canned = { id: number; title_fa: string; title_en?: string | null; body_fa: string; body_en?: string | null }

const STATUSES = ["open", "answered", "pending", "closed"] as const
const PRIORITIES = ["low", "normal", "high", "urgent"] as const

export default function TicketDetailPage({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("tickets")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const qc = useQueryClient()
  const [body, setBody] = useState("")
  const [isInternal, setIsInternal] = useState(false)
  const [status, setStatus] = useState("")
  const [referDept, setReferDept] = useState("")
  const [referNote, setReferNote] = useState("")
  const [tagsInput, setTagsInput] = useState("")
  const id = Number(route.params?.ticketId ?? 0)

  const q = useQuery({
    queryKey: ["ticket", "staff", id],
    queryFn: () => api<TicketDetail>(`/api/v1/shop/tickets/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  })

  const deps = useQuery({
    queryKey: ["support", "departments"],
    queryFn: () => api<{ items: Dept[] }>("/api/v1/support/departments"),
  })
  const staff = useQuery({
    queryKey: ["support", "agents"],
    queryFn: () => api<{ items: StaffRow[] }>("/api/v1/shop/tickets/agents"),
  })
  const canned = useQuery({
    queryKey: ["support", "canned", q.data?.department_id],
    queryFn: () => {
      const p = new URLSearchParams({ active_only: "1" })
      if (q.data?.department_id) p.set("department_id", String(q.data.department_id))
      return api<{ items: Canned[] }>(`/api/v1/support/canned-responses?${p}`)
    },
  })

  const staffItems = useMemo(() => staff.data?.items ?? [], [staff.data])

  const reply = useMutation({
    mutationFn: (payload: { body: string; files: File[]; voice: File | null; is_internal?: boolean }) =>
      api(`/api/v1/shop/tickets/${id}/replies`, {
        method: "POST",
        body: buildTicketReplyFormData(payload),
      }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setBody("")
      setIsInternal(false)
      void qc.invalidateQueries({ queryKey: ["ticket"] })
      void qc.invalidateQueries({ queryKey: ["shop", "tickets"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const patch = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api(`/api/v1/shop/tickets/${id}`, { method: "PATCH", json: payload }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["ticket"] })
      void qc.invalidateQueries({ queryKey: ["shop", "tickets"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const ticket = q.data
  const convertMut = useMutation({
    mutationFn: () => api(`/api/v1/shop/tickets/${id}/convert-task`, { method: "POST" }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["ticket", "staff", id] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const syncMut = useMutation({
    mutationFn: () =>
      api<{ unavailable?: boolean; message?: string | null }>(`/api/v1/shop/tickets/${id}/sync-erp`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      if (res?.unavailable) toast.error(res.message || t("erp_unavailable"))
      else toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["ticket", "staff", id] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const closed = ticket?.status === "closed"
  const statusLabel = (s: string) => {
    try {
      return t(`status_${s}` as "status_open")
    } catch {
      return s
    }
  }
  const priorityLabel = (s: string) => {
    try {
      return t(`priority_${s}` as "priority_normal")
    } catch {
      return s
    }
  }
  const deptName = (d: Dept) => (locale.startsWith("fa") ? d.name_fa : d.name_en || d.name_fa)
  const cannedTitle = (c: Canned) => (locale.startsWith("fa") ? c.title_fa : c.title_en || c.title_fa)
  const cannedBody = (c: Canned) => (locale.startsWith("fa") ? c.body_fa : c.body_en || c.body_fa)

  return (
    <PageShell
      title={ticket?.subject || t("detail_title")}
      description={[ticket?.ticket_number, ticket?.user_name].filter(Boolean).join(" · ")}
    >
      {ticket ? (
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Badge>{statusLabel(ticket.status)}</Badge>
            {ticket.priority ? <Badge variant="outline">{priorityLabel(ticket.priority)}</Badge> : null}
            <Button type="button" size="sm" variant="outline" disabled={convertMut.isPending} onClick={() => void convertMut.mutateAsync()}>
              {t("convert_task")}
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={syncMut.isPending} onClick={() => void syncMut.mutateAsync()}>
              {t("sync_erp")}
            </Button>
            {ticket.user_email ? <span className="text-muted-foreground text-sm">{ticket.user_email}</span> : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">{t("status")}</span>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={status || ticket.status}
                onChange={(e) => {
                  setStatus(e.target.value)
                  void patch.mutateAsync({ status: e.target.value })
                }}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">{t("priority")}</span>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={ticket.priority || "normal"}
                onChange={(e) => void patch.mutateAsync({ priority: e.target.value })}
              >
                {PRIORITIES.map((s) => (
                  <option key={s} value={s}>
                    {priorityLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">{t("department")}</span>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={ticket.department_id ? String(ticket.department_id) : ""}
                onChange={(e) =>
                  void patch.mutateAsync({ department_id: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">{t("no_department")}</option>
                {(deps.data?.items ?? []).map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {deptName(d)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">{t("assignee")}</span>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={ticket.assignee_id ? String(ticket.assignee_id) : ""}
                onChange={(e) =>
                  void patch.mutateAsync({ assignee_id: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">{t("unassigned")}</option>
                {staffItems.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
            <label className="min-w-[12rem] flex-1 space-y-1 text-sm">
              <span className="text-muted-foreground">{t("refer_department")}</span>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={referDept}
                onChange={(e) => setReferDept(e.target.value)}
              >
                <option value="">{t("pick_department")}</option>
                {(deps.data?.items ?? []).map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {deptName(d)}
                  </option>
                ))}
              </select>
            </label>
            <Input
              className="max-w-sm"
              value={referNote}
              onChange={(e) => setReferNote(e.target.value)}
              placeholder={t("refer_note")}
            />
            <Button
              type="button"
              size="sm"
              disabled={!referDept || patch.isPending}
              onClick={() =>
                void patch.mutateAsync({
                  refer_department_id: Number(referDept),
                  refer_note: referNote || undefined,
                }).then(() => {
                  setReferDept("")
                  setReferNote("")
                })
              }
            >
              {t("refer")}
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Input
              className="max-w-md"
              value={tagsInput || (ticket.tags ?? []).join(", ")}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder={t("tags_placeholder")}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const tags = (tagsInput || (ticket.tags ?? []).join(", "))
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean)
                void patch.mutateAsync({ tags })
              }}
            >
              {t("save_tags")}
            </Button>
          </div>

          {ticket.form_values && Object.keys(ticket.form_values).length > 0 ? (
            <Card>
              <CardContent className="space-y-1 p-4 text-sm">
                <p className="font-medium">{t("form_values")}</p>
                {Object.entries(ticket.form_values).map(([k, v]) => (
                  <p key={k} className="text-muted-foreground">
                    <span className="text-foreground font-medium">{k}:</span> {String(v ?? "")}
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      <div className="mb-6 space-y-3">
        {(ticket?.replies ?? []).map((r) => (
          <Card
            key={r.id}
            className={r.is_internal ? "border-amber-400/50 bg-amber-50/40 dark:bg-amber-950/20" : r.is_staff ? "border-primary/30" : undefined}
          >
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-medium">
                  {r.author}
                  {r.is_internal ? ` · ${t("internal_note")}` : r.is_staff ? ` · ${t("staff_badge")}` : ""}
                </span>
                <span className="text-muted-foreground">{r.created_at}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.body}</p>
              <TicketReplyAttachments attachments={r.attachments} />
            </CardContent>
          </Card>
        ))}
      </div>

      {!closed ? (
        <TicketReplyComposer
          body={body}
          onBodyChange={setBody}
          pending={reply.isPending}
          allowInternal
          isInternal={isInternal}
          onInternalChange={setIsInternal}
          toolbar={
            (canned.data?.items ?? []).length ? (
              <select
                className="border-input bg-background h-9 w-full max-w-md rounded-md border px-2 text-sm"
                defaultValue=""
                onChange={(e) => {
                  const item = (canned.data?.items ?? []).find((c) => String(c.id) === e.target.value)
                  if (item) setBody(cannedBody(item))
                  e.target.value = ""
                }}
              >
                <option value="">{t("canned_pick")}</option>
                {(canned.data?.items ?? []).map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {cannedTitle(c)}
                  </option>
                ))}
              </select>
            ) : null
          }
          onSubmit={async (payload) => {
            await reply.mutateAsync(payload)
          }}
        />
      ) : (
        <p className="text-muted-foreground text-sm">{t("closed_hint")}</p>
      )}

      {(ticket?.events ?? []).length ? (
        <div className="mt-8 space-y-2">
          <h2 className="text-sm font-semibold">{t("history")}</h2>
          <ul className="text-muted-foreground space-y-1 text-xs">
            {(ticket?.events ?? []).map((e) => (
              <li key={e.id}>
                {e.created_at} · {e.type}
                {e.actor ? ` · ${e.actor}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </PageShell>
  )
}
