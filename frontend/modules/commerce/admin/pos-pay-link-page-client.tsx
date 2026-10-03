"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { Minus, Plus, Search, Trash2 } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatNumber, normalizeUiLocale, toLocaleDigits } from "@/lib/locale"

import {
  POS_PURCHASE_TYPES,
  type PosCartLine,
  type ProductHit,
  type ProductVariantHit,
  buildShippingAddress,
  fetchGeoCities,
  fetchGeoStates,
  lineKey,
  searchPosProducts,
  type StructuredAddress,
} from "../lib/pos-commerce"

type CustomerHit = {
  id: number
  name?: string | null
  email?: string | null
}

type Gateway = {
  id: string
  label: string
}

type OrderResult = {
  id: number
  payment_url?: string | null
}

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export default function PosPayLinkPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("pos_admin")
  const locale = normalizeUiLocale(useLocale())
  const tPricing = useTranslations("pricing_settings.types")
  const [productQ, setProductQ] = useState("")
  const [productHits, setProductHits] = useState<ProductHit[]>([])
  const [variantPick, setVariantPick] = useState<{ product: ProductHit; variantId: number | null } | null>(null)
  const [customerQ, setCustomerQ] = useState("")
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([])
  const [lines, setLines] = useState<PosCartLine[]>([])
  const [userId, setUserId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [addr, setAddr] = useState<StructuredAddress>({})
  const [cities, setCities] = useState<string[]>([])
  const [purchaseType, setPurchaseType] = useState("cash")
  const [allowBothTypes, setAllowBothTypes] = useState(false)
  const [discountMinor, setDiscountMinor] = useState(0)
  const [shippingMinor, setShippingMinor] = useState(0)
  const [selectedGateways, setSelectedGateways] = useState<string[]>([])
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)

  const { data: gateways = [] } = useQuery({
    queryKey: ["payment-gateways"],
    queryFn: () => api<Gateway[]>("/api/v1/payment-gateways"),
  })

  const { data: states = [] } = useQuery({
    queryKey: ["geo-states"],
    queryFn: fetchGeoStates,
  })

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.qty * l.unit_price_minor, 0), [lines])
  const total = Math.max(0, subtotal - discountMinor + shippingMinor)

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
    if (q.length < 2) return
    const timer = window.setTimeout(() => void runProductSearch(), 280)
    return () => window.clearTimeout(timer)
  }, [productQ])

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

  function toggleGateway(id: string, checked: boolean) {
    setSelectedGateways((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  async function quoteShipping() {
    setQuoteLoading(true)
    setError(null)
    try {
      const res = await api<{ rates?: Array<{ cost_minor?: number }> }>("/api/v1/shipping/quote", {
        method: "POST",
        json: {
          state_code: addr.province_code ? `IR:${addr.province_code}` : null,
          postcode: addr.postcode || null,
          cart_subtotal_minor: subtotal,
        },
      })
      const first = res.rates?.[0]?.cost_minor
      if (typeof first === "number") {
        setShippingMinor(first)
      }
    } catch (e) {
      setError(getApiErrorMessage(e as Error))
    } finally {
      setQuoteLoading(false)
    }
  }

  const create = useMutation({
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
          customer_email: customerEmail || null,
          shipping_address: buildShippingAddress(addr),
          discount_minor: discountMinor,
          shipping_minor: shippingMinor,
          purchase_type: purchaseType,
          allow_both_types: allowBothTypes,
          is_pay_link: true,
          is_pos: true,
          gateways: selectedGateways,
          payment_tender: "online",
          status: "pending_payment",
        },
      }),
    onSuccess: (row) => {
      setPaymentUrl(row.payment_url || null)
      setError(null)
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <div className="space-y-6 p-6" dir="auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("pay_link_title")}</h1>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/pos">{t("back_pos")}</Link>
        </Button>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {paymentUrl ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("payment_url")}</CardTitle>
          </CardHeader>
          <CardContent>
            <a className="break-all text-sm underline" href={paymentUrl} target="_blank" rel="noreferrer" dir="ltr">
              {paymentUrl}
            </a>
          </CardContent>
        </Card>
      ) : null}

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
              {t("cancel_variant")}
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
                    <span>{p.name}</span>
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
                  <div key={l.lineKey} className="flex items-center justify-between gap-2 rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">{l.name}</p>
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
            <CardTitle>{t("pay_link_form")}</CardTitle>
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

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t("province")}</Label>
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
                <Label>{t("city")}</Label>
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
                <Label>{t("plaque")}</Label>
                <Input className="mt-1" value={addr.plaque ?? ""} onChange={(e) => setAddr((a) => ({ ...a, plaque: e.target.value }))} />
              </div>
              <div>
                <Label>{t("unit")}</Label>
                <Input className="mt-1" value={addr.unit ?? ""} onChange={(e) => setAddr((a) => ({ ...a, unit: e.target.value }))} />
              </div>
              <div>
                <Label>{t("postcode")}</Label>
                <Input className="mt-1" value={addr.postcode ?? ""} onChange={(e) => setAddr((a) => ({ ...a, postcode: e.target.value }))} dir="ltr" />
              </div>
              <div className="sm:col-span-2">
                <Label>{t("address_1")}</Label>
                <Input className="mt-1" value={addr.address ?? ""} onChange={(e) => setAddr((a) => ({ ...a, address: e.target.value }))} />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[160px] flex-1">
                <Label>{t("purchase_type")}</Label>
                <select className={`${selectClass} mt-1`} value={purchaseType} onChange={(e) => setPurchaseType(e.target.value)}>
                  {POS_PURCHASE_TYPES.map((pt) => (
                    <option key={pt} value={pt}>
                      {tPricing(pt)}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <Checkbox checked={allowBothTypes} onCheckedChange={(v) => setAllowBothTypes(v === true)} />
                {t("allow_both_types")}
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
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
                <div className="mt-1 flex gap-2">
                  <Input
                    type="number"
                    value={shippingMinor}
                    onChange={(e) => setShippingMinor(Number(e.target.value) || 0)}
                  />
                  <Button type="button" variant="secondary" disabled={quoteLoading} onClick={() => void quoteShipping()}>
                    {t("quote_shipping")}
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <Label>{t("gateways")}</Label>
              <div className="mt-2 space-y-2">
                {gateways.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedGateways.includes(g.id)}
                      onCheckedChange={(v) => toggleGateway(g.id, v === true)}
                    />
                    {g.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-md border p-3 text-sm font-semibold flex justify-between">
              <span>{t("total")}</span>
              <MoneyDisplay amount={total} />
            </div>

            <Button
              className="w-full"
              disabled={create.isPending || lines.length === 0}
              onClick={() => create.mutate()}
            >
              {t("create_pay_link")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
