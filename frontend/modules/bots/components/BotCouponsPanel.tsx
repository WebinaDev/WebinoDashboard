"use client"

import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"

import { PostsPagination } from "@/components/PostsPagination"
import { QueryErrorState } from "@/components/QueryErrorState"
import { ScrollTable } from "@/components/ScrollTable"
import { FormSettingsSkeleton } from "@/components/TableListSkeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { dashboardPath } from "@/kernel/paths"
import { api, type ApiListPayload } from "@/lib/api"
import { statusBadgeVariant, useEnumLabel } from "@/lib/enum-labels"
import { formatDisplayDateTime } from "@/lib/format-date"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"

import type { BotProvider } from "./BotProviderSwitcher"

type CouponRow = {
  id: number
  code: string
  type: string
  amount: number
  usage_count?: number | null
  usage_limit?: number | null
  status: string
  expires_at?: string | null
}

export function BotCouponsPanel({ provider }: { provider: BotProvider }) {
  const t = useTranslations("bots")
  const enumLabel = useEnumLabel()
  const locale = normalizeUiLocale(useLocale())
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)

  const q = useQuery({
    queryKey: ["bots", provider, "coupons", page, perPage],
    queryFn: () =>
      api<ApiListPayload<CouponRow[]>>(
        `/api/v1/marketing/coupons?channel=${provider}&page=${page}&per_page=${perPage}`,
      ),
  })

  const rows = q.data?.data ?? []
  const total = Number(q.data?.meta?.total ?? 0)
  const number = (value: number) => formatNumber(value, locale)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{t("coupons.description")}</p>
        <Button size="sm" asChild>
          <Link href={dashboardPath("marketing/coupons/new")}>
            <Plus className="size-4" />
            {t("coupons.create")}
          </Link>
        </Button>
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
                <th className="p-2">{t("coupons.colCode")}</th>
                <th className="p-2">{t("coupons.colType")}</th>
                <th className="p-2">{t("coupons.colAmount")}</th>
                <th className="p-2">{t("coupons.colUsage")}</th>
                <th className="p-2">{t("coupons.colStatus")}</th>
                <th className="p-2">{t("coupons.colExpires")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted-foreground p-3">
                    {t("coupons.empty")}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2 font-mono" dir="ltr">
                      <Link className="text-primary hover:underline" href={dashboardPath(`marketing/coupons/${row.id}`)}>
                        {row.code}
                      </Link>
                    </td>
                    <td className="p-2">{enumLabel("coupon_type", row.type)}</td>
                    <td className="p-2">
                      {row.type === "percent" ? `${number(row.amount)}${locale === "fa" ? "٪" : "%"}` : number(row.amount)}
                    </td>
                    <td className="p-2">
                      {number(row.usage_count ?? 0)}
                      {row.usage_limit ? ` / ${number(row.usage_limit)}` : ""}
                    </td>
                    <td className="p-2">
                      <Badge variant={statusBadgeVariant(row.status)}>{enumLabel("post_status", row.status)}</Badge>
                    </td>
                    <td className="whitespace-nowrap p-2 text-xs">
                      {row.expires_at ? formatDisplayDateTime(row.expires_at, locale) : t("coupons.noExpiry")}
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
