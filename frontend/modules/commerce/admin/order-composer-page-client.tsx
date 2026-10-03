"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { Minus, Plus, Search, Trash2 } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useEnumLabel } from "@/lib/enum-labels"
import { formatNumber, normalizeUiLocale, toLocaleDigits } from "@/lib/locale"

import { ORDER_STATUSES } from "../lib/order-statuses"
import {
  POS_PAYMENT_TENDERS,
  POS_PURCHASE_TYPES,
  POS_SALES_CHANNELS,
  type PosCartLine,
  type ProductHit,
  type ProductVariantHit,
  buildShippingAddress,
  displayPurchaseType,
  fetchGeoCities,
  fetchGeoStates,
  lineKey,
  parseStructuredAddress,
  purchaseTypeForSave,
  searchPosProducts,
  type StructuredAddress,
} from "../lib/pos-commerce"

type CustomerHit = {
  id: number
  name?: string | null
  email?: string | null
}

type BuyerTax = {
  person_type?: string
  national_id?: string
  economic_code?: string
  register_number?: string
  invoice_pattern?: string
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
  coupon_code?: string | null
  shipping_address?: unknown
  buyer_tax?: BuyerTax | null
  items?: Array<{
    product_id?: number
    product_variant_id?: number | null
    product_name?: string
    quantity?: number
    unit_price_minor?: number
    purchase_type?: string
    product?: { id: number; name: string; price_minor?: number }
  }>
}

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export default function OrderComposerPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("orders_admin")
  const locale = normalizeUiLocale(useLocale())
  const tPricing = useTranslations("pricing_settings.types")
  const tCommon = useTranslations("common")
  const enumLabel = useEnumLabel()
  const orderId = route.params?.orderId
  const isEdit = Boolean(orderId)

  const [productQ, setProductQ] = useState("")
  const [productHits, setProductHits] = useState<ProductHit[]>([])
  const [variantPick, setVariantPick] = useState<{ product: ProductHit; variantId: number | null } | null>(
    null,
  )
  const [customerQ, setCustomerQ] = useState("")
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([])
  const [lines, setLines] = useState<PosCartLine[]>([])
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
  const [couponCode, setCouponCode] = useState("")
  const [addr, setAddr] = useState<StructuredAddress>({})
  const [personType, setPersonType] = useState("natural")
  const [nationalId, setNationalId] = useState("")
  const [economicCode, setEconomicCode] = useState("")
  const [registerNumber, setRegisterNumber] = useState("")
  const [invoicePattern, setInvoicePattern] = useState("")
  const [hadBuyerTax, setHadBuyerTax] = useState(false)
  const [cities, setCities] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const { data: states = [] } = useQuery({
    queryKey: ["geo-states"],
    queryFn: fetchGeoStates,
  })

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
    setCouponCode(existing.coupon_code || "")
    setAddr(parseStructuredAddress(existing.shipping_address))
    const tax = existing.buyer_tax
    setHadBuyerTax(Boolean(tax && typeof tax === "object"))
    if (tax && typeof tax === "object") {
      setPersonType(tax.person_type || "natural")
      setNationalId(tax.national_id || "")
      setEconomicCode(tax.economic_code || "")
      setRegisterNumber(tax.register_number || "")
      setInvoicePattern(tax.invoice_pattern || "")
    }
    setLines(
      (existing.items ?? []).map((it) => {
        const pid = it.product_id || it.product?.id || 0
        const vid = it.product_variant_id ?? null
        return {
          lineKey: lineKey(pid, vid),
          product_id: pid,
          product_variant_id: vid,
          name: it.product_name || it.product?.name || `#${pid}`,
          qty: it.quantity || 1,
          unit_price_minor: it.unit_price_minor ?? it.product?.price_minor ?? 0,
          purchase_type: displayPurchaseType(it.purchase_type || "cash"),
        }
      }),
    )
  }, [existing])

  useEffect(() => {
    const code = addr.province_code?.trim()
    if (!code) {
      setCities([])
      return
    }
    void fetchGeoCities(code).then(setCities).catch(() => setCities([]))
  }, [addr.province_code])

  useEffect(() => {
    const q = productQ.trim()
    if (q.length < 3) return
    const t = window.setTimeout(() => void runProductSearch(), 280)
    return () => window.clearTimeout(t)
  }, [productQ])

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.qty * l.unit_price_minor, 0),
    [lines],
  )
  const total = Math.max(0, subtotal - discountMinor + shippingMinor)
  const showMoadian = hadBuyerTax || personType === "legal"

  async function runProductSearch() {
    if (!productQ.trim()) {
      setProductHits([])
      return
    }
    try {
      setProductHits(await searchPosProducts(productQ.trim()))
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
      return [
        ...prev,
        {
          lineKey: key,
          product_id: product.id,
          product_variant_id: variantId,
          name: label,
          qty: 1,
          unit_price_minor: unit,
          purchase_type: "cash",
        },
      ]
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

  const save = useMutation({
    mutationFn: async () => {
      const buyerTax: BuyerTax = {
        person_type: personType,
        national_id: nationalId || undefined,
        economic_code: economicCode || undefined,
      }
      if (showMoadian) {
        buyerTax.register_number = registerNumber || undefined
        buyerTax.invoice_pattern = invoicePattern || undefined
      }
      const payload = {
        items: lines.map((l) => ({
          product_id: l.product_id,
          product_variant_id: l.product_variant_id ?? undefined,
          quantity: l.qty,
          unit_price_minor: l.unit_price_minor,
          purchase_type: purchaseTypeForSave(l.purchase_type || "cash"),
          product_name: l.name,
        })),
        user_id: userId,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        customer_note: customerNote || null,
        shipping_address: buildShippingAddress(addr),
        buyer_tax: buyerTax,
        coupon_code: !isEdit && couponCode.trim() ? couponCode.trim() : undefined,
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
      if (row?.id) window.location.assign(`/dashboard/orders/${row.id}`)
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <div className="space-y-6 p-6" dir="auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{isEdit ? t("edit_order") : t("new_order")}</h1>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/orders">{t("back_to_list")}</Link>
        </Button>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {isEdit && isLoading ? <p className="text-muted-foreground text-sm">{tCommon("loading")}</p> : null}

      {variantPick ? (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-4">
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
              onClick={() => {
                const v = (variantPick.product.variants ?? []).find((x) => x.id === variantPick.variantId)
                addLine(variantPick.product, v ?? null)
                setVariantPick(null)
              }}
            >
              {t("add_variant")}
            </Button>
            <Button variant="ghost" onClick={() => setVariantPick(null)}>
              {t("cancel")}
            </Button>
          </CardContent>
        </Card>
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
                      <MoneyDisplay className="text-muted-foreground" amount={p.price_minor ?? 0} />
                      {(p.variants?.length ?? 0) > 0 ? (
                        <span className="text-muted-foreground text-xs"> ({p.variants?.length} var.)</span>
                      ) : null}
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
                  <div key={l.lineKey} className="grid gap-2 rounded-md border p-3 sm:grid-cols-5">
                    <div className="sm:col-span-2">
                      <p className="font-medium text-sm">{l.name}</p>
                      <select
                        className={`${selectClass} mt-1`}
                        value={l.purchase_type || "cash"}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) => (x.lineKey === l.lineKey ? { ...x, purchase_type: e.target.value } : x)),
                          )
                        }
                      >
                        {POS_PURCHASE_TYPES.map((pt) => (
                          <option key={pt} value={pt}>
                            {tPricing(pt)}
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
                                x.lineKey === l.lineKey ? { ...x, qty: Math.max(1, x.qty - 1) } : x,
                              ),
                            )
                          }
                        >
                          <Minus className="size-4" />
                        </Button>
                        <span className="w-8 text-center text-sm">{formatNumber(l.qty, locale)}</span>
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
                              x.lineKey === l.lineKey
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
                        onClick={() => setLines((prev) => prev.filter((x) => x.lineKey !== l.lineKey))}
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
                      {c.name || c.email} #{toLocaleDigits(c.id, locale)}
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
            </div>

            <div>
              <Label>{t("shipping_address")}</Label>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">{t("province")}</Label>
                  <select
                    className={`${selectClass} mt-1`}
                    value={addr.province_code ?? ""}
                    onChange={(e) => setAddr((a) => ({ ...a, province_code: e.target.value, city: "" }))}
                  >
                    <option value="">—</option>
                    {states.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">{t("city")}</Label>
                  <select
                    className={`${selectClass} mt-1`}
                    value={addr.city ?? ""}
                    onChange={(e) => setAddr((a) => ({ ...a, city: e.target.value }))}
                    disabled={!addr.province_code}
                  >
                    <option value="">—</option>
                    {cities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">{t("plaque")}</Label>
                  <Input className="mt-1" value={addr.plaque ?? ""} onChange={(e) => setAddr((a) => ({ ...a, plaque: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">{t("unit")}</Label>
                  <Input className="mt-1" value={addr.unit ?? ""} onChange={(e) => setAddr((a) => ({ ...a, unit: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">{t("postcode")}</Label>
                  <Input className="mt-1" value={addr.postcode ?? ""} onChange={(e) => setAddr((a) => ({ ...a, postcode: e.target.value }))} dir="ltr" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">{t("address_1")}</Label>
                  <Input className="mt-1" value={addr.address ?? ""} onChange={(e) => setAddr((a) => ({ ...a, address: e.target.value }))} />
                </div>
              </div>
            </div>

            <div>
              <Label>{t("buyer_tax")}</Label>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">{t("person_type")}</Label>
                  <select className={`${selectClass} mt-1`} value={personType} onChange={(e) => setPersonType(e.target.value)}>
                    <option value="natural">{t("person_type_natural")}</option>
                    <option value="legal">{t("person_type_legal")}</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">{t("national_id")}</Label>
                  <Input className="mt-1" value={nationalId} onChange={(e) => setNationalId(e.target.value)} dir="ltr" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">{t("economic_code")}</Label>
                  <Input className="mt-1" value={economicCode} onChange={(e) => setEconomicCode(e.target.value)} dir="ltr" />
                </div>
                {showMoadian ? (
                  <>
                    <div>
                      <Label className="text-xs">{t("moadian_register_number")}</Label>
                      <Input className="mt-1" value={registerNumber} onChange={(e) => setRegisterNumber(e.target.value)} dir="ltr" />
                    </div>
                    <div>
                      <Label className="text-xs">{t("moadian_invoice_pattern")}</Label>
                      <Input className="mt-1" value={invoicePattern} onChange={(e) => setInvoicePattern(e.target.value)} dir="ltr" />
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {!isEdit ? (
              <div>
                <Label>{t("coupon_code")}</Label>
                <Input className="mt-1" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} dir="ltr" />
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
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
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {enumLabel("order_status", s)}
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
                <MoneyDisplay amount={subtotal} />
              </div>
              <div className="flex justify-between font-semibold">
                <span>{t("total")}</span>
                <MoneyDisplay amount={total} />
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
