"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { Minus, Plus, Search, Trash2 } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useEnumLabel } from "@/lib/enum-labels"
import { formatNumber, normalizeUiLocale, toLocaleDigits } from "@/lib/locale"

import {
  POS_PAYMENT_TENDERS,
  POS_SALES_CHANNELS,
  type PosCartLine,
  type ProductHit,
  type ProductVariantHit,
  lineKey,
  searchPosProducts,
} from "../lib/pos-commerce"

type CustomerHit = {
  id: number
  name?: string | null
  email?: string | null
}

type Gateway = { id: string; label: string }

type OrderResult = {
  id: number
  total_minor?: number
  payment_url?: string | null
}

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export default function PosPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("pos_admin")
  const enumLabel = useEnumLabel()
  const locale = useLocale()
  const [productQ, setProductQ] = useState("")
  const [productHits, setProductHits] = useState<ProductHit[]>([])
  const [variantPick, setVariantPick] = useState<{ product: ProductHit; variantId: number | null } | null>(null)
  const [customerQ, setCustomerQ] = useState("")
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([])
  const [lines, setLines] = useState<PosCartLine[]>([])
  const [userId, setUserId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [salesChannel, setSalesChannel] = useState("in_store")
  const [paymentTender, setPaymentTender] = useState("cash")
  const [discountMinor, setDiscountMinor] = useState(0)
  const [shippingMinor, setShippingMinor] = useState(0)
  const [amountPaid, setAmountPaid] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [lastOrderId, setLastOrderId] = useState<number | null>(null)

  const { data: gateways = [] } = useQuery({
    queryKey: ["payment-gateways"],
    queryFn: () => api<Gateway[]>("/api/v1/payment-gateways"),
  })

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.qty * l.unit_price_minor, 0), [lines])
  const total = Math.max(0, subtotal - discountMinor + shippingMinor)
  const change = Math.max(0, amountPaid - total)

  useEffect(() => {
    const q = productQ.trim()
    if (q.length < 2) return
    const timer = window.setTimeout(() => void runProductSearch(), 280)
    return () => window.clearTimeout(timer)
  }, [productQ])

  async function runProductSearch() {
    const q = productQ.trim()
    if (!q) {
      setProductHits([])
      return
    }
    try {
      const hits = await searchPosProducts(q)
      setProductHits(hits)
      // Barcode / exact SKU scan: unique hit with q length >= 4 auto-adds (WP PosSimplePage parity)
      if (hits.length === 1 && q.length >= 4) {
        const only = hits[0]
        const variants = (only.variants ?? []).filter((v) => v.id)
        const qLower = q.toLowerCase()
        const skuExact =
          (only.sku && only.sku.toLowerCase() === qLower) ||
          variants.some((v) => v.sku && v.sku.toLowerCase() === qLower)
        const shouldAuto = skuExact || variants.length <= 1
        if (shouldAuto) {
          if (variants.length === 1) {
            addLine(only, variants[0])
          } else if (variants.length === 0) {
            addLine(only, null)
          } else {
            const bySku = variants.find((v) => v.sku && v.sku.toLowerCase() === qLower)
            if (bySku) addLine(only, bySku)
            else {
              setVariantPick({ product: only, variantId: variants[0]?.id ?? null })
              return
            }
          }
          setProductQ("")
          setProductHits([])
        }
      }
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

  function addLine(product: ProductHit, variant?: ProductVariantHit | null) {
    const variantId = variant?.id ?? null
    const key = lineKey(product.id, variantId)
    const unit = variant?.price_minor ?? product.price_minor ?? 0
    const label = variant?.name ? `${product.name} — ${variant.name}` : product.name
    setLines((prev) => {
      const found = prev.find((l) => l.lineKey === key)
      if (found) {
        return prev.map((l) => (l.lineKey === key ? { ...l, qty: l.qty + 1 } : l))
      }
      return [...prev, { lineKey: key, product_id: product.id, product_variant_id: variantId, name: label, qty: 1, unit_price_minor: unit }]
    })
  }

  function onAddProduct(p: ProductHit) {
    const variants = (p.variants ?? []).filter((v) => v.id)
    if (variants.length === 1) {
      addLine(p, variants[0])
      return
    }
    if (variants.length > 1) {
      setVariantPick({ product: p, variantId: variants[0]?.id ?? null })
      return
    }
    addLine(p, null)
  }

  async function printOrder(id: number) {
    try {
      const data = await api<{ html?: string }>(
        `/api/v1/pos/orders/${id}/print?type=receipt&locale=${encodeURIComponent(locale)}`,
      )
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
            product_variant_id: l.product_variant_id ?? undefined,
            quantity: l.qty,
            unit_price_minor: l.unit_price_minor,
            product_name: l.name,
          })),
          user_id: userId,
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          sales_channel: salesChannel,
          payment_tender: paymentTender,
          discount_minor: discountMinor,
          shipping_minor: shippingMinor,
          amount_paid_minor: amountPaid,
          is_pos: true,
          status: amountPaid >= total ? "paid" : "pending_payment",
        },
      }),
    onSuccess: async (row) => {
      setLastOrderId(row.id)
      setLines([])
      setAmountPaid(0)
      setDiscountMinor(0)
      setShippingMinor(0)
      setError(null)
      await printOrder(row.id)
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <div className="-m-1 space-y-4 p-1 md:space-y-3" dir="auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground text-xs">{t("scan_hint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/pos/pay-link">{t("pay_link")}</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/pos/my-orders">{t("my_orders")}</Link>
          </Button>
        </div>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {lastOrderId ? (
        <p className="text-sm">
          {t("last_order")}{" "}
          <Link className="underline" href={`/dashboard/orders/${lastOrderId}`}>
            #{toLocaleDigits(lastOrderId, normalizeUiLocale(locale))}
          </Link>
        </p>
      ) : null}

      {variantPick ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
          <div className="min-w-[200px] flex-1">
            <Label>{t("select_variant")}</Label>
            <select
              className={`${selectClass} mt-1`}
              value={variantPick.variantId ?? ""}
              onChange={(e) =>
                setVariantPick((v) => (v ? { ...v, variantId: Number(e.target.value) || null } : v))
              }
            >
              {(variantPick.product.variants ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name || v.sku || `#${v.id}`}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            onClick={() => {
              const v = (variantPick.product.variants ?? []).find((x) => x.id === variantPick.variantId)
              addLine(variantPick.product, v ?? null)
              setVariantPick(null)
            }}
          >
            {t("add_variant")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setVariantPick(null)}>
            {t("cancel_variant")}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)] lg:items-start">
        <div className="space-y-3 rounded-lg border border-border bg-card/40 p-3">
          <p className="text-sm font-medium">{t("products")}</p>
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
                    <MoneyDisplay className="text-muted-foreground" amount={p.price_minor ?? 0} />
                  </span>
                  <Button size="sm" variant="outline" onClick={() => onAddProduct(p)}>
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
                <div key={l.lineKey} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div>
                    <p className="font-medium text-sm">{l.name}</p>
                    <MoneyDisplay className="text-muted-foreground text-xs" amount={l.unit_price_minor} />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() =>
                        setLines((prev) =>
                          prev.map((x) =>
                            x.lineKey === l.lineKey ? { ...x, qty: Math.max(1, x.qty - 1) } : x,
                          ),
                        )
                      }
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-8 text-center text-sm">{formatNumber(l.qty, normalizeUiLocale(locale))}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() =>
                        setLines((prev) =>
                          prev.map((x) => (x.lineKey === l.lineKey ? { ...x, qty: x.qty + 1 } : x)),
                        )
                      }
                    >
                      <Plus className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setLines((prev) => prev.filter((x) => x.lineKey !== l.lineKey))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card/50 p-3 lg:sticky lg:top-2">
          <p className="text-sm font-medium">{t("checkout")}</p>
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
                    {c.name || c.email} #{toLocaleDigits(c.id, normalizeUiLocale(locale))}
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
                {POS_SALES_CHANNELS.map((x) => (
                  <option key={x} value={x}>
                    {enumLabel("sales_channel", x)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t("payment_tender")}</Label>
              <select className={`${selectClass} mt-1`} value={paymentTender} onChange={(e) => setPaymentTender(e.target.value)}>
                {POS_PAYMENT_TENDERS.map((x) => (
                  <option key={x} value={x}>
                    {enumLabel("payment_tender", x)}
                  </option>
                ))}
              </select>
            </div>
            {paymentTender === "online" && gateways.length > 0 ? (
              <div className="sm:col-span-2">
                <Label>{t("gateways")}</Label>
                <p className="text-muted-foreground mt-1 text-xs">
                  {gateways.map((g) => g.label).join(" · ")}
                </p>
              </div>
            ) : null}
            <div>
              <Label>{t("discount_minor")}</Label>
              <Input
                className="mt-1"
                type="number"
                value={discountMinor}
                onChange={(e) => setDiscountMinor(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>{t("shipping_minor")}</Label>
              <Input
                className="mt-1"
                type="number"
                value={shippingMinor}
                onChange={(e) => setShippingMinor(Number(e.target.value) || 0)}
              />
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
              <div className="border-input bg-muted/40 mt-1 flex h-9 items-center rounded-md border px-3 text-sm">
                <MoneyDisplay amount={change} />
              </div>
            </div>
          </div>

          <div className="rounded-md border p-3 text-sm font-semibold flex justify-between">
            <span>{t("total")}</span>
            <MoneyDisplay amount={total} />
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={checkout.isPending || lines.length === 0}
            onClick={() => checkout.mutate()}
          >
            {t("checkout_btn")}
          </Button>
        </div>
      </div>
    </div>
  )
}
