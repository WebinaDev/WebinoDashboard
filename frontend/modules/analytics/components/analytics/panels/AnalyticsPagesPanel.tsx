"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { PostsPagination } from "@/components/PostsPagination"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import type { AnalyticsRange } from "../AnalyticsPeriodFilter"
import { AnalyticsPanelHeader, AnalyticsQueryGate, DataTable, fmtInt, useAnalyticsLocale } from "../analytics-ui"
import type { PagesData } from "../types"
import { useAnalyticsQuery } from "../use-analytics-query"

export function AnalyticsPagesPanel({ range }: { range: AnalyticsRange }) {
  const t = useTranslations("analytics")
  const lng = useAnalyticsLocale()
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => window.clearTimeout(id)
  }, [searchInput])

  useEffect(() => {
    setPage(1)
  }, [search, range.from, range.to, perPage])

  const q = useAnalyticsQuery<PagesData>("pages", range, { search, page, per_page: perPage })
  const d = q.data

  return (
    <div className="space-y-4">
      <AnalyticsPanelHeader range={range} source={d?.source}>
        <div className="grid gap-1.5">
          <Label htmlFor="analytics-pages-search">{t("search")}</Label>
          <Input
            id="analytics-pages-search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("searchPages")}
            className="w-56"
          />
        </div>
      </AnalyticsPanelHeader>
      <AnalyticsQueryGate query={q}>
        <DataTable
          rows={d?.items ?? []}
          rowKey={(r) => r.uri}
          columns={[
            {
              key: "title",
              label: t("col.title"),
              cell: (r) => <span className="font-medium">{r.title || r.uri}</span>,
            },
            {
              key: "uri",
              label: t("col.uri"),
              cell: (r) => (
                <span className="text-muted-foreground block max-w-[28rem] truncate font-mono text-xs" dir="ltr" title={r.uri}>
                  {r.uri}
                </span>
              ),
            },
            { key: "views", label: t("col.views"), cell: (r) => fmtInt(r.views, lng) },
          ]}
          footer={
            <PostsPagination
              page={d?.page ?? page}
              perPage={d?.per_page ?? perPage}
              found={d?.total ?? 0}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
            />
          }
        />
      </AnalyticsQueryGate>
    </div>
  )
}
