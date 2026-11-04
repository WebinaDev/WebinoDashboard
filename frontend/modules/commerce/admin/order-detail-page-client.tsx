"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Mail, MessageSquare, Pencil, Phone } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useConfirm } from "@/components/ConfirmDialog"
import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { MobileListCard, MobileListField } from "@/components/MobileListCard"
import { OrderAddressBlock, addressesEqual } from "@/components/orders/OrderAddressBlock"
import { OrderCustomerContactBar } from "@/components/orders/OrderCustomerContactBar"
import { OrderNotesPanel } from "@/components/orders/OrderNotesPanel"
import { OrderPrintActions } from "@/components/orders/OrderPrintActions"
import { OrderShipDialog, type ShipPayload } from "@/components/orders/OrderShipDialog"
import { OrderSidebarPanel } from "@/components/orders/OrderSidebarPanel"
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
import { displayPurchaseType } from "../lib/pos-commerce"
import { BasalamOrderPanel } from "@/views/settings/panels/marketplace/BasalamOrderPanel"
import { OrderMarketplacePanels } from "./order-marketplace-panels"

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
  show_vat?: boolean
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
    refund_required?: boolean
    refund_reason?: string
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
  notes?: Array<{
    id: number
    body: string
    is_customer?: boolean
    user?: { id: number; name?: string | null } | null
    created_at?: string
  }>
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

function variantAttributes(variant: OrderItemRow["variant"]): string {
  if (!variant?.attribute_values || typeof variant.attribute_values !== "object") return ""
  return Object.entries(variant.attribute_values)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ")
}

type OrderAccountingInvoice = {
  id: number
  number: string
  moadian_status?: string | null
  moadian_reference?: string | null
  total_minor?: number
  status?: string
}

type OrderAccountingPayload = {
  synced: boolean
  invoice?: OrderAccountingInvoice | null
  can_sync?: boolean
}

