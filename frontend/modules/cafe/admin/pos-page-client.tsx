"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ChefHat,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
  Utensils,
  X,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { MoneyText } from "@/components/currency/MoneyDisplay"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { cn } from "@/lib/utils"

import { CafeAdminShell, CafeEmptyState, CafeSection, cafeSelectClass } from "./cafe-admin-ui"
import { drain, enqueue, isNetworkFailure, onReconnect, readQueue } from "./offline-queue"
import {
  type CartLine,
  type CartModifier,
  type DiscountType,
  type Fulfillment,
  type PosFees,
  cartKey,
  changeMinor,
  clearDraft,
  lineTotalMinor,
  lineUnitMinor,
  readDraft,
  remainingMinor,
  resolveDiscountMinor,
  toPayload,
  totalDueMinor,
  writeDraft,
} from "./pos-cart"

type Variant = { id: number; name: string; price_minor: number }

type ModifierOption = {
  id: number
  name: string
  name_en: string | null
  price_minor: number
  is_addon: boolean
  is_default: boolean
}

type Modifier = {
  id: number
  name: string
  is_required: boolean
  min_select: number
  max_select: number
  options: ModifierOption[]
}

type PosProduct = {
  id: number
  name: string
  sku?: string | null
  category?: string | null
  price_minor?: number
  available: boolean
  variants: Variant[]
  modifiers: Modifier[]
}

type PosTable = { id: number; branch_id: number | null; code: string; label: string | null; seats: number; status: string }

type Bootstrap = {
  branches: Array<{ id: number; name_fa: string; name_en: string | null; slug: string | null }>
  tables: PosTable[]
  products: PosProduct[]
  tenders: string[]
  fulfillment: Record<Fulfillment, boolean>
  fees: PosFees
  loyalty_enabled: boolean
}

type GuestHit = { id: number; name: string | null; phone: string | null; email: string | null; points: number }

type SavedOrder = {
  id: number
  number: string
  total_minor: number
  status: string
  paid: boolean
  items: Array<{ id: number; name: string; quantity: number; unit_price_minor: number; note: string | null }>
}

const FULFILLMENTS: Fulfillment[] = ["dine_in", "takeaway", "delivery"]

const FULFILLMENT_ICON = {
  dine_in: Utensils,
  takeaway: ShoppingBag,
  delivery: Truck,
} as const

const TENDER_DEFAULT: Record<string, string> = {
  cash: "cash",
  card_to_card: "card_to_card",
  pos_terminal: "pos_terminal",
  online: "online",
  wallet: "wallet",
  other: "other",
}

/** Big enough for a thumb, not a mouse. */
const TAP = "min-h-11"

/**
 * Thrown when a sale was written to the offline queue instead of the server.
 *
 * It is not an error the cashier should see: the sale is safe, it just has not reached the
 * API yet. Distinguishing it from a real failure is what lets onError clear the basket.
 */
class QueuedSaleError extends Error {
  constructor() {
    super("queued")
    this.name = "QueuedSaleError"
  }
}

