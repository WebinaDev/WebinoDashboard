"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"

import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"

type SupportTicket = {
  id: number
  ticket_number?: string | null
  subject: string
  status: string
  priority?: string
  department_name?: string | null
  assignee_name?: string | null
  user_name?: string
  source?: string
  updated_at?: string
}

type TicketsPayload = { items: SupportTicket[]; total: number; page: number }
type Dept = { id: number; name_fa: string; name_en?: string | null }

const STATUSES = ["open", "answered", "pending", "closed"] as const
const PRIORITIES = ["low", "normal", "high", "urgent"] as const

export default function TicketsPage({
  route,
  forceStatus,
  embedded,
}: {
  route: ResolvedAdminRoute
  forceStatus?: string
  embedded?: boolean
}) {
  const t = useTranslations("tickets")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const [status, setStatus] = useState(forceStatus ?? "")
  const [priority, setPriority] = useState("")
  const [departmentId, setDepartmentId] = useState("")
  const [mine, setMine] = useState(false)
  const [search, setSearch] = useState("")

  const deps = useQuery({
    queryKey: ["support", "departments"],
    queryFn: () => api<{ items: Dept[] }>("/api/v1/support/departments"),
  })

  const q = useQuery({
    queryKey: ["shop", "tickets", forceStatus ?? status, priority, departmentId, mine, search],
    queryFn: () => {
      const p = new URLSearchParams()
      const st = forceStatus ?? status
      if (st) p.set("status", st)
      if (priority) p.set("priority", priority)
      if (departmentId) p.set("department_id", departmentId)
      if (mine) p.set("mine", "1")
      if (search.trim()) p.set("search", search.trim())
      const qs = p.toString()
      return api<TicketsPayload>(`/api/v1/shop/tickets${qs ? `?${qs}` : ""}`)
    },
  })

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

  const body = (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search")}
        />
        {!forceStatus ? (
          <select
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{tCommon("all")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        ) : null}
        <select
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">{t("all_priorities")}</option>
          {PRIORITIES.map((s) => (
            <option key={s} value={s}>
              {priorityLabel(s)}
            </option>
          ))}
        </select>
        <select
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
        >
          <option value="">{t("all_departments")}</option>
          {(deps.data?.items ?? []).map((d) => (
            <option key={d.id} value={String(d.id)}>
              {deptName(d)}
            </option>
          ))}
        </select>
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          {t("mine_only")}
        </label>
      </div>
      <div className="space-y-2">
        {(q.data?.items ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">{tCommon("empty")}</p>
        ) : (
          (q.data?.items ?? []).map((row) => (
            <Link key={row.id} href={`/dashboard/tickets/${row.id}`} className="block">
              <Card className="transition-colors hover:bg-muted/40">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {row.ticket_number ? <span className="text-muted-foreground me-2 text-xs">{row.ticket_number}</span> : null}
                      {row.subject}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {row.user_name}
                      {row.department_name ? ` · ${row.department_name}` : ""}
                      {row.assignee_name ? ` · ${row.assignee_name}` : ""}
                      {row.updated_at ? ` · ${row.updated_at}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    {row.priority ? <Badge variant="outline">{priorityLabel(row.priority)}</Badge> : null}
                    <Badge>{statusLabel(row.status)}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </>
  )

  if (embedded) return body

  return (
    <PageShell
      title={forceStatus ? t("inbox_title") : t("staff_title")}
      description={forceStatus ? t("inbox_subtitle") : t("staff_subtitle")}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/tickets/settings">{t("settings_link")}</Link>
          </Button>
          {!forceStatus ? (
            <Button asChild size="sm">
              <Link href="/dashboard/support">{t("online_support_link")}</Link>
            </Button>
          ) : null}
        </div>
      }
    >
      {body}
    </PageShell>
  )
}
