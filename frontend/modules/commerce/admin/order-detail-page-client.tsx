"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Mail, MessageSquare, Pencil, Phone, Trash2, Truck, User } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState, type ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "@/components/ConfirmDialog"
import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { OrderPrintActions } from "@/components/orders/OrderPrintActions"
import { OrderShipDialog, type ShipPayload } from "@/components/orders/OrderShipDialog"
import { OrderStatusStepper } from "@/components/orders/OrderStatusStepper"
import { ScrollTable } from "@/components/ScrollTable"
import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { localizeNumber } from "@/lib/digits"
import { statusBadgeVariant, useEnumLabel } from "@/lib/enum-labels"
import { formatDisplayDateTime } from "@/lib/format-date"
import { isMarketplaceChannel, marketplaceLabel } from "@/lib/marketplace"
import { displayPurchaseType, parseStructuredAddress } from "../lib/pos-commerce"
import { OrderMarketplacePanels } from "./order-marketplace-panels"

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
  items?: Array<{ order_item_id?: number; quantity?: number }> | null
}

type StatusHistoryEntry = {
  from?: string
  to?: string
  at?: string
  by?: number | null
}

type CustomerRecentOrder = {
  id: number
  number?: string | null
  status: string
  total_minor: number
  created_at?: string
}

type OrderItemRow = {
  id: number
  product_name?: string
  sku?: string | null
  quantity: number
  unit_price_minor: number
  purchase_type?: string | null
  meta?: { returnable?: boolean } | null
  product?: { id: number; image_url?: string | null; cover_image_url?: string | null } | null
  variant?: { id: number; name?: string | null; attribute_values?: Record<string, string> | null } | null
}