export default function PosPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.pos")
  const queryClient = useQueryClient()

  const [branchId, setBranchId] = useState<number | null>(null)
  const [fulfillment, setFulfillment] = useState<Fulfillment>("dine_in")
  const [tableCode, setTableCode] = useState<string | null>(null)
  const [lines, setLines] = useState<CartLine[]>([])
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("")
  const [pickProduct, setPickProduct] = useState<PosProduct | null>(null)

  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerNote, setCustomerNote] = useState("")
  const [userId, setUserId] = useState<number | null>(null)
  const [guestHits, setGuestHits] = useState<GuestHit[]>([])

  const [discountType, setDiscountType] = useState<DiscountType>("none")
  const [discountPercent, setDiscountPercent] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [couponCode, setCouponCode] = useState("")
  const [loyaltyPoints, setLoyaltyPoints] = useState(0)

  const [deliveryAddress, setDeliveryAddress] = useState("")
  // Which delivery area covers the address, and what it charges. Resolved by the server so
  // the fee and the minimum are the same numbers the saved order will use — the till used to
  // always send `deliveryZoneId: null`, so a shop that set up districts still charged everyone
  // the flat fee and never enforced its minimum.
  const [zoneQuote, setZoneQuote] = useState<{
    zone_id: number | null
    zone_name: string | null
    fee_minor: number
    minimum_minor: number
    eta_minutes: number
    meets_minimum: boolean
    covered: boolean
  } | null>(null)
  const [zoneLookupFailed, setZoneLookupFailed] = useState(false)

  const [payments, setPayments] = useState<Array<{ tender: string; amount_minor: number; received_minor?: number | null }>>([])
  const [settleOpen, setSettleOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // True when the last sale was captured locally because the network was down.
  const [queuedNotice, setQueuedNotice] = useState(false)
  const [queuedCount, setQueuedCount] = useState(0)
  const [saved, setSaved] = useState<SavedOrder | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)

  const [draftNotice, setDraftNotice] = useState(false)
  // Coupons and points can only be priced by the server. When one is in play the till asks,
  // and shows the answer rather than its own guess — a total the guest is told and then charged
  // differently is the one bug at a counter that cannot be explained afterwards.
  const [serverQuote, setServerQuote] = useState<{ discount: number; total: number; couponError: string | null } | null>(null)

  // Delivery areas for the address being typed. Debounced, and only asked for while the
  // order is actually a delivery: a dine-in sale must not pay for a zone lookup.
  useEffect(() => {
    if (fulfillment !== "delivery" || deliveryAddress.trim().length < 3) {
      setZoneQuote(null)
      setZoneLookupFailed(false)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ address: deliveryAddress.trim() })
      if (branchId) params.set("branch_id", String(branchId))

      void api<{
        zone_id: number | null
        zone_name: string | null
        fee_minor: number
        minimum_minor: number
        eta_minutes: number
        meets_minimum: boolean
        covered: boolean
      }>(`/api/v1/cafe/delivery-quote?${params.toString()}`, { signal: controller.signal })
        .then((res) => {
          setZoneQuote(res ?? null)
          setZoneLookupFailed(false)
        })
        .catch((e: unknown) => {
          // An aborted request is the older keystroke losing a race, not a failure.
          if (e instanceof Error && e.name === "AbortError") return
          setZoneLookupFailed(true)
        })
    }, 500)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [fulfillment, deliveryAddress, branchId])

  const boot = useQuery({
    queryKey: ["cafe-pos-bootstrap", branchId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (branchId) params.set("branch_id", String(branchId))
      const res = await api<Bootstrap>(`/api/v1/cafe/pos/bootstrap?${params.toString()}`)
      return res
    },
    staleTime: 120_000,
  })

  const data = boot.data
  const tables = useMemo(() => data?.tables ?? [], [data])
  const products = useMemo(() => data?.products ?? [], [data])

  /* ---------------------------------------------------------------- draft --- */

  // Restoring a draft is offered, never automatic: a cashier starting their shift should
  // not inherit the previous person's half-finished order without noticing.
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    const draft = readDraft()
    if (draft && draft.lines.length > 0) setDraftNotice(true)
  }, [])

  function restoreDraft() {
    const draft = readDraft()
    if (!draft) return
    setLines(draft.lines)
    setFulfillment(draft.fulfillment)
    setTableCode(draft.tableCode)
    setCustomerName(draft.customerName)
    setCustomerPhone(draft.customerPhone)
    setCustomerNote(draft.customerNote)
    setUserId(draft.userId)
    setDeliveryAddress(draft.deliveryAddress)
    setDiscountType(draft.discountType)
    setDiscountPercent(draft.discountPercent)
    setDiscountAmount(draft.discountAmountMinor)
    setCouponCode(draft.couponCode)
    setLoyaltyPoints(draft.loyaltyPoints)
    setDraftNotice(false)
  }

  useEffect(() => {
    if (lines.length === 0) return
    writeDraft({
      lines,
      fulfillment,
      tableCode,
      customerName,
      customerPhone,
      customerNote,
      userId,
      deliveryAddress,
      discountType,
      discountPercent,
      discountAmountMinor: discountAmount,
      couponCode,
      loyaltyPoints,
      updatedAt: new Date().toISOString(),
    })
  }, [
    lines, fulfillment, tableCode, customerName, customerPhone, customerNote,
    userId, deliveryAddress, discountType, discountPercent, discountAmount, couponCode, loyaltyPoints,
  ])

  /* --------------------------------------------------------------- basket --- */

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const p of products) if (p.category) set.add(p.category)
    return [...set].sort()
  }, [products])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return products.filter((p) => {
      if (!p.available) return false
      if (category && p.category !== category) return false
      if (!needle) return true
      return p.name.toLowerCase().includes(needle) || (p.sku ?? "").toLowerCase().includes(needle)
    })
  }, [products, search, category])

  const needsServerQuote = discountType === "coupon" || discountType === "loyalty"

  const discountMinor = resolveDiscountMinor(discountType, lines, {
    percent: discountPercent,
    amountMinor: discountAmount,
    couponMinor: serverQuote?.discount ?? 0,
    loyaltyMinor: serverQuote?.discount ?? 0,
  })

  const localTotals = useMemo(() => {
    const base = totalDueMinor(lines, discountMinor, fulfillment, data?.fees)

    // A covered zone replaces the flat delivery fee. The server does the same in
    // `OrderIntake::shippingMinor`, so the till and the saved order cannot disagree.
    if (fulfillment === "delivery" && zoneQuote?.covered) {
      const adjusted = base.total - (data?.fees?.delivery_minor ?? 0) + zoneQuote.fee_minor
      return { ...base, total: Math.max(0, adjusted) }
    }

    return base
  }, [lines, discountMinor, fulfillment, data?.fees, zoneQuote])

  // Below the area's minimum the shop has said it will not deliver. The server refuses too;
  // catching it here means the cashier sees why before the guest is told a total.
  const belowZoneMinimum =
    fulfillment === "delivery" &&
    zoneQuote?.covered === true &&
    zoneQuote.minimum_minor > 0 &&
    localTotals.subtotal - localTotals.discount < zoneQuote.minimum_minor

  // A server quote wins whenever it is fresher than the basket it priced. The `quoteKey`
  // guard is what stops a stale answer from a slow request overwriting a newer basket.
  const totals =
    needsServerQuote && serverQuote !== null
      ? { ...localTotals, discount: serverQuote.discount, total: serverQuote.total }
      : localTotals

  const outstanding = remainingMinor(totals.total, payments)

  // Ask the server what a coupon or a points spend is worth. Debounced, and guarded against
  // out-of-order responses: a slow reply for an old basket must not price a new one.
  const quoteSeq = useRef(0)
  useEffect(() => {
    if (!needsServerQuote || lines.length === 0) {
      setServerQuote(null)
      return
    }

    const seq = ++quoteSeq.current
    const timer = setTimeout(() => {
      void api<{ discount_minor: number; total_minor: number; coupon_error: string | null }>(
        "/api/v1/cafe/pos/quote",
        {
          method: "POST",
          json: {
            fulfillment,
            branch_id: branchId,
            user_id: userId,
            discount_type: discountType,
            discount_percent: discountPercent,
            discount_minor: discountAmount,
            coupon_code: couponCode,
            loyalty_points: loyaltyPoints,
            items: lines.map((line) => ({
              product_id: line.product_id,
              product_variant_id: line.product_variant_id,
              quantity: line.quantity,
              modifier_option_ids: line.modifiers.map((m) => m.option_id),
            })),
          },
        },
      )
        .then((res) => {
          if (seq !== quoteSeq.current) return
          setServerQuote({
            discount: res?.discount_minor ?? 0,
            total: res?.total_minor ?? 0,
            couponError: res?.coupon_error ?? null,
          })
        })
        .catch(() => {
          // Leave the last good quote in place rather than flashing a zero total.
        })
    }, 400)

    return () => clearTimeout(timer)
  }, [
    needsServerQuote, lines, fulfillment, branchId, userId,
    discountType, discountPercent, discountAmount, couponCode, loyaltyPoints,
  ])

  function addLine(product: PosProduct, variant: Variant | null, mods: CartModifier[], note: string | null) {
    const base = variant?.price_minor ?? product.price_minor ?? 0
    const key = cartKey(product.id, variant?.id ?? null, mods, note)
    setLines((prev) => {
      const existing = prev.findIndex((line) => line.key === key)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = { ...next[existing], quantity: next[existing].quantity + 1 }
        return next
      }
      return [
        ...prev,
        {
          key,
          product_id: product.id,
          product_variant_id: variant?.id ?? null,
          name: product.name,
          variant_name: variant?.name ?? null,
          base_price_minor: base,
          quantity: 1,
          modifiers: mods,
          note,
        },
      ]
    })
  }

  function setQty(key: string, qty: number) {
    setLines((prev) =>
      qty <= 0 ? prev.filter((line) => line.key !== key) : prev.map((line) => (line.key === key ? { ...line, quantity: qty } : line)),
    )
  }

  function reset() {
    setLines([])
    setPayments([])
    setCustomerName("")
    setCustomerPhone("")
    setCustomerNote("")
    setUserId(null)
    setGuestHits([])
    setDiscountType("none")
    setDiscountPercent(0)
    setDiscountAmount(0)
    setCouponCode("")
    setLoyaltyPoints(0)
    setDeliveryAddress("")
    setZoneQuote(null)
    setZoneLookupFailed(false)
    setTableCode(null)
    setSaved(null)
    setEditingId(null)
    setError(null)
    clearDraft()
  }

  /* -------------------------------------------------------------- mutations --- */

  const submit = useMutation({
    mutationFn: async (opts: { settle: boolean }) => {
      const payload = toPayload(lines, {
        fulfillment,
        branchId,
        tableCode,
        customerName,
        customerPhone,
        customerNote,
        userId,
        deliveryAddress,
        deliveryZoneId: zoneQuote?.covered ? zoneQuote.zone_id : null,
        discountType,
        discountPercent,
        discountAmountMinor: discountAmount,
        couponCode,
        loyaltyPoints,
        // Paying in full is recorded as one tender unless the cashier split it.
        payments: opts.settle
          ? payments.length > 0
            ? payments
            : [{ tender: "cash", amount_minor: totals.total }]
          : [],
      })

      const path = editingId !== null ? `/api/v1/cafe/pos/orders/${editingId}` : "/api/v1/cafe/pos/orders"
      const method = editingId !== null ? "PUT" : "POST"

      try {
        return await api<SavedOrder>(path, { method, json: payload })
      } catch (error) {
        // The guest has their coffee and the cashier has the money: a dropped connection must
        // not destroy the only record of the sale. Queue it and let the till carry on.
        if (isNetworkFailure(error)) {
          enqueue({ path, method, body: payload })
          throw new QueuedSaleError()
        }
        throw error
      }
    },
    onSuccess: (order) => {
      setSaved(order)
      setSettleOpen(false)
      clearDraft()
      void queryClient.invalidateQueries({ queryKey: ["cafe-workbench"] })
      // Empty the basket but keep the table: the next round at T4 is the common case.
      setLines([])
      setPayments([])
      setEditingId(null)
      setError(null)
    },
    onError: (err) => {
      if (err instanceof QueuedSaleError) {
        // Saved locally: the basket is cleared exactly as on success, because the sale is safe.
        setQueuedNotice(true)
        setSettleOpen(false)
        clearDraft()
        setLines([])
        setPayments([])
        setEditingId(null)
        setError(null)
        void queryClient.invalidateQueries({ queryKey: ["cafe-workbench"] })
        return
      }
      setError(getApiErrorMessage(err))
    },
  })

  function startPayment() {
    // Default the first tender to whatever is outstanding, so the common case is one tap.
    setPayments([{ tender: "cash", amount_minor: Math.max(0, totals.total) }])
    setSettleOpen(true)
  }

  /* ------------------------------------------------------------------ guests --- */

  useEffect(() => {
    if (customerPhone.trim().length < 3) {
      setGuestHits([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void api<GuestHit[]>(`/api/v1/cafe/pos/guests?q=${encodeURIComponent(customerPhone.trim())}`)
        .then((rows) => {
          if (!cancelled) setGuestHits(rows ?? [])
        })
        .catch(() => {
          if (!cancelled) setGuestHits([])
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [customerPhone])

  /* ---------------------------------------------------------------- offline --- */

  // Try to push anything queued while the connection was down. Runs on mount (a reload is
  // often how a cashier recovers) and whenever the browser reports it is back online.
  useEffect(() => {
    const flush = () => {
      setQueuedCount(readQueue().length)
      void drain((row) =>
        api(row.path, { method: row.method, json: row.body as Record<string, unknown> }),
      ).then((result) => {
        setQueuedCount(result.remaining)
        if (result.synced > 0) {
          toast.success(t("offline_synced", { count: result.synced }))
          void queryClient.invalidateQueries({ queryKey: ["cafe-workbench"] })
        }
      })
    }

    flush()
    return onReconnect(flush)
    // `t` is stable for a locale; re-running on it would drain twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient])

  // The bootstrap request is already scoped to the chosen branch, so the tables that arrive
  // are exactly the ones a cashier at that counter can seat. Filtering again here would only
  // hide rows the server deliberately included.
  const visibleTables = tables

  /* -------------------------------------------------------------------- view --- */

  return (
    <CafeAdminShell
      title={t("title")}
      description={t("description")}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={cn(cafeSelectClass, "w-auto")}
            value={branchId ?? ""}
            onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : null)}
            aria-label={t("branch")}
          >
            <option value="">{t("branch_all")}</option>
            {(data?.branches ?? []).map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name_fa}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" className={TAP} onClick={reset} disabled={lines.length === 0}>
            <X className="size-4" />
            {t("clear")}
          </Button>
        </div>
      }
    >
      {/* A queued sale is not lost, but the cashier must know it has not reached the API:
          the receipt is not final until it syncs. */}
      {queuedNotice || queuedCount > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm">
          <span>
            {queuedNotice
              ? t("offline_saved")
              : t("offline_pending", { count: queuedCount })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setQueuedCount(readQueue().length)
              void drain((row) =>
                api(row.path, { method: row.method, json: row.body as Record<string, unknown> }),
              ).then((result) => {
                setQueuedCount(result.remaining)
                if (result.synced > 0) {
                  setQueuedNotice(false)
                  toast.success(t("offline_synced", { count: result.synced }))
                }
              })
            }}
          >
            {t("offline_retry")}
          </Button>
        </div>
      ) : null}

      {draftNotice ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <span>{t("draft_found")}</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={restoreDraft}>
              {t("draft_restore")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                clearDraft()
                setDraftNotice(false)
              }}
            >
              {t("draft_discard")}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm">
          {error}
        </div>
      ) : null}

      {saved ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
          <span className="font-medium">{t("saved_order", { number: saved.number })}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingId(saved.id)
              setSaved(null)
            }}
          >
            {t("edit_saved")}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_23rem] xl:grid-cols-[1fr_26rem]">
        {/* ------------------------------------------------------- menu column --- */}
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {FULFILLMENTS.map((value) => {
              const Icon = FULFILLMENT_ICON[value]
              const allowed = data?.fulfillment?.[value] ?? true
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!allowed}
                  onClick={() => {
                    setFulfillment(value)
                    if (value !== "dine_in") setTableCode(null)
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-sm font-medium transition-colors",
                    TAP,
                    fulfillment === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted",
                    !allowed && "cursor-not-allowed opacity-40",
                  )}
                >
                  <Icon className="size-4" />
                  {t(`fulfillment_${value}`)}
                </button>
              )
            })}
          </div>

          {fulfillment === "dine_in" ? (
            <CafeSection title={t("table_title")} description={t("table_description")}>
              {tables.length === 0 ? (
                <CafeEmptyState message={t("table_empty")} />
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                  {visibleTables.map((table) => (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => setTableCode(table.code)}
                      className={cn(
                        "flex flex-col items-center justify-center rounded-lg border px-1 py-2 text-xs font-medium transition-colors",
                        TAP,
                        tableCode === table.code
                          ? "border-primary bg-primary text-primary-foreground"
                          : table.status === "free"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "bg-muted/60 text-muted-foreground",
                      )}
                    >
                      <span className="text-base font-bold">{table.code}</span>
                      {table.label ? <span className="truncate">{table.label}</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </CafeSection>
          ) : null}

          {fulfillment === "delivery" ? (
            <CafeSection title={t("delivery_title")}>
              <div className="space-y-2">
                <Label htmlFor="pos-delivery-address">{t("delivery_address")}</Label>
                <Input
                  id="pos-delivery-address"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className={TAP}
                  placeholder={t("delivery_address_placeholder")}
                />

                {/* Which area, what it charges, and whether the basket clears its minimum.
                    A cashier quoting a delivery fee has to be able to see the rule being
                    applied, not just the resulting number. */}
                {zoneLookupFailed ? (
                  <p className="text-destructive text-xs" role="alert">
                    {t("zone_lookup_failed")}
                  </p>
                ) : zoneQuote === null ? null : zoneQuote.covered ? (
                  <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs">
                    <Badge variant="outline">{zoneQuote.zone_name ?? t("zone_unnamed")}</Badge>
                    <span>
                      {t("zone_fee")}: <MoneyText amount={zoneQuote.fee_minor} />
                    </span>
                    <span>
                      {t("zone_eta")}: {zoneQuote.eta_minutes} {t("minutes_short")}
                    </span>
                    {zoneQuote.minimum_minor > 0 ? (
                      <span className={belowZoneMinimum ? "text-destructive font-medium" : undefined}>
                        {t("zone_minimum")}: <MoneyText amount={zoneQuote.minimum_minor} />
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">{t("zone_uncovered")}</p>
                )}

                {belowZoneMinimum ? (
                  <p className="text-destructive text-xs" role="alert">
                    {t("zone_below_minimum")}
                  </p>
                ) : null}
              </div>
            </CafeSection>
          ) : null}

          <CafeSection
            title={t("menu_title")}
            description={t("menu_description")}
            actions={
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={cn(TAP, "w-44 ps-8")}
                  placeholder={t("search_placeholder")}
                  aria-label={t("search_placeholder")}
                />
              </div>
            }
          >
            {categories.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setCategory("")}
                  className={cn(
                    "rounded-md px-3 py-2 text-xs font-medium",
                    category === "" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {t("all_categories")}
                </button>
                {categories.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setCategory(name)}
                    className={cn(
                      "rounded-md px-3 py-2 text-xs font-medium",
                      category === name ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}

            {boot.isPending ? (
              <p className="text-muted-foreground text-sm">{t("loading")}</p>
            ) : visible.length === 0 ? (
              <CafeEmptyState message={t("menu_empty")} />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {visible.map((product) => {
                  const needsChoice = product.variants.length > 0 || product.modifiers.length > 0
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => {
                        if (needsChoice) setPickProduct(product)
                        else addLine(product, null, [], null)
                      }}
                      className="hover:border-primary/60 hover:bg-muted/50 flex min-h-20 flex-col items-start justify-between gap-1 rounded-lg border p-2 text-start transition-colors"
                    >
                      <span className="line-clamp-2 text-sm font-medium">{product.name}</span>
                      <span className="text-muted-foreground text-xs">
                        <MoneyText amount={product.price_minor ?? 0} />
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </CafeSection>
        </div>

        {/* ------------------------------------------------------- cart column --- */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <CafeSection
            title={t("cart_title")}
            description={
              editingId !== null
                ? t("cart_editing", { id: editingId })
                : tableCode
                  ? t("cart_table", { code: tableCode })
                  : undefined
            }
          >
            {lines.length === 0 ? (
              <CafeEmptyState message={t("cart_empty")} />
            ) : (
              <ul className="space-y-2">
                {lines.map((line) => (
                  <li key={line.key} className="rounded-lg border p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {line.name}
                          {line.variant_name ? <span className="text-muted-foreground"> · {line.variant_name}</span> : null}
                        </p>
                        {line.modifiers.length > 0 ? (
                          <p className="text-muted-foreground truncate text-xs">
                            {line.modifiers.map((m) => m.name).join(" · ")}
                          </p>
                        ) : null}
                        {line.note ? <p className="text-xs text-amber-600 dark:text-amber-400">{line.note}</p> : null}
                      </div>
                      <span className="shrink-0 text-sm tabular-nums">
                        <MoneyText amount={lineTotalMinor(line)} />
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="size-9"
                          aria-label={t("decrease")}
                          onClick={() => setQty(line.key, line.quantity - 1)}
                        >
                          <Minus className="size-4" />
                        </Button>
                        <span className="w-8 text-center text-sm font-medium tabular-nums">{line.quantity}</span>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="size-9"
                          aria-label={t("increase")}
                          onClick={() => setQty(line.key, line.quantity + 1)}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs tabular-nums">
                          <MoneyText amount={lineUnitMinor(line)} />
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="text-destructive size-9"
                          aria-label={t("remove")}
                          onClick={() => setQty(line.key, 0)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Guest */}
            <div className="space-y-2 border-t pt-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="pos-phone" className="text-xs">
                    {t("customer_phone")}
                  </Label>
                  <Input
                    id="pos-phone"
                    inputMode="tel"
                    value={customerPhone}
                    onChange={(e) => {
                      setCustomerPhone(e.target.value)
                      setUserId(null)
                    }}
                    className={TAP}
                    placeholder="09…"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pos-name" className="text-xs">
                    {t("customer_name")}
                  </Label>
                  <Input
                    id="pos-name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className={TAP}
                  />
                </div>
              </div>

              {guestHits.length > 0 && userId === null ? (
                <ul className="space-y-1">
                  {guestHits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        className="hover:bg-muted flex w-full items-center justify-between rounded-md border px-2 py-2 text-start text-xs"
                        onClick={() => {
                          setUserId(hit.id)
                          setCustomerName(hit.name ?? "")
                          setCustomerPhone(hit.phone ?? "")
                          setGuestHits([])
                        }}
                      >
                        <span className="truncate">{hit.name ?? hit.phone ?? hit.email ?? `#${hit.id}`}</span>
                        {hit.points > 0 ? <Badge variant="secondary">{t("points", { count: hit.points })}</Badge> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {userId !== null && data?.loyalty_enabled ? (
                <div className="space-y-1">
                  <Label htmlFor="pos-points" className="text-xs">
                    {t("loyalty_points")}
                  </Label>
                  <Input
                    id="pos-points"
                    type="number"
                    min={0}
                    value={loyaltyPoints}
                    onChange={(e) => {
                      setLoyaltyPoints(Math.max(0, Number(e.target.value) || 0))
                      setDiscountType("loyalty")
                    }}
                    className={TAP}
                  />
                </div>
              ) : null}

              <div className="space-y-1">
                <Label htmlFor="pos-note" className="text-xs">
                  {t("customer_note")}
                </Label>
                <Input
                  id="pos-note"
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  className={TAP}
                />
              </div>
            </div>

            {/* Discount */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs">{t("discount")}</Label>
              <div className="grid grid-cols-5 gap-1">
                {(["none", "percent", "amount", "coupon", "loyalty"] as DiscountType[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDiscountType(value)}
                    className={cn(
                      "rounded-md px-1 py-2 text-[11px] font-medium",
                      discountType === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t(`discount_${value}`)}
                  </button>
                ))}
              </div>

              {discountType === "percent" ? (
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  className={TAP}
                  aria-label={t("discount_percent")}
                />
              ) : null}
              {discountType === "amount" ? (
                <Input
                  type="number"
                  min={0}
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                  className={TAP}
                  aria-label={t("discount_amount")}
                />
              ) : null}
              {discountType === "coupon" ? (
                <>
                  <Input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    className={TAP}
                    aria-label={t("coupon_code")}
                    placeholder={t("coupon_code")}
                  />
                  {serverQuote?.couponError ? (
                    <p className="text-destructive text-xs">{serverQuote.couponError}</p>
                  ) : null}
                </>
              ) : null}
            </div>

            {/* Totals */}
            <div className="space-y-1 border-t pt-3 text-sm">
              <Row label={t("subtotal")} amount={totals.subtotal} />
              {totals.discount > 0 ? <Row label={t("discount")} amount={-totals.discount} /> : null}
              {totals.fees > 0 ? <Row label={t("fees")} amount={totals.fees} /> : null}
              <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
                <span>{t("total")}</span>
                <MoneyText amount={totals.total} />
              </div>
            </div>

            <div className="grid gap-2">
              <Button
                type="button"
                className={cn(TAP, "w-full")}
                disabled={lines.length === 0 || submit.isPending || belowZoneMinimum}
                onClick={startPayment}
              >
                {t("pay_and_save")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn(TAP, "w-full")}
                disabled={lines.length === 0 || submit.isPending || belowZoneMinimum}
                onClick={() => submit.mutate({ settle: false })}
              >
                {editingId !== null ? t("update_open") : t("save_open")}
              </Button>
            </div>
          </CafeSection>
        </div>
      </div>

      {/* ------------------------------------------------------- product modal --- */}
      <ProductDialog
        product={pickProduct}
        onClose={() => setPickProduct(null)}
        onAdd={(variant, mods, note) => {
          if (pickProduct) addLine(pickProduct, variant, mods, note)
          setPickProduct(null)
        }}
      />

      {/* --------------------------------------------------------- settle modal --- */}
      <Dialog open={settleOpen} onOpenChange={setSettleOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("settle_title")}</DialogTitle>
            <DialogDescription>{t("settle_description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm">{t("due")}</span>
              <span className="text-lg font-semibold">
                <MoneyText amount={totals.total} />
              </span>
            </div>

            {payments.map((payment, index) => (
              <div key={index} className="space-y-2 rounded-lg border p-2">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className={cafeSelectClass}
                    value={payment.tender}
                    onChange={(e) =>
                      setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, tender: e.target.value } : p)))
                    }
                    aria-label={t("tender")}
                  >
                    {(data?.tenders ?? ["cash"]).map((tender) => (
                      <option key={tender} value={tender}>
                        {t(`tender_${TENDER_DEFAULT[tender] ?? "other"}`)}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min={0}
                    value={payment.amount_minor}
                    onChange={(e) =>
                      setPayments((prev) =>
                        prev.map((p, i) => (i === index ? { ...p, amount_minor: Math.max(0, Number(e.target.value) || 0) } : p)),
                      )
                    }
                    className={TAP}
                    aria-label={t("amount")}
                  />
                </div>

                {payment.tender === "cash" ? (
                  <Input
                    type="number"
                    min={0}
                    value={payment.received_minor ?? ""}
                    onChange={(e) =>
                      setPayments((prev) =>
                        prev.map((p, i) =>
                          i === index ? { ...p, received_minor: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) } : p,
                        ),
                      )
                    }
                    className={TAP}
                    placeholder={t("received_placeholder")}
                    aria-label={t("received")}
                  />
                ) : null}

                {payments.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive w-full"
                    onClick={() => setPayments((prev) => prev.filter((_, i) => i !== index))}
                  >
                    {t("remove_tender")}
                  </Button>
                ) : null}
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setPayments((prev) => [
                    ...prev,
                    { tender: "cash", amount_minor: Math.max(0, remainingMinor(totals.total, prev)) },
                  ])
                }
              >
                <Plus className="size-4" />
                {t("split_payment")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPayments([{ tender: "cash", amount_minor: totals.total }])}
              >
                {t("pay_full_cash")}
              </Button>
            </div>

            <div className="space-y-1 border-t pt-2 text-sm">
              <div className="flex items-center justify-between">
                <span>{t("remaining")}</span>
                <span className={cn("font-medium tabular-nums", outstanding !== 0 && "text-destructive")}>
                  <MoneyText amount={outstanding} />
                </span>
              </div>
              {changeMinor(payments) > 0 ? (
                <div className="flex items-center justify-between">
                  <span>{t("change")}</span>
                  <span className="font-medium">
                    <MoneyText amount={changeMinor(payments)} />
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center">
            {belowZoneMinimum ? (
              <p className="text-destructive text-xs sm:me-auto" role="alert">
                {t("zone_below_minimum")}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setSettleOpen(false)}>
                {t("cancel")}
              </Button>
              <Button
                type="button"
                disabled={outstanding !== 0 || submit.isPending || belowZoneMinimum}
                onClick={() => submit.mutate({ settle: true })}
              >
                {t("confirm_payment")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CafeAdminShell>
  )
}

function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">
        <MoneyText amount={amount} />
      </span>
    </div>
  )
}

/**
 * Add-ons and variants, chosen in a modal.
 *
 * Required groups are pre-filled with their defaults so the cashier's fastest path — tap the
 * item, tap add — produces a valid line rather than a validation error at the very end.
 */
function ProductDialog({
  product,
  onClose,
  onAdd,
}: {
  product: PosProduct | null
  onClose: () => void
  onAdd: (variant: Variant | null, mods: CartModifier[], note: string | null) => void
}) {
  const t = useTranslations("cafe_admin.pos")
  const [variantId, setVariantId] = useState<number | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [note, setNote] = useState("")

  useEffect(() => {
    if (!product) return
    setVariantId(product.variants[0]?.id ?? null)
    setNote("")
    const defaults: number[] = []
    for (const modifier of product.modifiers) {
      const preselected = modifier.options.filter((option) => option.is_default).map((option) => option.id)
      if (preselected.length > 0) defaults.push(...preselected.slice(0, Math.max(1, modifier.max_select)))
      else if (modifier.is_required && modifier.options.length > 0) defaults.push(modifier.options[0].id)
    }
    setSelected(defaults)
  }, [product])

  if (!product) return null

  const variant = product.variants.find((v) => v.id === variantId) ?? null

  function toggle(modifier: Modifier, optionId: number) {
    setSelected((prev) => {
      const isSelected = prev.includes(optionId)
      const inGroup = prev.filter((id) => modifier.options.some((o) => o.id === id))
      if (isSelected) return prev.filter((id) => id !== optionId)
      // A single-select group replaces rather than accumulates, which is what "pick one"
      // means to a cashier and avoids a validation error after the fact.
      if (modifier.max_select <= 1) return [...prev.filter((id) => !inGroup.includes(id)), optionId]
      if (inGroup.length >= modifier.max_select) return prev
      return [...prev, optionId]
    })
  }

  const chosen: CartModifier[] = []
  for (const modifier of product.modifiers) {
    for (const option of modifier.options) {
      if (!selected.includes(option.id)) continue
      chosen.push({
        option_id: option.id,
        name: option.name,
        price_delta_minor: option.is_addon ? 0 : option.price_minor,
      })
    }
  }

  const unit = (variant?.price_minor ?? product.price_minor ?? 0) + chosen.reduce((s, m) => s + m.price_delta_minor, 0)

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>
            <MoneyText amount={unit} />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {product.variants.length > 0 ? (
            <div className="space-y-2">
              <Label className="text-xs">{t("variant")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {product.variants.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setVariantId(item.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm",
                      TAP,
                      variantId === item.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                    )}
                  >
                    <span className="block truncate">{item.name}</span>
                    <span className="text-muted-foreground text-xs">
                      <MoneyText amount={item.price_minor} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {product.modifiers.map((modifier) => (
            <div key={modifier.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{modifier.name}</Label>
                {modifier.is_required ? <Badge variant="outline">{t("required")}</Badge> : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {modifier.options.map((option) => {
                  const active = selected.includes(option.id)
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggle(modifier, option.id)}
                      className={cn(
                        "flex items-center justify-between gap-1 rounded-lg border px-2 py-2 text-start text-xs",
                        TAP,
                        active ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                      )}
                    >
                      <span className="truncate">{option.name}</span>
                      {option.price_minor > 0 ? (
                        <span className="text-muted-foreground shrink-0">
                          <MoneyText amount={option.price_minor} />
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="space-y-1">
            <Label htmlFor="pos-line-note" className="text-xs">
              {t("line_note")}
            </Label>
            <Input
              id="pos-line-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={TAP}
              placeholder={t("line_note_placeholder")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={() =>
              onAdd(
                variant,
                chosen,
                note.trim() === "" ? null : note.trim(),
              )
            }
          >
            <ChefHat className="size-4" />
            {t("add_to_cart")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