export default function OrderDetailPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("orders_admin")
  const tAcc = useTranslations("accounting_portal")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const enumLabel = useEnumLabel()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const queryClient = useQueryClient()
  const orderId = route.params?.orderId

  const [returnReason, setReturnReason] = useState("")
  const [returnRefund, setReturnRefund] = useState(0)
  const [returnItemId, setReturnItemId] = useState<number | "">("")
  const [returnQty, setReturnQty] = useState(1)
  const [shipOpen, setShipOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tapinService, setTapinService] = useState("pishtaz")

  const { data: order, isLoading } = useQuery({
    queryKey: ["admin-order", orderId],
    enabled: Boolean(orderId),
    queryFn: () => api<OrderDetail>(`/api/v1/orders/${orderId}`),
  })

  const accountingQ = useQuery({
    queryKey: ["order-accounting", orderId],
    enabled: Boolean(orderId),
    queryFn: () => api<OrderAccountingPayload>(`/api/v1/accounting/orders/${orderId}`),
    retry: false,
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-order", orderId] })
    await queryClient.invalidateQueries({ queryKey: ["order-accounting", orderId] })
  }

  const patchOrder = useMutation({
    mutationFn: (json: Record<string, unknown>) => api(`/api/v1/orders/${orderId}`, { method: "PATCH", json }),
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

  const syncAccounting = useMutation({
    mutationFn: () => api(`/api/v1/accounting/sync/order/${orderId}`, { method: "POST" }),
    onSuccess: async () => {
      toast.success(tAcc("sync_done"))
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const sendMoadian = useMutation({
    mutationFn: () => api(`/api/v1/accounting/moadian/orders/${orderId}/send`, { method: "POST" }),
    onSuccess: async () => {
      toast.success(tAcc("moadian_sent"))
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
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
    if (!service) return tCommon("em_dash")
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
  const sameAddress = useMemo(
    () => addressesEqual(order?.billing_address, order?.shipping_address),
    [order?.billing_address, order?.shipping_address],
  )

  if (!orderId) {
    return <p className="p-6 text-destructive">{t("missing_id")}</p>
  }

  const customerName = order?.customer_name || order?.user?.name || tCommon("em_dash")
  const customerPhone = order?.customer_phone || order?.user?.phone || null
  const customerEmail = order?.customer_email || order?.user?.email || null
  const transactionId = order?.meta?.transaction_id || order?.payment_ref || null
  const hasTracking = Boolean(order?.tracking_code || order?.tracking_url)
  const nextStatuses = order?.next_statuses ?? []
  const shippingFree = order?.shipping_minor != null && order.shipping_minor <= 0
  const items = order?.items ?? []

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

  function renderItemMeta(it: OrderItemRow) {
    const attrs = variantAttributes(it.variant)
    const returnable = it.meta?.returnable !== false
    return (
      <>
        {attrs ? <p className="text-muted-foreground mt-1 text-xs">{attrs}</p> : null}
        {it.variant?.name && !attrs ? <p className="text-muted-foreground mt-1 text-xs">{it.variant.name}</p> : null}
        <p className="text-muted-foreground mt-0.5 text-xs">{purchaseTypeLabel(it.purchase_type)}</p>
        {!returnable ? (
          <Badge variant="outline" className="mt-1 text-[10px]">
            {t("not_returnable")}
          </Badge>
        ) : (
          <Badge variant="secondary" className="mt-1 text-[10px]">
            {t("returnable")}
          </Badge>
        )}
      </>
    )
  }

  return (
    <PageShell title={`${t("detail_title")} ${order?.number || `#${orderId}`}`}>
      {order?.meta?.refund_required ? (
        <div role="alert" className="mb-4 rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">{t("refund_required_title")}</p>
          <p>{t("refund_required_body")}</p>
        </div>
      ) : null}
      {error ? <p className="mb-3 text-destructive text-sm">{error}</p> : null}
      {isLoading || !order ? (
        <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
      ) : (
        <div className="space-y-6">
          {order.sales_channel === "basalam" ? <BasalamOrderPanel orderId={order.id} /> : null}
          {/* Header — WP OrderDetailPage top card */}
          <Card className="shadow-sm">
            <CardContent className="flex flex-col gap-4 pt-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold">
                    #{localizeNumber(String(order.number ?? order.id), locale)}
                  </h2>
                  <Badge variant={statusBadgeVariant(order.status)}>
                    {order.status_label || enumLabel("order_status", order.status)}
                  </Badge>
                  {order.is_pos ? <Badge variant="outline">{enumLabel("sales_channel", "pos")}</Badge> : null}
                  {order.sales_channel ? (
                    <Badge variant="secondary">
                      {isMarketplaceChannel(order.sales_channel)
                        ? marketplaceLabel(order.sales_channel, locale)
                        : enumLabel("sales_channel", order.sales_channel)}
                    </Badge>
                  ) : null}
                  {order.payment_provider || order.payment_tender ? (
                    <Badge variant="outline">
                      {order.sales_channel === "basalam" || /basalam/i.test(String(order.payment_provider || ""))
                        ? marketplaceLabel("basalam", locale)
                        : order.payment_provider || enumLabel("payment_tender", order.payment_tender)}
                    </Badge>
                  ) : null}
                </div>
                <OrderCustomerContactBar
                  phone={customerPhone}
                  email={customerEmail}
                  customerId={order.user?.id}
                  smsPending={resendSms.isPending}
                  onSms={() => resendSms.mutate()}
                />
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <OrderPrintActions orderId={orderId} />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={sendMoadian.isPending || accountingQ.data?.invoice?.moadian_status === "accepted"}
                    onClick={() => sendMoadian.mutate()}
                  >
                    {t("send_moadian")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link href={`/dashboard/orders/${orderId}/edit`}>
                      <Pencil className="size-3.5" />
                      {t("edit")}
                    </Link>
                  </Button>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link href="/dashboard/orders">{t("back_to_list")}</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Addresses above two-column — WP pattern */}
          {sameAddress ? (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("section_address")}</CardTitle>
              </CardHeader>
              <CardContent>
                <OrderAddressBlock address={order.shipping_address || order.billing_address} showEmail />
                {order.meta?.shipping_title ? (
                  <p className="text-muted-foreground mt-3 text-xs">
                    {t("shipping_method")}: {order.meta.shipping_title}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t("billing_address")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <OrderAddressBlock address={order.billing_address} showEmail />
                </CardContent>
              </Card>
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t("shipping_address")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <OrderAddressBlock address={order.shipping_address} showEmail={false} />
                  {order.meta?.shipping_title ? (
                    <p className="text-muted-foreground mt-3 text-xs">
                      {t("shipping_method")}: {order.meta.shipping_title}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
            {/* Main column */}
            <div className="min-w-0 space-y-6">
              <Card className="min-w-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t("section_general")}</CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 space-y-4">
                  <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
                    <div className="min-w-0">
                      <dt className="text-muted-foreground text-xs">{t("col_date")}</dt>
                      <dd className="break-words text-sm">{formatDisplayDateTime(order.created_at, locale)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-muted-foreground text-xs">{t("customer")}</dt>
                      <dd className="break-words text-sm">{customerEmail || customerName}</dd>
                    </div>
                    {order.meta?.shipping_title ? (
                      <div className="min-w-0">
                        <dt className="text-muted-foreground text-xs">{t("shipping_method")}</dt>
                        <dd className="break-words text-sm">{order.meta.shipping_title}</dd>
                      </div>
                    ) : null}
                    <div className="min-w-0">
                      <dt className="text-muted-foreground text-xs">{t("sales_channel")}</dt>
                      <dd className="break-words text-sm">
                        {order.sales_channel && isMarketplaceChannel(order.sales_channel)
                          ? marketplaceLabel(order.sales_channel, locale)
                          : enumLabel("sales_channel", order.sales_channel)}
                      </dd>
                    </div>
                  </dl>

                  <Separator />

                  {order.sales_channel !== "basalam" ? (
                    <OrderStatusStepper
                      status={order.status}
                      nextStatuses={nextStatuses}
                      disabled={patchOrder.isPending}
                      onSelect={(next) => patchOrder.mutate({ status: next })}
                      onShip={() => setShipOpen(true)}
                    />
                  ) : null}

                  {order.sales_channel !== "basalam" ? <Separator /> : null}

                  <div className="space-y-2">
                    <Label>{t("sms_title")}</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!customerPhone || resendSms.isPending}
                        onClick={() => resendSms.mutate()}
                      >
                        <MessageSquare className="size-3.5" />
                        {t("resend_sms")}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!customerEmail || resendEmail.isPending}
                        onClick={() => resendEmail.mutate()}
                      >
                        <Mail className="size-3.5" />
                        {t("resend_email")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <OrderMarketplacePanels
                order={{ id: order.id, sales_channel: order.sales_channel, meta: order.meta as Record<string, unknown> | null }}
              />

              <Card className="min-w-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t("items")}</CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 p-3 sm:p-6">
                  <div className="space-y-3 md:hidden">
                    {items.map((it) => {
                      const img = it.product?.image_url || it.product?.cover_image_url
                      const productHref = it.product?.id ? `/dashboard/products/${it.product.id}` : null
                      return (
                        <MobileListCard
                          key={it.id}
                          media={
                            <div className="flex gap-3">
                              {img ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={img} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                              ) : (
                                <div className="bg-muted size-14 shrink-0 rounded-lg" />
                              )}
                              <div className="min-w-0 flex-1 space-y-1">
                                {productHref ? (
                                  <Link href={productHref} className="text-primary break-words font-medium hover:underline">
                                    {it.product_name || tCommon("em_dash")}
                                  </Link>
                                ) : (
                                  <span className="break-words font-medium">{it.product_name || tCommon("em_dash")}</span>
                                )}
                                <p className="text-muted-foreground text-xs">
                                  × {localizeNumber(it.quantity, locale)}
                                  {it.sku ? ` · ${it.sku}` : ""}
                                </p>
                                {renderItemMeta(it)}
                              </div>
                            </div>
                          }
                        >
                          <MobileListField label={t("unit_price")}>
                            <MoneyDisplay amount={it.unit_price_minor} currency={order.currency} />
                          </MobileListField>
                          <MobileListField label={t("line_total")}>
                            <MoneyDisplay amount={it.quantity * it.unit_price_minor} currency={order.currency} />
                          </MobileListField>
                        </MobileListCard>
                      )
                    })}
                  </div>

                  <div className="hidden md:block">
                    <ScrollTable>
                      <table className="w-full min-w-[640px] text-sm">
                        <thead>
                          <tr className="border-b text-start text-muted-foreground">
                            <th className="w-14 p-2 font-medium" />
                            <th className="p-2 font-medium">{t("product")}</th>
                            <th className="p-2 font-medium">{t("col_sku")}</th>
                            <th className="p-2 font-medium text-end">{t("unit_price")}</th>
                            <th className="p-2 font-medium text-end">{t("line_total")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it) => {
                            const img = it.product?.image_url || it.product?.cover_image_url
                            const productHref = it.product?.id ? `/dashboard/products/${it.product.id}` : null
                            return (
                              <tr key={it.id} className="border-b last:border-0">
                                <td className="p-2">
                                  {img ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={img} alt="" className="size-10 rounded object-cover" />
                                  ) : (
                                    <div className="bg-muted size-10 rounded" />
                                  )}
                                </td>
                                <td className="p-2">
                                  {productHref ? (
                                    <Link href={productHref} className="text-primary font-medium hover:underline">
                                      {it.product_name || tCommon("em_dash")}
                                    </Link>
                                  ) : (
                                    <span className="font-medium">{it.product_name || tCommon("em_dash")}</span>
                                  )}
                                  <span className="text-muted-foreground ms-2">
                                    × {localizeNumber(it.quantity, locale)}
                                  </span>
                                  {renderItemMeta(it)}
                                </td>
                                <td className="p-2 text-sm">{it.sku || tCommon("em_dash")}</td>
                                <td className="p-2 text-end">
                                  <MoneyDisplay amount={it.unit_price_minor} currency={order.currency} />
                                </td>
                                <td className="p-2 text-end font-medium">
                                  <MoneyDisplay amount={it.quantity * it.unit_price_minor} currency={order.currency} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </ScrollTable>
                  </div>
                </CardContent>
              </Card>

              <Card className="min-w-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t("returns")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
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
                              <span>{r.reason || tCommon("em_dash")}</span>
                              {r.refund_minor != null ? (
                                <MoneyDisplay amount={r.refund_minor} currency={order.currency} />
                              ) : null}
                              {manualRefund ? <Badge variant="destructive">{t("needs_manual_refund")}</Badge> : null}
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
                        {items.map((it) => (
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
                  <Button disabled={createReturn.isPending} onClick={() => createReturn.mutate()}>
                    {t("create_return")}
                  </Button>
                </CardContent>
              </Card>

              <Card className="min-w-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t("section_totals")}</CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 space-y-2 text-sm">
                  {order.subtotal_minor != null ? (
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <span className="text-muted-foreground shrink-0">{t("subtotal")}</span>
                      <MoneyDisplay amount={order.subtotal_minor} currency={order.currency} />
                    </div>
                  ) : null}
                  {order.shipping_minor != null ? (
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <span className="text-muted-foreground shrink-0">{t("shipping_minor")}</span>
                      {shippingFree ? (
                        <span className="shrink-0">{t("shipping_free")}</span>
                      ) : (
                        <MoneyDisplay amount={order.shipping_minor} currency={order.currency} />
                      )}
                    </div>
                  ) : null}
                  {order.discount_minor != null && order.discount_minor > 0 ? (
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <span className="text-muted-foreground shrink-0">{t("discount_minor")}</span>
                      <MoneyDisplay amount={order.discount_minor} currency={order.currency} />
                    </div>
                  ) : null}
                  {order.show_vat !== false && order.tax_minor != null && order.tax_minor > 0 ? (
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <span className="text-muted-foreground shrink-0">{t("tax_minor")}</span>
                      <MoneyDisplay amount={order.tax_minor} currency={order.currency} />
                    </div>
                  ) : null}
                  <Separator />
                  <div className="flex min-w-0 items-start justify-between gap-3 text-base font-semibold">
                    <span className="shrink-0">{t("total")}</span>
                    <MoneyDisplay amount={order.total_minor} currency={order.currency} />
                  </div>
                  {order.customer_note ? (
                    <div className="bg-muted/40 mt-4 rounded-lg border p-3">
                      <p className="text-muted-foreground text-xs font-medium">{t("customer_note")}</p>
                      <p className="mt-1 break-words whitespace-pre-wrap">{order.customer_note}</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <OrderSidebarPanel title={t("profile_panel")}>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{customerName}</p>
                  <p className="text-muted-foreground">
                    <Phone className="me-1 inline size-3.5" />
                    {customerPhone || tCommon("em_dash")}
                  </p>
                  <p className="text-muted-foreground">
                    <Mail className="me-1 inline size-3.5" />
                    {customerEmail || tCommon("em_dash")}
                  </p>
                </div>
              </OrderSidebarPanel>
            </div>

            {/* Sidebar — WP meta-box order */}
            <aside className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
              <OrderNotesPanel
                orderId={orderId}
                notes={order.notes ?? []}
                onChanged={invalidate}
                onError={setError}
                onDeleteConfirm={(run) => confirm({ onConfirm: run })}
              />

              {(order.customer_recent_orders ?? []).length > 0 ? (
                <OrderSidebarPanel title={t("recent_orders")} defaultOpen={false}>
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
                </OrderSidebarPanel>
              ) : null}

              <OrderSidebarPanel title={t("accounting_panel")} defaultOpen>
                <div className="space-y-3 text-sm">
                  {accountingQ.isError ? (
                    <p className="text-muted-foreground text-xs">
                      <Link className="text-primary hover:underline" href="/dashboard/accounting">
                        {t("open_accounting")}
                      </Link>
                    </p>
                  ) : accountingQ.data?.synced && accountingQ.data.invoice ? (
                    <>
                      <p className="font-medium">{t("accounting_synced")}</p>
                      <dl className="space-y-1.5">
                        <div>
                          <dt className="text-muted-foreground text-xs">{t("invoice_number")}</dt>
                          <dd className="font-mono">{accountingQ.data.invoice.number}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground text-xs">{t("moadian_status")}</dt>
                          <dd>
                            <Badge variant="secondary">
                              {accountingQ.data.invoice.moadian_status || tAcc("moadian_not_sent")}
                            </Badge>
                            {accountingQ.data.invoice.moadian_reference ? (
                              <span className="text-muted-foreground ms-2 font-mono text-xs" dir="ltr">
                                {accountingQ.data.invoice.moadian_reference}
                              </span>
                            ) : null}
                          </dd>
                        </div>
                      </dl>
                    </>
                  ) : (
                    <p className="text-muted-foreground text-xs">{t("accounting_not_synced")}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {!accountingQ.data?.synced ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={syncAccounting.isPending}
                        onClick={() => syncAccounting.mutate()}
                      >
                        {t("accounting_sync")}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        sendMoadian.isPending || accountingQ.data?.invoice?.moadian_status === "accepted"
                      }
                      onClick={() => sendMoadian.mutate()}
                    >
                      {t("send_moadian")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" asChild>
                      <Link href="/dashboard/accounting/orders-sync">{t("open_accounting")}</Link>
                    </Button>
                  </div>
                </div>
              </OrderSidebarPanel>

              <OrderSidebarPanel title={t("tracking")}>
                <div className="space-y-3">
                  {order.tracking_code ? (
                    <p className="text-sm">
                      <span className="text-muted-foreground">{t("tracking_code")}: </span>
                      <span className="break-all font-medium font-mono" dir="ltr">
                        {order.tracking_code}
                      </span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">{t("no_tracking_yet")}</p>
                  )}
                  {order.tracking_url ? (
                    <p className="min-w-0 text-sm">
                      <a
                        className="text-primary break-all hover:underline"
                        href={order.tracking_url}
                        target="_blank"
                        rel="noreferrer"
                        dir="ltr"
                      >
                        {t("tracking_link")}
                      </a>
                    </p>
                  ) : null}
                  <Button type="button" size="sm" onClick={() => setShipOpen(true)}>
                    {t("ship_order")}
                  </Button>
                </div>
              </OrderSidebarPanel>

              <OrderSidebarPanel
                title={t("tapin_title")}
                defaultOpen={Boolean(order.meta?.tapin?.barcode || order.meta?.tapin?.order_id)}
                actions={
                  order.meta?.tapin?.barcode || order.meta?.tapin?.order_id ? (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={tapinStatus.isPending}
                        onClick={(e) => {
                          e.stopPropagation()
                          tapinStatus.mutate()
                        }}
                      >
                        {t("tapin_refresh")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={(e) => {
                          e.stopPropagation()
                          void printTapinLabel()
                        }}
                      >
                        {t("tapin_label")}
                      </Button>
                    </div>
                  ) : null
                }
              >
                {order.meta?.tapin?.barcode || order.meta?.tapin?.order_id ? (
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground text-xs">{t("tapin_barcode")}</dt>
                      <dd className="font-mono">{order.meta.tapin.barcode || tCommon("em_dash")}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">{t("tapin_status")}</dt>
                      <dd>{order.meta.tapin.status || tCommon("em_dash")}</dd>
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
                      className={`${selectClass} w-40`}
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
              </OrderSidebarPanel>

              <OrderSidebarPanel title={t("gateway_panel")} defaultOpen={false}>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">{t("payment_provider")}</dt>
                    <dd>
                      {order.sales_channel === "basalam" || /basalam/i.test(String(order.payment_provider || ""))
                        ? marketplaceLabel("basalam", locale)
                        : order.payment_provider || tCommon("em_dash")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">{t("transaction_id")}</dt>
                    <dd className="font-mono text-xs" dir="ltr">
                      {transactionId || tCommon("em_dash")}
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
              </OrderSidebarPanel>

              {statusHistory.length > 0 ? (
                <OrderSidebarPanel title={t("status_timeline")} defaultOpen={false}>
                  <ol className="space-y-2 text-sm">
                    {statusHistory.map((entry, idx) => (
                      <li
                        key={`${entry.at}-${idx}`}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b pb-2 last:border-0"
                      >
                        <span className="text-muted-foreground text-xs">
                          {formatDisplayDateTime(entry.at, locale, "")}
                        </span>
                        {entry.from ? <span>{enumLabel("order_status", entry.from)}</span> : null}
                        {entry.from && entry.to ? <span className="text-muted-foreground">→</span> : null}
                        {entry.to ? <span className="font-medium">{enumLabel("order_status", entry.to)}</span> : null}
                      </li>
                    ))}
                  </ol>
                </OrderSidebarPanel>
              ) : null}

              {attributionEntries.length > 0 ? (
                <OrderSidebarPanel title={t("attribution")} defaultOpen={false}>
                  <dl className="space-y-2 text-sm">
                    {attributionEntries.map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-muted-foreground text-xs">{k}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </OrderSidebarPanel>
              ) : null}
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
        </div>
      )}
      {confirmDialog}
    </PageShell>
  )
}