type OrderDetail = {
  id: number
  number?: string | null
  status: string
  status_label?: string | null
  next_statuses?: string[]
  status_history?: StatusHistoryEntry[]
  total_minor: number
  subtotal_minor?: number
  discount_minor?: number
  shipping_minor?: number
  tax_minor?: number
  amount_paid_minor?: number | null
  currency?: string
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  customer_note?: string | null
  payment_tender?: string | null
  payment_provider?: string | null
  payment_ref?: string | null
  sales_channel?: string | null
  is_pos?: boolean
  shipping_address?: unknown
  billing_address?: unknown
  tracking_code?: string | null
  tracking_url?: string | null
  attribution?: Record<string, unknown> | null
  meta?: {
    shipping_title?: string
    shipping_method_id?: string
    transaction_id?: string | null
    tapin?: {
      order_id?: string | number | null
      barcode?: string | null
      tracking_url?: string | null
      status?: string | null
      service?: string | null
    }
  } | null
  created_at?: string
  user?: { id: number; name?: string | null; email?: string | null; phone?: string | null } | null
  customer_recent_orders?: CustomerRecentOrder[]
  items?: OrderItemRow[]
  notes?: OrderNote[]
  returns?: OrderReturn[]
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
const TAPIN_SERVICES = ["pishtaz", "vip", "tipax", "courier", "alonomic"] as const

type ReturnAction = "approve" | "reject" | "receive" | "refund" | "exchange"

function returnActionsForStatus(status: string): ReturnAction[] {
  switch (status) {
    case "requested":
      return ["approve", "reject"]
    case "approved":
      return ["reject", "receive"]
    case "parcel_received":
    case "received":
      return ["refund", "exchange"]
    default:
      return []
  }
}

function formatAddressFallback(addr: unknown): string {
  if (!addr) return "—"
  if (typeof addr === "string") return addr
  if (typeof addr === "object") {
    const o = addr as Record<string, unknown>
    const parts = [o.name, o.phone, o.address_1 || o.address, o.city, o.state, o.postcode, o.country]
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
    if (parts.length) return parts.join(" · ")
  }
  return "—"
}

function StructuredAddressBlock({
  addr,
  t,
}: {
  addr: unknown
  t: ReturnType<typeof useTranslations<"orders_admin">>
}) {
  const structured = parseStructuredAddress(addr)
  const hasStructured = Boolean(
    structured.province_code ||
      structured.city ||
      structured.plaque ||
      structured.unit ||
      structured.postcode ||
      structured.address,
  )
  if (!hasStructured) {
    return <p className="whitespace-pre-wrap text-sm">{formatAddressFallback(addr)}</p>
  }
  const o = typeof addr === "object" && addr ? (addr as Record<string, unknown>) : {}
  const name = typeof o.name === "string" ? o.name : null
  const phone = typeof o.phone === "string" ? o.phone : null
  return (
    <dl className="grid gap-1.5 text-sm">
      {name ? (
        <div>
          <dt className="text-muted-foreground text-xs">{t("customer_name")}</dt>
          <dd>{name}</dd>
        </div>
      ) : null}
      {phone ? (
        <div>
          <dt className="text-muted-foreground text-xs">{t("customer_phone")}</dt>
          <dd dir="ltr">{phone}</dd>
        </div>
      ) : null}
      {structured.province_code ? (
        <div>
          <dt className="text-muted-foreground text-xs">{t("province")}</dt>
          <dd>{structured.province_code}</dd>
        </div>
      ) : null}
      {structured.city ? (
        <div>
          <dt className="text-muted-foreground text-xs">{t("city")}</dt>
          <dd>{structured.city}</dd>
        </div>
      ) : null}
      {structured.address ? (
        <div>
          <dt className="text-muted-foreground text-xs">{t("address_1")}</dt>
          <dd className="whitespace-pre-wrap">{structured.address}</dd>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {structured.plaque ? (
          <div>
            <span className="text-muted-foreground text-xs">{t("plaque")}: </span>
            {structured.plaque}
          </div>
        ) : null}
        {structured.unit ? (
          <div>
            <span className="text-muted-foreground text-xs">{t("unit")}: </span>
            {structured.unit}
          </div>
        ) : null}
        {structured.postcode ? (
          <div>
            <span className="text-muted-foreground text-xs">{t("postcode")}: </span>
            <span dir="ltr">{structured.postcode}</span>
          </div>
        ) : null}
      </div>
    </dl>
  )
}

function variantAttributes(variant: OrderItemRow["variant"]): string {
  if (!variant?.attribute_values || typeof variant.attribute_values !== "object") return ""
  return Object.entries(variant.attribute_values)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ")
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
  const locale = useLocale()
  const enumLabel = useEnumLabel()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const queryClient = useQueryClient()
  const orderId = route.params?.orderId

  const [noteBody, setNoteBody] = useState("")
  const [noteIsCustomer, setNoteIsCustomer] = useState(false)
  const [returnReason, setReturnReason] = useState("")
  const [returnRefund, setReturnRefund] = useState(0)
  const [returnItemId, setReturnItemId] = useState<number | "">("")
  const [returnQty, setReturnQty] = useState(1)
  const [shipOpen, setShipOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: order, isLoading } = useQuery({
    queryKey: ["admin-order", orderId],
    enabled: Boolean(orderId),
    queryFn: () => api<OrderDetail>(`/api/v1/orders/${orderId}`),
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-order", orderId] })
  }

  const patchOrder = useMutation({
    mutationFn: (json: Record<string, unknown>) => api(`/api/v1/orders/${orderId}`, { method: "PATCH", json }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const addNote = useMutation({
    mutationFn: () =>
      api(`/api/v1/orders/${orderId}/notes`, {
        method: "POST",
        json: { body: noteBody, is_customer: noteIsCustomer },
      }),
    onSuccess: async () => {
      setNoteBody("")
      setNoteIsCustomer(false)
      await invalidate()
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const deleteNote = useMutation({
    mutationFn: (noteId: number) => api(`/api/v1/order-notes/${noteId}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const createReturn = useMutation({
    mutationFn: () => {
      const items =
        returnItemId !== ""
          ? [{ order_item_id: returnItemId, quantity: Math.max(1, returnQty) }]
          : undefined
      return api(`/api/v1/orders/${orderId}/returns`, {
        method: "POST",
        json: {
          reason: returnReason || null,
          refund_minor: returnRefund || null,
          items,
        },
      })
    },
    onSuccess: async () => {
      setReturnReason("")
      setReturnRefund(0)
      setReturnItemId("")
      setReturnQty(1)
      await invalidate()
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const returnAction = useMutation({
    mutationFn: ({ id, action }: { id: number; action: ReturnAction }) =>
      api(`/api/v1/order-returns/${id}/action`, { method: "POST", json: { action } }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const resendEmail = useMutation({
    mutationFn: () =>
      api(`/api/v1/orders/bulk`, {
        method: "POST",
        json: { ids: [Number(orderId)], action: "send_email", email_type: "status" },
      }),
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const resendSms = useMutation({
    mutationFn: () =>
      api(`/api/v1/orders/bulk`, {
        method: "POST",
        json: { ids: [Number(orderId)], action: "send_sms" },
      }),
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const [tapinService, setTapinService] = useState("pishtaz")

  const tapinRegister = useMutation({
    mutationFn: () =>
      api(`/api/v1/orders/${orderId}/tapin/register`, { method: "POST", json: { service: tapinService } }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const tapinStatus = useMutation({
    mutationFn: () => api(`/api/v1/orders/${orderId}/tapin/status`, { method: "POST" }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  async function printTapinLabel() {
    try {
      const data = await api<{ html?: string | null }>(`/api/v1/orders/${orderId}/tapin/label`)
      const w = window.open("", "_blank")
      if (w) {
        w.document.write(data?.html ?? "")
        w.document.close()
        w.focus()
      }
    } catch (e) {
      setError(getApiErrorMessage(e as Error))
    }
  }

  const purchaseTypeKeys = new Set(["cash", "credit", "installment", "wholesale"])

  function purchaseTypeLabel(raw: string | null | undefined): string {
    const normalized = displayPurchaseType(raw || "cash")
    if (purchaseTypeKeys.has(normalized)) {
      return t(`purchase_type_${normalized}` as "purchase_type_cash")
    }
    return normalized
  }

  function tapinServiceLabel(service: string | null | undefined): string {
    if (!service) return "—"
    if (TAPIN_SERVICES.includes(service as (typeof TAPIN_SERVICES)[number])) {
      return t(`tapin_service_${service}` as "tapin_service_pishtaz")
    }
    return service
  }

  const statusHistory = useMemo(() => order?.status_history ?? [], [order?.status_history])
  const attributionEntries = useMemo(
    () => (order?.attribution ? Object.entries(order.attribution).filter(([, v]) => v != null && v !== "") : []),
    [order?.attribution],
  )

  if (!orderId) {
    return <p className="p-6 text-destructive">{t("missing_id")}</p>
  }

  const customerName = order?.customer_name || order?.user?.name || "—"
  const customerPhone = order?.customer_phone || order?.user?.phone || null
  const customerEmail = order?.customer_email || order?.user?.email || null
  const transactionId = order?.meta?.transaction_id || order?.payment_ref || null
  const hasTracking = Boolean(order?.tracking_code || order?.tracking_url)
  const nextStatuses = order?.next_statuses ?? []

  function handleShipSubmit(payload: ShipPayload) {
    const json: Record<string, unknown> = {
      tracking_code: payload.tracking_code,
      tracking_url: payload.tracking_url,
    }
    if (payload.status) json.status = payload.status
    patchOrder.mutate(json, {
      onSuccess: () => setShipOpen(false),
    })
  }

  return (
    <PageShell
      title={`${t("detail_title")} ${order?.number || `#${orderId}`}`}
      actions={
        <>
          <OrderPrintActions orderId={orderId} />
          <Button variant="outline" asChild>
            <Link href={`/dashboard/orders/${orderId}/edit`}>
              <Pencil className="size-4" />
              {t("edit")}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/orders">{t("back_to_list")}</Link>
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
            <Badge variant={statusBadgeVariant(order.status)}>
              {order.status_label || enumLabel("order_status", order.status)}
            </Badge>
            {order.is_pos ? <Badge variant="secondary">{enumLabel("sales_channel", "pos")}</Badge> : null}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-4">
              <Panel title={t("items")}>
                <ScrollTable>
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b text-start text-muted-foreground">
                        <th className="p-2 font-medium">{t("product")}</th>
                        <th className="p-2 font-medium">{t("qty")}</th>
                        <th className="p-2 font-medium">{t("purchase_type")}</th>
                        <th className="p-2 font-medium">{t("unit_price")}</th>
                        <th className="p-2 font-medium">{t("line_total")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(order.items ?? []).map((it) => {
                        const img = it.product?.image_url || it.product?.cover_image_url
                        const attrs = variantAttributes(it.variant)
                        const returnable = it.meta?.returnable !== false
                        return (
                          <tr key={it.id} className="border-b last:border-0">
                            <td className="p-2">
                              <div className="flex items-start gap-2">
                                {img ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={img} alt="" className="size-10 rounded border object-cover" />
                                ) : null}
                                <div>
                                  <p>{it.product_name || "—"}</p>
                                  {it.sku ? <p className="text-muted-foreground text-xs">{it.sku}</p> : null}
                                  {attrs ? <p className="text-muted-foreground text-xs">{attrs}</p> : null}
                                  {it.variant?.name && !attrs ? (
                                    <p className="text-muted-foreground text-xs">{it.variant.name}</p>
                                  ) : null}
                                  {!returnable ? (
                                    <Badge variant="outline" className="mt-1 text-[10px]">
                                      {t("not_returnable")}
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="mt-1 text-[10px]">
                                      {t("returnable")}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="p-2">{localizeNumber(it.quantity, locale)}</td>
                            <td className="p-2">{purchaseTypeLabel(it.purchase_type)}</td>
                            <td className="p-2">
                              <MoneyDisplay amount={it.unit_price_minor} currency={order.currency} />
                            </td>
                            <td className="p-2">
                              <MoneyDisplay amount={it.quantity * it.unit_price_minor} currency={order.currency} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </ScrollTable>
              </Panel>

              {statusHistory.length > 0 ? (
                <Panel title={t("status_timeline")}>
                  <ol className="space-y-2 text-sm">
                    {statusHistory.map((entry, idx) => (
                      <li key={`${entry.at}-${idx}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b pb-2 last:border-0">
                        <span className="text-muted-foreground text-xs">{formatDisplayDateTime(entry.at, locale, "")}</span>
                        {entry.from ? (
                          <span>{enumLabel("order_status", entry.from)}</span>
                        ) : null}
                        {entry.from && entry.to ? <span className="text-muted-foreground">→</span> : null}
                        {entry.to ? <span className="font-medium">{enumLabel("order_status", entry.to)}</span> : null}
                      </li>
                    ))}
                  </ol>
                </Panel>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <Panel title={t("profile_panel")}>
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{customerName}</p>
                    <p className="text-muted-foreground">
                      <Phone className="me-1 inline size-3.5" />
                      {customerPhone || "—"}
                    </p>
                    <p className="text-muted-foreground">
                      <Mail className="me-1 inline size-3.5" />
                      {customerEmail || "—"}
                    </p>
                    {order.customer_note ? (
                      <p className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-xs">{order.customer_note}</p>
                    ) : null}
                  </div>
                  {(order.customer_recent_orders ?? []).length > 0 ? (
                    <div className="mt-4 border-t pt-3">
                      <p className="text-muted-foreground mb-2 text-xs font-medium">{t("recent_orders")}</p>
                      <ul className="space-y-1.5 text-sm">
                        {order.customer_recent_orders!.map((ro) => (
                          <li key={ro.id} className="flex items-center justify-between gap-2">
                            <Link className="text-primary hover:underline" href={`/dashboard/orders/${ro.id}`}>
                              {ro.number || `#${ro.id}`}
                            </Link>
                            <Badge variant={statusBadgeVariant(ro.status)} className="text-[10px]">
                              {enumLabel("order_status", ro.status)}
                            </Badge>
                            <MoneyDisplay amount={ro.total_minor} currency={order.currency} className="text-xs" />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </Panel>
                <Panel title={t("shipping_address")}>
                  <StructuredAddressBlock addr={order.shipping_address} t={t} />
                  <p className="text-muted-foreground mt-4 text-xs font-medium">{t("billing_address")}</p>
                  <div className="mt-2">
                    <StructuredAddressBlock addr={order.billing_address} t={t} />
                  </div>
                  {order.meta?.shipping_title ? (
                    <p className="mt-3 text-xs">
                      <span className="text-muted-foreground">{t("shipping_method")}: </span>
                      {order.meta.shipping_title}
                    </p>
                  ) : null}
                </Panel>
              </div>

              <Panel title={t("gateway_panel")}>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground text-xs">{t("payment_provider")}</dt>
                    <dd>{order.payment_provider || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">{t("transaction_id")}</dt>
                    <dd className="font-mono text-xs" dir="ltr">
                      {transactionId || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">{t("payment_tender")}</dt>
                    <dd>{enumLabel("payment_tender", order.payment_tender)}</dd>
                  </div>
                  {order.amount_paid_minor != null ? (
                    <div>
                      <dt className="text-muted-foreground text-xs">{t("amount_paid")}</dt>
                      <dd>
                        <MoneyDisplay amount={order.amount_paid_minor} currency={order.currency} />
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!customerEmail || resendEmail.isPending}
                    onClick={() => resendEmail.mutate()}
                  >
                    <Mail className="size-3.5" />
                    {t("resend_email")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!customerPhone || resendSms.isPending}
                    onClick={() => resendSms.mutate()}
                  >
                    <MessageSquare className="size-3.5" />
                    {t("resend_sms")}
                  </Button>
                </div>
              </Panel>

              <Panel
                title={t("tapin_title")}
                actions={
                  order.meta?.tapin?.barcode || order.meta?.tapin?.order_id ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={tapinStatus.isPending} onClick={() => tapinStatus.mutate()}>
                        {t("tapin_refresh")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void printTapinLabel()}>
                        {t("tapin_label")}
                      </Button>
                    </div>
                  ) : null
                }
              >
                {order.meta?.tapin?.barcode || order.meta?.tapin?.order_id ? (
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground text-xs">{t("tapin_barcode")}</dt>
                      <dd className="font-mono">{order.meta.tapin.barcode || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">{t("tapin_status")}</dt>
                      <dd>{order.meta.tapin.status || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">{t("tapin_service")}</dt>
                      <dd>{tapinServiceLabel(order.meta.tapin.service)}</dd>
                    </div>
                    {order.meta.tapin.tracking_url ? (
                      <div>
                        <a
                          className="text-primary text-sm hover:underline"
                          href={order.meta.tapin.tracking_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("tapin_track")}
                        </a>
                      </div>
                    ) : null}
                  </dl>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <p className="text-muted-foreground w-full text-sm">{t("tapin_not_registered")}</p>
                    <select
                      className={`${selectClass} w-48`}
                      value={tapinService}
                      onChange={(e) => setTapinService(e.target.value)}
                    >
                      {TAPIN_SERVICES.map((s) => (
                        <option key={s} value={s}>
                          {tapinServiceLabel(s)}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" disabled={tapinRegister.isPending} onClick={() => tapinRegister.mutate()}>
                      {t("tapin_register")}
                    </Button>
                  </div>
                )}
              </Panel>

              <OrderMarketplacePanels order={{ id: order.id, sales_channel: order.sales_channel, meta: order.meta as Record<string, unknown> | null }} />

              <Panel title={t("notes")}>
                <ul className="mb-3 space-y-2">
                  {(order.notes ?? []).length === 0 ? (
                    <li className="text-muted-foreground text-sm">{t("empty_notes")}</li>
                  ) : (
                    (order.notes ?? []).map((n) => (
                      <li key={n.id} className="flex items-start justify-between gap-2 rounded-md border p-3 text-sm">
                        <div>
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            {n.is_customer ? (
                              <Badge variant="secondary">{t("customer_note_flag")}</Badge>
                            ) : null}
                          </div>
                          <p className="whitespace-pre-wrap">{n.body}</p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {n.user?.name || "—"} · {formatDisplayDateTime(n.created_at, locale, "")}
                          </p>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => confirm({ onConfirm: () => deleteNote.mutateAsync(n.id) })}>
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
                <div className="space-y-2">
                  <Textarea
                    className="min-h-[80px]"
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder={t("note_ph")}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={noteIsCustomer} onCheckedChange={(v) => setNoteIsCustomer(v === true)} />
                    {t("customer_note_flag")}
                  </label>
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
                    (order.returns ?? []).map((r) => {
                      const actions = returnActionsForStatus(r.status)
                      const manualRefund = r.admin_note?.includes("needs_manual_refund")
                      return (
                        <li key={r.id} className="space-y-2 rounded-md border p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={statusBadgeVariant(r.status)}>{enumLabel("return_status", r.status)}</Badge>
                            <span>{r.reason || "—"}</span>
                            {r.refund_minor != null ? <MoneyDisplay amount={r.refund_minor} currency={order.currency} /> : null}
                            {manualRefund ? (
                              <Badge variant="destructive">{t("needs_manual_refund")}</Badge>
                            ) : null}
                          </div>
                          {actions.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {actions.map((action) => (
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
                          ) : null}
                        </li>
                      )
                    })
                  )}
                </ul>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="lg:col-span-2">
                    <Label>{t("return_item")}</Label>
                    <select
                      className={`${selectClass} mt-1`}
                      value={returnItemId === "" ? "" : String(returnItemId)}
                      onChange={(e) => setReturnItemId(e.target.value ? Number(e.target.value) : "")}
                    >
                      <option value="">{t("return_item_optional")}</option>
                      {(order.items ?? []).map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.product_name} × {localizeNumber(it.quantity, locale)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>{t("return_qty")}</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      min={1}
                      value={returnQty}
                      onChange={(e) => setReturnQty(Math.max(1, Number(e.target.value) || 1))}
                    />
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
                  <div className="sm:col-span-2 lg:col-span-4">
                    <Label>{t("return_reason")}</Label>
                    <Input className="mt-1" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
                  </div>
                </div>
                <Button className="mt-3" disabled={createReturn.isPending} onClick={() => createReturn.mutate()}>
                  {t("create_return")}
                </Button>
              </Panel>

              {hasTracking ? (
                <Panel title={t("tracking")}>
                  <div className="space-y-1 text-sm">
                    {order.tracking_code ? (
                      <p>
                        <span className="text-muted-foreground text-xs">{t("tracking_code")}: </span>
                        <span className="font-mono" dir="ltr">
                          {order.tracking_code}
                        </span>
                      </p>
                    ) : null}
                    {order.tracking_url ? (
                      <a className="text-primary underline" href={order.tracking_url} target="_blank" rel="noreferrer" dir="ltr">
                        {order.tracking_url}
                      </a>
                    ) : null}
                  </div>
                </Panel>
              ) : null}

              {attributionEntries.length > 0 ? (
                <Panel title={t("attribution")}>
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
                    <MoneyDisplay className="font-semibold" amount={order.total_minor} currency={order.currency} />
                  </div>
                  {order.subtotal_minor != null ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t("subtotal")}</span>
                      <MoneyDisplay amount={order.subtotal_minor} currency={order.currency} />
                    </div>
                  ) : null}
                  {order.discount_minor != null && order.discount_minor > 0 ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t("discount_minor")}</span>
                      <MoneyDisplay amount={order.discount_minor} currency={order.currency} />
                    </div>
                  ) : null}
                  {order.shipping_minor != null ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t("shipping_minor")}</span>
                      <MoneyDisplay amount={order.shipping_minor} currency={order.currency} />
                    </div>
                  ) : null}
                  {order.tax_minor != null && order.tax_minor > 0 ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t("tax_minor")}</span>
                      <MoneyDisplay amount={order.tax_minor} currency={order.currency} />
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("sales_channel")}</span>
                    <span>
                      {order.sales_channel && isMarketplaceChannel(order.sales_channel)
                        ? marketplaceLabel(order.sales_channel, locale)
                        : enumLabel("sales_channel", order.sales_channel)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("col_date")}</span>
                    <span>{formatDisplayDateTime(order.created_at, locale)}</span>
                  </div>
                </div>
              </Panel>

              <Panel
                title={t("status")}
                actions={
                  <Button size="sm" variant="outline" onClick={() => setShipOpen(true)}>
                    <Truck className="size-3.5" />
                    {t("ship_order")}
                  </Button>
                }
              >
                <OrderStatusStepper
                  status={order.status}
                  nextStatuses={nextStatuses}
                  disabled={patchOrder.isPending}
                  onSelect={(next) => patchOrder.mutate({ status: next })}
                />
              </Panel>
            </aside>
          </div>

          <OrderShipDialog
            open={shipOpen}
            onOpenChange={setShipOpen}
            initialCode={order.tracking_code ?? ""}
            initialUrl={order.tracking_url ?? ""}
            pending={patchOrder.isPending}
            onSubmit={handleShipSubmit}
          />
        </>
      )}
      {confirmDialog}
    </PageShell>
  )
}
