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

  const statusTabs = useMemo(
    () => [
      { slug: "pending", label: t("status_pending"), count: status === "pending" ? rows.length : 0 },
      { slug: "approved", label: t("status_approved"), count: status === "approved" ? rows.length : 0 },
      { slug: "rejected", label: t("status_rejected"), count: status === "rejected" ? rows.length : 0 },
      { slug: "all", label: t("status_all"), count: data?.meta?.total ?? rows.length },
    ],
    [data?.meta?.total, rows.length, status, t],
  )

  const statItems = useMemo(() => {
    const withReceipt = rows.filter((r) => r.c2c_receipt_url).length
    const total = rows.reduce((sum, r) => sum + (r.total_minor || 0), 0)
    return [
      { id: "count", label: t("receipts_heading"), value: rows.length },
      { id: "with_file", label: t("col_receipt"), value: withReceipt },
      { id: "total", label: t("col_total"), value: total.toLocaleString() },
    ]
  }, [rows, t])

  return (
    <PageShell title={t("receipts_title")} description={route.fullPath}>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <ListStatsStrip items={statItems} />

      <OrderStatusTabs counts={statusTabs} active={status} onChange={setStatus} />

      <div className="rounded-lg border border-border bg-card/40">
        <div className="border-b px-4 py-3 text-sm font-medium">{t("receipts_heading")}</div>
        <div className="p-2 sm:p-4">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty_receipts")}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((r) => (
                <article key={r.id} className="overflow-hidden rounded-lg border border-border bg-background">
                  <div className="bg-muted/40 flex aspect-[4/3] items-center justify-center overflow-hidden">
                    {r.c2c_receipt_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.c2c_receipt_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-muted-foreground text-sm">{t("col_receipt")}: —</span>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{r.number || `#${r.id}`}</p>
                        <p className="text-muted-foreground text-xs">
                          {r.customer_name || r.user?.name || r.customer_phone || "—"}
                        </p>
                      </div>
                      <Badge variant="outline">{r.c2c_status || r.status}</Badge>
                    </div>
                    <p className="text-sm font-semibold">{r.total_minor.toLocaleString()}</p>
                    <div className="flex flex-wrap gap-1">
                      {r.c2c_receipt_url ? (
                        <Button size="sm" variant="outline" asChild>
                          <a href={r.c2c_receipt_url} target="_blank" rel="noreferrer">
                            {t("view_receipt")}
                          </a>
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ id: r.id, action: "approve" })}
                      >
                        {t("approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ id: r.id, action: "reject" })}
                      >
                        {t("reject")}
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
