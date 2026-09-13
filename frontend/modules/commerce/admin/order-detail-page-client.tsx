"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Printer, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type OrderNote = {
  id: number
  body: string
  is_customer?: boolean
  user?: { id: number; name?: string | null } | null
  created_at?: string
}

type OrderReturn = {
  id: number
  status: string
  reason?: string | null
  refund_minor?: number | null
  admin_note?: string | null
}

type OrderDetail = {
  id: number
  number?: string | null
  status: string
  total_minor: number
  subtotal_minor?: number
  discount_minor?: number
  shipping_minor?: number
  amount_paid_minor?: number | null
  currency?: string
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  customer_note?: string | null
  payment_tender?: string | null
  sales_channel?: string | null
  is_pos?: boolean
  shipping_address?: unknown
  billing_address?: unknown
  created_at?: string
  user?: { id: number; name?: string | null; email?: string | null } | null
  items?: Array<{
    id: number
    product_name?: string
    sku?: string | null
    quantity: number
    unit_price_minor: number
    purchase_type?: string | null
  }>
  notes?: OrderNote[]
  returns?: OrderReturn[]
}

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

const STATUSES = [
  "pending_payment",
  "on_hold",
  "paid",
  "payment_failed",
  "processing",
  "shipped",
  "completed",
  "cancelled",
  "refunded",
  "failed",
]

function formatAddress(addr: unknown): string {
  if (!addr) return "—"
  if (typeof addr === "string") return addr
  if (typeof addr === "object") {
    try {
      return JSON.stringify(addr, null, 2)
    } catch {
      return "—"
    }
  }
  return String(addr)
}

