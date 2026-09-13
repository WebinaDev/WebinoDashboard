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

type ReceiptRow = {
  id: number
  number?: string | null
  status: string
  c2c_status?: string | null
  c2c_receipt_url?: string | null
  total_minor: number
  customer_name?: string | null
  customer_phone?: string | null
  created_at?: string
  user?: { name?: string | null; email?: string | null } | null
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

export default function C2cReceiptsPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("c2c_admin")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const [status, setStatus] = useState("pending")
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["c2c-receipts", status],
    queryFn: () => apiListWithMeta<ReceiptRow>(`/api/v1/c2c/receipts?status=${encodeURIComponent(status)}`),
  })

  const decide = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "approve" | "reject" }) =>
      api(`/api/v1/c2c/receipts/${id}`, { method: "POST", json: { action } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["c2c-receipts"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const rows = data?.items ?? []

  return (
    <div className="space-y-6 p-6" dir="auto">
      <div>
        <h1 className="text-2xl font-bold">{t("receipts_title")}</h1>
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
              <option value="rejected">{t("status_rejected")}</option>
              <option value="all">{t("status_all")}</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("receipts_heading")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty_receipts")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="p-2 font-medium">{t("col_order")}</th>
                    <th className="p-2 font-medium">{t("col_customer")}</th>
                    <th className="p-2 font-medium">{t("col_total")}</th>
                    <th className="p-2 font-medium">{t("col_c2c")}</th>
                    <th className="p-2 font-medium">{t("col_receipt")}</th>
                    <th className="p-2 font-medium">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-2 font-medium">{r.number || `#${r.id}`}</td>
                      <td className="p-2 text-muted-foreground">
                        {r.customer_name || r.user?.name || r.customer_phone || "—"}
                      </td>
                      <td className="p-2">{r.total_minor.toLocaleString()}</td>
                      <td className="p-2">
                        <Badge variant="outline">{r.c2c_status || "—"}</Badge>
                      </td>
                      <td className="p-2">
                        {r.c2c_receipt_url ? (
                          <a className="underline" href={r.c2c_receipt_url} target="_blank" rel="noreferrer">
                            {t("view_receipt")}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: r.id, action: "approve" })}
                          >
                            {t("approve")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: r.id, action: "reject" })}
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
