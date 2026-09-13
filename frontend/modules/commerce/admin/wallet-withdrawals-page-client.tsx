"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { unwrapApiResponse } from "@webina/ui"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
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

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

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

  return (
    <div className="space-y-6 p-6" dir="auto">
      <div>
        <h1 className="text-2xl font-bold">{t("withdrawals_title")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div>
            <Label>{t("status")}</Label>
            <select className={`${selectClass} mt-1 min-w-[160px]`} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="pending">{t("status_pending")}</option>
              <option value="approved">{t("status_approved")}</option>
              <option value="paid">{t("status_paid")}</option>
              <option value="rejected">{t("status_rejected")}</option>
              <option value="all">{t("status_all")}</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("withdrawals_heading")}</CardTitle>
        </CardHeader>
        <CardContent>
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
                      <td className="p-2">
                        {r.user?.name || r.user?.email || `#${r.user?.id ?? "—"}`}
                      </td>
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
        </CardContent>
      </Card>
    </div>
  )
}
