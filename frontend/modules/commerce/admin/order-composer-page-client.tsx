"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { Minus, Plus, Search, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { ApiError, api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type ProductHit = {
  id: number
  name: string
  sku?: string | null
  price_minor?: number
}

type CustomerHit = {
  id: number
  name?: string | null
  email?: string | null
}

type CartLine = {
  product_id: number
  name: string
  qty: number
  unit_price_minor: number
  purchase_type: string
}

type OrderDetail = {
  id: number
  status?: string
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  customer_note?: string | null
  sales_channel?: string | null
  payment_tender?: string | null
  discount_minor?: number
  shipping_minor?: number
  amount_paid_minor?: number | null
  user_id?: number | null
  items?: Array<{
    product_id?: number
    product_name?: string
    quantity?: number
    unit_price_minor?: number
    purchase_type?: string
    product?: { id: number; name: string; price_minor?: number }
  }>
}

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

const PAYMENT_TENDERS = ["cash", "card_to_card", "pos_terminal", "online", "wallet", "other"]
const SALES_CHANNELS = [
  "in_store",
  "phone",
  "bale",
  "eitaa",
  "rubika",
  "telegram",
  "instagram",
  "other",
  "online",
]
const STATUSES = [
  "pending_payment",
  "on_hold",
  "paid",
  "processing",
  "shipped",
  "completed",
  "cancelled",
  "refunded",
  "failed",
]
const PURCHASE_TYPES = ["retail", "wholesale", "credit"]

async function searchProducts(q: string): Promise<ProductHit[]> {
  try {
    return await api<ProductHit[]>(`/api/v1/products/pos-search?q=${encodeURIComponent(q)}`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      return api<ProductHit[]>(`/api/v1/products?search=${encodeURIComponent(q)}&per_page=20`)
    }
    throw e
  }
}

