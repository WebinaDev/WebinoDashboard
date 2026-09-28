"use client"

import { useQuery } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"

import { PostsPagination } from "@/components/PostsPagination"
import { QueryErrorState } from "@/components/QueryErrorState"
import { ScrollTable } from "@/components/ScrollTable"
import { FormSettingsSkeleton } from "@/components/TableListSkeleton"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, type ApiListPayload } from "@/lib/api"
import { statusBadgeVariant } from "@/lib/enum-labels"
import { formatDisplayDateTime } from "@/lib/format-date"

import type { BotProvider } from "./BotProviderSwitcher"

type LogRow = {
  id: number
  chat_id: string
  direction: "in" | "out"
  type: string
  payload: string | null
  status: string
  created_at: string
}

export function BotLogsPanel({ provider }: { provider: BotProvider }) {
  const t = useTranslations("bots")
  const locale = useLocale()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [direction, setDirection] = useState<"all" | "in" | "out">("all")
  const [search, setSearch] = useState("")

  const q = useQuery({
    queryKey: ["bots", provider, "logs", page, perPage, direction, search],
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(page), per_page: String(perPage) })
      if (direction !== "all") qs.set("direction", direction)
      if (search.trim()) qs.set("search", search.trim())
      return api<ApiListPayload<LogRow[]>>(`/api/v1/bots/${provider}/logs?${qs.toString()}`)
    },
  })

  const rows = q.data?.data ?? []
  const total = Number(q.data?.meta?.total ?? 0)
  const statusLabel = (s: string) => (t.has(`logs.status.${s}`) ? t(`logs.status.${s}`) : s)
  const typeLabel = (s: string) => (t.has(`broadcast.types.${s}`) ? t(`broadcast.types.${s}`) : s)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder={t("logs.search")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
        <div className="w-40">
          <Select
            value={direction}
            onValueChange={(v) => {
              setDirection(v as "all" | "in" | "out")
              setPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("logs.directionAll")}</SelectItem>
              <SelectItem value="in">{t("logs.direction.in")}</SelectItem>
              <SelectItem value="out">{t("logs.direction.out")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {q.isError ? (
        <QueryErrorState onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <FormSettingsSkeleton cards={1} fieldsPerCard={4} />
      ) : (
        <ScrollTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start text-xs text-muted-foreground">
                <th className="p-2">{t("logs.colTime")}</th>
                <th className="p-2">{t("logs.colChat")}</th>
                <th className="p-2">{t("logs.colDirection")}</th>
                <th className="p-2">{t("logs.colType")}</th>
                <th className="p-2">{t("logs.colStatus")}</th>
                <th className="p-2">{t("logs.colPayload")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted-foreground p-3">
                    {t("logs.empty")}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t align-top">
                    <td className="whitespace-nowrap p-2 text-xs">{formatDisplayDateTime(row.created_at, locale)}</td>
                    <td className="p-2 font-mono text-xs" dir="ltr">
                      {row.chat_id}
                    </td>
                    <td className="p-2">{t(`logs.direction.${row.direction === "in" ? "in" : "out"}`)}</td>
                    <td className="p-2">{typeLabel(row.type)}</td>
                    <td className="p-2">
                      <Badge variant={statusBadgeVariant(row.status)}>{statusLabel(row.status)}</Badge>
                    </td>
                    <td className="max-w-md truncate p-2" title={row.payload ?? ""}>
                      {row.payload}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ScrollTable>
      )}

      {!q.isLoading && !q.isError ? (
        <PostsPagination
          page={page}
          perPage={perPage}
          found={total}
          onPageChange={setPage}
          onPerPageChange={(n) => {
            setPerPage(n)
            setPage(1)
          }}
        />
      ) : null}
    </div>
  )
}
