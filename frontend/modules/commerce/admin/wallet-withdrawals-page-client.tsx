"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { unwrapApiResponse } from "@webina/ui"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { OrderStatusTabs } from "@/components/orders/OrderStatusTabs"
import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { ApiError, api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type WithdrawalRow = {
  id: number
  status: string
  amount_minor: number
  sheba?: string | null
  admin_note?: string | null
  created_at?: string
  user?: {
    id: number
    name?: string | null
    email?: string | null
    bank_sheba?: string | null
    wallet_balance_minor?: number
  } | null
}

type PageMeta = {
  current_page: number
  last_page: number
  total: number
}

async function apiListWithMeta<T>(path: string): Promise<{ items: T[]; meta?: PageMeta }> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  const res = await fetch(`${base}${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  })
  const text = await res.text()
  let raw: unknown = null
  try {
    raw = text ? JSON.parse(text) : null
  } catch {
    raw = null
  }
  if (!res.ok) {
    throw new ApiError(getApiErrorMessage(new ApiError(`HTTP ${res.status}`, res.status, raw), raw as never), res.status, raw)
  }
  const { data, meta } = unwrapApiResponse<T[]>(raw)
  return { items: Array.isArray(data) ? data : [], meta: meta as PageMeta | undefined }
}

export default function WalletWithdrawalsPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("wallet_admin")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const [status, setStatus] = useState("pending")
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["wallet-withdrawals", status],
    queryFn: () =>
      apiListWithMeta<WithdrawalRow>(`/api/v1/wallet/withdrawals?status=${encodeURIComponent(status)}`),
  })

  const update = useMutation({
    mutationFn: ({ id, next }: { id: number; next: "approved" | "paid" | "rejected" }) =>
      api("/api/v1/wallet/withdrawals", { method: "PATCH", json: { id, status: next } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["wallet-withdrawals"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const rows = data?.items ?? []

  const statusTabs = useMemo(
    () => [
      { slug: "pending", label: t("status_pending"), count: status === "pending" ? rows.length : 0 },
      { slug: "approved", label: t("status_approved"), count: status === "approved" ? rows.length : 0 },
      { slug: "paid", label: t("status_paid"), count: status === "paid" ? rows.length : 0 },
      { slug: "rejected", label: t("status_rejected"), count: status === "rejected" ? rows.length : 0 },
      { slug: "all", label: t("status_all"), count: data?.meta?.total ?? rows.length },
    ],
    [data?.meta?.total, rows.length, status, t],
  )

  const statItems = useMemo(() => {
    const totalAmount = rows.reduce((sum, r) => sum + (r.amount_minor || 0), 0)
    return [
      { id: "count", label: t("withdrawals_heading"), value: rows.length },
      { id: "amount", label: t("col_amount"), value: totalAmount.toLocaleString() },
    ]
  }, [rows, t])

  return (
    <PageShell title={t("withdrawals_title")} description={route.fullPath}>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <ListStatsStrip items={statItems} />

      <OrderStatusTabs counts={statusTabs} active={status} onChange={setStatus} />

      <div className="rounded-lg border border-border bg-card/40">
        <div className="border-b px-4 py-3 text-sm font-medium">{t("withdrawals_heading")}</div>
        <div className="p-2 sm:p-4">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty_withdrawals")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="p-2 font-medium">ID</th>
                    <th className="p-2 font-medium">{t("col_user")}</th>
                    <th className="p-2 font-medium">{t("col_amount")}</th>
                    <th className="p-2 font-medium">{t("col_sheba")}</th>
                    <th className="p-2 font-medium">{t("status")}</th>
                    <th className="p-2 font-medium">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-2">#{r.id}</td>
                      <td className="p-2">{r.user?.name || r.user?.email || `#${r.user?.id ?? "—"}`}</td>
                      <td className="p-2">{r.amount_minor.toLocaleString()}</td>
                      <td className="p-2 font-mono text-xs" dir="ltr">
                        {r.sheba || r.user?.bank_sheba || "—"}
                      </td>
                      <td className="p-2">
                        <Badge variant="outline">{r.status}</Badge>
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: r.id, next: "approved" })}
                          >
                            {t("approve")}
                          </Button>
                          <Button
                            size="sm"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: r.id, next: "paid" })}
                          >
                            {t("mark_paid")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: r.id, next: "rejected" })}
                          >
                            {t("reject")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
