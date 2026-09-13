"use client"

import { useMutation } from "@tanstack/react-query"
import { Minus, Plus, Search, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
}

type OrderResult = {
  id: number
  total_minor?: number
  payment_url?: string | null
}

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

const PAYMENT_TENDERS = ["cash", "card_to_card", "pos_terminal", "online", "wallet", "other"]
const SALES_CHANNELS = ["in_store", "phone", "other"]

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

export default function PosPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("pos_admin")
  const [productQ, setProductQ] = useState("")
  const [productHits, setProductHits] = useState<ProductHit[]>([])
  const [customerQ, setCustomerQ] = useState("")
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([])
  const [lines, setLines] = useState<CartLine[]>([])
  const [userId, setUserId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [salesChannel, setSalesChannel] = useState("in_store")
  const [paymentTender, setPaymentTender] = useState("cash")
  const [amountPaid, setAmountPaid] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [lastOrderId, setLastOrderId] = useState<number | null>(null)

  const total = useMemo(() => lines.reduce((s, l) => s + l.qty * l.unit_price_minor, 0), [lines])
  const change = Math.max(0, amountPaid - total)

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
      return [...prev, { product_id: p.id, name: p.name, qty: 1, unit_price_minor: p.price_minor ?? 0 }]
    })
  }

  async function printOrder(id: number) {
    try {
      const data = await api<{ html?: string }>(`/api/v1/pos/orders/${id}/print`)
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

  const checkout = useMutation({
    mutationFn: () =>
      api<OrderResult>("/api/v1/pos/orders", {
        method: "POST",
        json: {
          items: lines.map((l) => ({
            product_id: l.product_id,
            quantity: l.qty,
            unit_price_minor: l.unit_price_minor,
            product_name: l.name,
          })),
          user_id: userId,
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          sales_channel: salesChannel,
          payment_tender: paymentTender,
          amount_paid_minor: amountPaid,
          is_pos: true,
          status: amountPaid >= total ? "paid" : "pending_payment",
        },
      }),
    onSuccess: async (row) => {
      setLastOrderId(row.id)
      setLines([])
      setAmountPaid(0)
      setError(null)
      await printOrder(row.id)
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <div className="space-y-6 p-6" dir="auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{route.fullPath}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/pos/pay-link">{t("pay_link")}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/pos/my-orders">{t("my_orders")}</Link>
          </Button>
        </div>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {lastOrderId ? (
        <p className="text-sm">
          {t("last_order")}{" "}
          <Link className="underline" href={`/admin/orders/${lastOrderId}`}>
            #{lastOrderId}
          </Link>
        </p>
      ) : null}

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
                  autoFocus
                />
              </div>
              <Button variant="secondary" onClick={() => void runProductSearch()}>
                {t("search")}
              </Button>
            </div>
            {productHits.length > 0 ? (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
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
                  <div key={l.product_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                    <div>
                      <p className="font-medium text-sm">{l.name}</p>
                      <p className="text-muted-foreground text-xs">{l.unit_price_minor.toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-1">
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
            <CardTitle>{t("checkout")}</CardTitle>
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
              <ul className="max-h-28 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
                {customerHits.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full rounded px-2 py-1 text-start hover:bg-muted"
                      onClick={() => {
                        setUserId(c.id)
                        setCustomerName(c.name || "")
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
                <Label>{t("amount_paid")}</Label>
                <Input
                  className="mt-1"
                  type="number"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label>{t("change")}</Label>
                <Input className="mt-1" readOnly value={change.toLocaleString()} />
              </div>
            </div>

            <div className="rounded-md border p-3 text-sm font-semibold flex justify-between">
              <span>{t("total")}</span>
              <span>{total.toLocaleString()}</span>
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={checkout.isPending || lines.length === 0}
              onClick={() => checkout.mutate()}
            >
              {t("checkout_btn")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
