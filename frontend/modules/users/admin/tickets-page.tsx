"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"

type SupportTicket = {
  id: number
  subject: string
  status: string
  user_name?: string
  updated_at?: string
}

type TicketsPayload = { items: SupportTicket[]; total: number; page: number }

const STATUSES = ["open", "answered", "pending", "closed"] as const

export default function TicketsPage({
  route,
  forceStatus,
}: {
  route: ResolvedAdminRoute
  forceStatus?: string
}) {
  const t = useTranslations("tickets")
  const tCommon = useTranslations("common")
  const [status, setStatus] = useState(forceStatus ?? "")
  const [search, setSearch] = useState("")

  const q = useQuery({
    queryKey: ["shop", "tickets", forceStatus ?? status, search],
    queryFn: () => {
      const p = new URLSearchParams()
      const st = forceStatus ?? status
      if (st) p.set("status", st)
      if (search.trim()) p.set("search", search.trim())
      const qs = p.toString()
      return api<TicketsPayload>(`/api/v1/shop/tickets${qs ? `?${qs}` : ""}`)
    },
  })

  const statusLabel = (s: string) => {
    const key = `status_${s}` as const
    try {
      return t(key)
    } catch {
      return s
    }
  }

  return (
    <PageShell
      title={forceStatus ? t("inbox_title") : t("staff_title")}
      description={forceStatus ? t("inbox_subtitle") : t("staff_subtitle")}
    >
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
      </div>
      <div className="space-y-2">
        {(q.data?.items ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">{tCommon("empty")}</p>
        ) : (
          (q.data?.items ?? []).map((row) => (
            <Link key={row.id} href={`/dashboard/tickets/${row.id}`} className="block">
              <Card className="transition-colors hover:bg-muted/40">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{row.subject}</p>
                    <p className="text-muted-foreground text-xs">
                      {row.user_name}
                      {row.updated_at ? ` · ${row.updated_at}` : ""}
                    </p>
                  </div>
                  <Badge variant={row.status === "closed" ? "secondary" : "default"}>
                    {statusLabel(row.status)}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </PageShell>
  )
}