export default function OrderDetailPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("orders_admin")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const orderId = route.params?.orderId

  const [status, setStatus] = useState("")
  const [noteBody, setNoteBody] = useState("")
  const [returnReason, setReturnReason] = useState("")
  const [returnRefund, setReturnRefund] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const { data: order, isLoading } = useQuery({
    queryKey: ["admin-order", orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const row = await api<OrderDetail>(`/api/v1/orders/${orderId}`)
      setStatus(row.status)
      return row
    },
  })

  const patchStatus = useMutation({
    mutationFn: () => api(`/api/v1/orders/${orderId}`, { method: "PATCH", json: { status } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-order", orderId] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const addNote = useMutation({
    mutationFn: () =>
      api(`/api/v1/orders/${orderId}/notes`, { method: "POST", json: { body: noteBody } }),
    onSuccess: async () => {
      setNoteBody("")
      await queryClient.invalidateQueries({ queryKey: ["admin-order", orderId] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const deleteNote = useMutation({
    mutationFn: (noteId: number) => api(`/api/v1/order-notes/${noteId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-order", orderId] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const createReturn = useMutation({
    mutationFn: () =>
      api(`/api/v1/orders/${orderId}/returns`, {
        method: "POST",
        json: { reason: returnReason || null, refund_minor: returnRefund || null },
      }),
    onSuccess: async () => {
      setReturnReason("")
      setReturnRefund(0)
      await queryClient.invalidateQueries({ queryKey: ["admin-order", orderId] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const returnAction = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      api(`/api/v1/order-returns/${id}/action`, { method: "POST", json: { action } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-order", orderId] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  async function printReceipt() {
    try {
      const data = await api<{ html?: string }>(`/api/v1/orders/${orderId}/print`)
      const html = data?.html ?? ""
      const w = window.open("", "_blank")
      if (w) {
        w.document.write(html)
        w.document.close()
        w.focus()
      }
    } catch (e) {
      setError(getApiErrorMessage(e as Error))
    }
  }

  if (!orderId) {
    return <p className="p-6 text-destructive">{t("missing_id")}</p>
  }

  return (
    <div className="space-y-6 p-6" dir="auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {t("detail_title")} {order?.number || `#${orderId}`}
          </h1>
          <p className="text-muted-foreground text-sm">{route.fullPath}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void printReceipt()}>
            <Printer className="size-4" />
            {t("print")}
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/admin/orders/${orderId}/edit`}>
              <Pencil className="size-4" />
              {t("edit")}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/orders">{t("back_to_list")}</Link>
          </Button>
        </div>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {isLoading || !order ? (
        <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {t("order_info")}
                  <Badge variant="outline">{order.status}</Badge>
                  {order.is_pos ? <Badge variant="secondary">POS</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <span className="text-muted-foreground">{t("col_total")}: </span>
                  {order.total_minor.toLocaleString()} {order.currency || ""}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("payment_tender")}: </span>
                  {order.payment_tender || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("sales_channel")}: </span>
                  {order.sales_channel || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("col_date")}: </span>
                  {order.created_at ? new Date(order.created_at).toLocaleString() : "—"}
                </div>
                <div className="sm:col-span-2 flex flex-wrap items-end gap-2">
                  <div>
                    <Label>{t("status")}</Label>
                    <select className={`${selectClass} mt-1 min-w-[180px]`} value={status} onChange={(e) => setStatus(e.target.value)}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button disabled={patchStatus.isPending} onClick={() => patchStatus.mutate()}>
                    {t("update_status")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("customer")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>{order.customer_name || order.user?.name || "—"}</p>
                <p className="text-muted-foreground">{order.customer_phone || "—"}</p>
                <p className="text-muted-foreground">{order.customer_email || order.user?.email || "—"}</p>
                {order.customer_note ? <p className="mt-2 whitespace-pre-wrap">{order.customer_note}</p> : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("items")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b text-start text-muted-foreground">
                      <th className="p-2 font-medium">{t("product")}</th>
                      <th className="p-2 font-medium">{t("qty")}</th>
                      <th className="p-2 font-medium">{t("unit_price")}</th>
                      <th className="p-2 font-medium">{t("line_total")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(order.items ?? []).map((it) => (
                      <tr key={it.id} className="border-b last:border-0">
                        <td className="p-2">
                          {it.product_name || "—"}
                          {it.sku ? <span className="text-muted-foreground ms-1">({it.sku})</span> : null}
                        </td>
                        <td className="p-2">{it.quantity}</td>
                        <td className="p-2">{it.unit_price_minor.toLocaleString()}</td>
                        <td className="p-2">{(it.quantity * it.unit_price_minor).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("shipping_address")}</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap text-sm">{formatAddress(order.shipping_address)}</pre>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("billing_address")}</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap text-sm">{formatAddress(order.billing_address)}</pre>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("notes")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-2">
                {(order.notes ?? []).length === 0 ? (
                  <li className="text-muted-foreground text-sm">{t("empty_notes")}</li>
                ) : (
                  (order.notes ?? []).map((n) => (
                    <li key={n.id} className="flex items-start justify-between gap-2 rounded-md border p-3 text-sm">
                      <div>
                        <p className="whitespace-pre-wrap">{n.body}</p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {n.user?.name || "—"} · {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => deleteNote.mutate(n.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))
                )}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Textarea
                  className="min-h-[80px] flex-1"
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder={t("note_ph")}
                />
                <Button disabled={!noteBody.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
                  {t("add_note")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("returns")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-2">
                {(order.returns ?? []).length === 0 ? (
                  <li className="text-muted-foreground text-sm">{t("empty_returns")}</li>
                ) : (
                  (order.returns ?? []).map((r) => (
                    <li key={r.id} className="rounded-md border p-3 text-sm space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{r.status}</Badge>
                        <span>{r.reason || "—"}</span>
                        {r.refund_minor != null ? <span>{r.refund_minor.toLocaleString()}</span> : null}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(["approve", "reject", "receive", "refund"] as const).map((action) => (
                          <Button
                            key={action}
                            size="sm"
                            variant="outline"
                            disabled={returnAction.isPending}
                            onClick={() => returnAction.mutate({ id: r.id, action })}
                          >
                            {t(`return_${action}`)}
                          </Button>
                        ))}
                      </div>
                    </li>
                  ))
                )}
              </ul>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Label>{t("return_reason")}</Label>
                  <Input className="mt-1" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
                </div>
                <div>
                  <Label>{t("refund_minor")}</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    value={returnRefund}
                    onChange={(e) => setReturnRefund(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
              <Button disabled={createReturn.isPending} onClick={() => createReturn.mutate()}>
                {t("create_return")}
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            {(["marketplace", "tapin", "moadian"] as const).map((key) => (
              <Card key={key}>
                <CardHeader>
                  <CardTitle className="capitalize">{key}</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">{t("coming_soon")}</CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