export default function OrderComposerPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("orders_admin")
  const tCommon = useTranslations("common")
  const orderId = route.params?.orderId
  const isEdit = Boolean(orderId)

  const [productQ, setProductQ] = useState("")
  const [productHits, setProductHits] = useState<ProductHit[]>([])
  const [customerQ, setCustomerQ] = useState("")
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([])
  const [lines, setLines] = useState<CartLine[]>([])
  const [userId, setUserId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [salesChannel, setSalesChannel] = useState("in_store")
  const [paymentTender, setPaymentTender] = useState("cash")
  const [discountMinor, setDiscountMinor] = useState(0)
  const [shippingMinor, setShippingMinor] = useState(0)
  const [amountPaid, setAmountPaid] = useState(0)
  const [customerNote, setCustomerNote] = useState("")
  const [status, setStatus] = useState("pending_payment")
  const [error, setError] = useState<string | null>(null)

  const { data: existing, isLoading } = useQuery({
    queryKey: ["admin-order", orderId],
    enabled: isEdit,
    queryFn: () => api<OrderDetail>(`/api/v1/orders/${orderId}`),
  })

  useEffect(() => {
    if (!existing) return
    setStatus(existing.status || "pending_payment")
    setCustomerName(existing.customer_name || "")
    setCustomerPhone(existing.customer_phone || "")
    setCustomerEmail(existing.customer_email || "")
    setCustomerNote(existing.customer_note || "")
    setSalesChannel(existing.sales_channel || "in_store")
    setPaymentTender(existing.payment_tender || "cash")
    setDiscountMinor(existing.discount_minor || 0)
    setShippingMinor(existing.shipping_minor || 0)
    setAmountPaid(existing.amount_paid_minor || 0)
    setUserId(existing.user_id ?? null)
    setLines(
      (existing.items ?? []).map((it) => ({
        product_id: it.product_id || it.product?.id || 0,
        name: it.product_name || it.product?.name || `#${it.product_id}`,
        qty: it.quantity || 1,
        unit_price_minor: it.unit_price_minor ?? it.product?.price_minor ?? 0,
        purchase_type: it.purchase_type || "retail",
      })),
    )
  }, [existing])

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.qty * l.unit_price_minor, 0),
    [lines],
  )
  const total = Math.max(0, subtotal - discountMinor + shippingMinor)

  async function runProductSearch() {
    if (!productQ.trim()) {
      setProductHits([])
      return
    }
    try {
      setProductHits(await searchProducts(productQ.trim()))
    } catch (e) {
      setError(getApiErrorMessage(e as Error))
    }
  }

  async function runCustomerSearch() {
    if (!customerQ.trim()) {
      setCustomerHits([])
      return
    }
    try {
      setCustomerHits(await api<CustomerHit[]>(`/api/v1/pos/customers?q=${encodeURIComponent(customerQ.trim())}`))
    } catch {
      setCustomerHits([])
    }
  }

  function addProduct(p: ProductHit) {
    setLines((prev) => {
      const found = prev.find((l) => l.product_id === p.id)
      if (found) {
        return prev.map((l) => (l.product_id === p.id ? { ...l, qty: l.qty + 1 } : l))
      }
      return [
        ...prev,
        {
          product_id: p.id,
          name: p.name,
          qty: 1,
          unit_price_minor: p.price_minor ?? 0,
          purchase_type: "retail",
        },
      ]
    })
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        items: lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.qty,
          unit_price_minor: l.unit_price_minor,
          purchase_type: l.purchase_type,
          product_name: l.name,
        })),
        user_id: userId,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        customer_note: customerNote || null,
        sales_channel: salesChannel,
        payment_tender: paymentTender,
        discount_minor: discountMinor,
        shipping_minor: shippingMinor,
        amount_paid_minor: amountPaid,
        status,
      }
      if (isEdit) {
        return api<OrderDetail>(`/api/v1/orders/${orderId}`, { method: "PUT", json: payload })
      }
      return api<OrderDetail>("/api/v1/orders", { method: "POST", json: payload })
    },
    onSuccess: (row) => {
      if (row?.id) window.location.assign(`/admin/orders/${row.id}`)
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <div className="space-y-6 p-6" dir="auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{isEdit ? t("edit_order") : t("new_order")}</h1>
          <p className="text-muted-foreground text-sm">{route.fullPath}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/orders">{t("back_to_list")}</Link>
        </Button>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {isEdit && isLoading ? <p className="text-muted-foreground text-sm">{tCommon("loading")}</p> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("products")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="text-muted-foreground absolute start-2 top-2.5 size-4" />
                <Input
                  className="ps-8"
                  value={productQ}
                  onChange={(e) => setProductQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void runProductSearch()}
                  placeholder={t("search_products_ph")}
                />
              </div>
              <Button variant="secondary" onClick={() => void runProductSearch()}>
                {t("search")}
              </Button>
            </div>
            {productHits.length > 0 ? (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
                {productHits.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span>
                      {p.name}{" "}
                      <span className="text-muted-foreground">({(p.price_minor ?? 0).toLocaleString()})</span>
                    </span>
                    <Button size="sm" variant="outline" onClick={() => addProduct(p)}>
                      <Plus className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="space-y-2">
              {lines.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("empty_cart")}</p>
              ) : (
                lines.map((l) => (
                  <div key={l.product_id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-5">
                    <div className="sm:col-span-2">
                      <p className="font-medium text-sm">{l.name}</p>
                      <select
                        className={`${selectClass} mt-1`}
                        value={l.purchase_type}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) => (x.product_id === l.product_id ? { ...x, purchase_type: e.target.value } : x)),
                          )
                        }
                      >
                        {PURCHASE_TYPES.map((pt) => (
                          <option key={pt} value={pt}>
                            {pt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>{t("qty")}</Label>
                      <div className="mt-1 flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() =>
                            setLines((prev) =>
                              prev.map((x) =>
                                x.product_id === l.product_id ? { ...x, qty: Math.max(1, x.qty - 1) } : x,
                              ),
                            )
                          }
                        >
                          <Minus className="size-4" />
                        </Button>
                        <span className="w-8 text-center text-sm">{l.qty}</span>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() =>
                            setLines((prev) =>
                              prev.map((x) => (x.product_id === l.product_id ? { ...x, qty: x.qty + 1 } : x)),
                            )
                          }
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label>{t("unit_price")}</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        value={l.unit_price_minor}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) =>
                              x.product_id === l.product_id
                                ? { ...x, unit_price_minor: Number(e.target.value) || 0 }
                                : x,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setLines((prev) => prev.filter((x) => x.product_id !== l.product_id))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("customer_and_payment")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={customerQ}
                onChange={(e) => setCustomerQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void runCustomerSearch()}
                placeholder={t("search_customer_ph")}
              />
              <Button variant="secondary" onClick={() => void runCustomerSearch()}>
                {t("search")}
              </Button>
            </div>
            {customerHits.length > 0 ? (
              <ul className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
                {customerHits.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full rounded px-2 py-1 text-start hover:bg-muted"
                      onClick={() => {
                        setUserId(c.id)
                        setCustomerName(c.name || "")
                        setCustomerEmail(c.email || "")
                        setCustomerHits([])
                      }}
                    >
                      {c.name || c.email} #{c.id}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t("customer_name")}</Label>
                <Input className="mt-1" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div>
                <Label>{t("customer_phone")}</Label>
                <Input className="mt-1" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>{t("customer_email")}</Label>
                <Input className="mt-1" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
              </div>
              <div>
                <Label>{t("sales_channel")}</Label>
                <select className={`${selectClass} mt-1`} value={salesChannel} onChange={(e) => setSalesChannel(e.target.value)}>
                  {SALES_CHANNELS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t("payment_tender")}</Label>
                <select className={`${selectClass} mt-1`} value={paymentTender} onChange={(e) => setPaymentTender(e.target.value)}>
                  {PAYMENT_TENDERS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t("discount_minor")}</Label>
                <Input className="mt-1" type="number" value={discountMinor} onChange={(e) => setDiscountMinor(Number(e.target.value) || 0)} />
              </div>
              <div>
                <Label>{t("shipping_minor")}</Label>
                <Input className="mt-1" type="number" value={shippingMinor} onChange={(e) => setShippingMinor(Number(e.target.value) || 0)} />
              </div>
              <div>
                <Label>{t("amount_paid")}</Label>
                <Input className="mt-1" type="number" value={amountPaid} onChange={(e) => setAmountPaid(Number(e.target.value) || 0)} />
              </div>
              <div>
                <Label>{t("status")}</Label>
                <select className={`${selectClass} mt-1`} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label>{t("customer_note")}</Label>
                <Textarea className="mt-1" value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} />
              </div>
            </div>

            <div className="rounded-md border p-3 text-sm">
              <div className="flex justify-between">
                <span>{t("subtotal")}</span>
                <span>{subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>{t("total")}</span>
                <span>{total.toLocaleString()}</span>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={save.isPending || lines.length === 0}
              onClick={() => save.mutate()}
            >
              {tCommon("save")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
