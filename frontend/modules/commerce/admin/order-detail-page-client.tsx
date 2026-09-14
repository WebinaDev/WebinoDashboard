"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Mail, Pencil, Phone, Printer, Trash2, User } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState, type ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { ORDER_STATUSES } from "../lib/order-statuses"

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
  tracking_code?: string | null
  tracking_url?: string | null
  attribution?: Record<string, unknown> | null
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

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
const STATUSES = [...ORDER_STATUSES]

function formatAddress(addr: unknown): string {
  if (!addr) return "—"
  if (typeof addr === "string") return addr
  if (typeof addr === "object") {
    const o = addr as Record<string, unknown>
    const parts = [o.name, o.phone, o.address_1 || o.address, o.city, o.state, o.postcode, o.country]
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
    if (parts.length) return parts.join(" · ")
    try {
      return JSON.stringify(addr, null, 2)
    } catch {
      return "—"
    }
  }
  return String(addr)
}

function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card/40">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">{title}</h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
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
    mutationFn: () => api(`/api/v1/orders/${orderId}/notes`, { method: "POST", json: { body: noteBody } }),
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

  const customerName = order?.customer_name || order?.user?.name || "—"
  const customerPhone = order?.customer_phone || null
  const customerEmail = order?.customer_email || order?.user?.email || null
  const hasTracking = Boolean(order?.tracking_code || order?.tracking_url)
  const attributionEntries = order?.attribution ? Object.entries(order.attribution).filter(([, v]) => v != null && v !== "") : []

  return (
    <PageShell
      title={`${t("detail_title")} ${order?.number || `#${orderId}`}`}
      description={route.fullPath}
      actions={
        <>
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
        </>
      }
    >
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {isLoading || !order ? (
        <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/50 px-4 py-3 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <User className="size-4" />
              {customerName}
            </span>
            {customerPhone ? (
              <a className="text-muted-foreground inline-flex items-center gap-1 hover:underline" href={`tel:${customerPhone}`}>
                <Phone className="size-3.5" />
                {customerPhone}
              </a>
            ) : null}
            {customerEmail ? (
              <a className="text-muted-foreground inline-flex items-center gap-1 hover:underline" href={`mailto:${customerEmail}`}>
                <Mail className="size-3.5" />
                {customerEmail}
              </a>
            ) : null}
            <Badge variant="outline">{order.status}</Badge>
            {order.is_pos ? <Badge variant="secondary">POS</Badge> : null}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              <Panel title={t("items")}>
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
              </Panel>

              <div className="grid gap-4 md:grid-cols-2">
                <Panel title={t("customer")}>
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{customerName}</p>
                    <p className="text-muted-foreground">{customerPhone || "—"}</p>
                    <p className="text-muted-foreground">{customerEmail || "—"}</p>
                    {order.customer_note ? (
                      <p className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-xs">{order.customer_note}</p>
                    ) : null}
                  </div>
                </Panel>
                <Panel title={t("shipping_address")}>
                  <pre className="whitespace-pre-wrap text-sm">{formatAddress(order.shipping_address)}</pre>
                  <p className="text-muted-foreground mt-3 text-xs font-medium">{t("billing_address")}</p>
                  <pre className="mt-1 whitespace-pre-wrap text-sm">{formatAddress(order.billing_address)}</pre>
                </Panel>
              </div>

              <Panel title={t("notes")}>
                <ul className="mb-3 space-y-2">
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
              </Panel>

              <Panel title={t("returns")}>
                <ul className="mb-3 space-y-2">
                  {(order.returns ?? []).length === 0 ? (
                    <li className="text-muted-foreground text-sm">{t("empty_returns")}</li>
                  ) : (
                    (order.returns ?? []).map((r) => (
                      <li key={r.id} className="space-y-2 rounded-md border p-3 text-sm">
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
                <Button className="mt-3" disabled={createReturn.isPending} onClick={() => createReturn.mutate()}>
                  {t("create_return")}
                </Button>
              </Panel>

              {hasTracking ? (
                <Panel title="Tracking">
                  <div className="space-y-1 text-sm">
                    {order.tracking_code ? <p className="font-mono">{order.tracking_code}</p> : null}
                    {order.tracking_url ? (
                      <a className="underline" href={order.tracking_url} target="_blank" rel="noreferrer">
                        {order.tracking_url}
                      </a>
                    ) : null}
                  </div>
                </Panel>
              ) : null}

              {attributionEntries.length > 0 ? (
                <Panel title="Attribution">
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    {attributionEntries.map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-muted-foreground text-xs">{k}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </Panel>
              ) : null}
            </div>

            <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
              <Panel title={t("order_info")}>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("col_total")}</span>
                    <span className="font-semibold">
                      {order.total_minor.toLocaleString()} {order.currency || ""}
                    </span>
                  </div>
                  {order.subtotal_minor != null ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{order.subtotal_minor.toLocaleString()}</span>
                    </div>
                  ) : null}
                  {order.discount_minor != null && order.discount_minor > 0 ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Discount</span>
                      <span>{order.discount_minor.toLocaleString()}</span>
                    </div>
                  ) : null}
                  {order.shipping_minor != null ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Shipping</span>
                      <span>{order.shipping_minor.toLocaleString()}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("payment_tender")}</span>
                    <span>{order.payment_tender || "—"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("sales_channel")}</span>
                    <span>{order.sales_channel || "—"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("col_date")}</span>
                    <span>{order.created_at ? new Date(order.created_at).toLocaleString() : "—"}</span>
                  </div>
                  <div className="border-t pt-3">
                    <Label>{t("status")}</Label>
                    <select className={`${selectClass} mt-1`} value={status} onChange={(e) => setStatus(e.target.value)}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <Button className="mt-2 w-full" disabled={patchStatus.isPending} onClick={() => patchStatus.mutate()}>
                      {t("update_status")}
                    </Button>
                  </div>
                </div>
              </Panel>
            </aside>
          </div>
        </>
      )}
    </PageShell>
  )
}
