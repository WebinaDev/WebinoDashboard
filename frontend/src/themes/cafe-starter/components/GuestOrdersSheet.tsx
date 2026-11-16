"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Check, ClipboardList, RotateCcw, ShieldCheck } from "lucide-react"

import { getApiErrorMessage } from "@/lib/api-helpers"
import { toLocaleDigits } from "@/lib/locale"
import { cn } from "@/lib/utils"

import type { ShopCurrencyDisplay } from "@/lib/format"
import { money } from "../lib/helpers"
import {
  trackerStep,
  useGuestOrders,
  useGuestState,
  useReorder,
  type GuestOrder,
} from "../lib/guest"
import { CafeSheet } from "./CafeSheet"
import { OtpSheet } from "./OtpSheet"

const liveStatuses = new Set(["new", "preparing", "ready"])

/**
 * «سفارش‌های من»: live order tracking and one-tap reorder.
 *
 * Rows poll while something is still cooking, then stop; a finished order shows its total
 * and a reorder button that puts the same basket back at today's prices.
 */
export function GuestOrdersSheet({
  open,
  onOpenChange,
  skin,
  scheme,
  locale,
  currency,
  currencyDisplay,
  orderingStatus,
  onCartChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  skin?: string
  scheme?: string
  locale: string
  currency?: string
  currencyDisplay?: ShopCurrencyDisplay | null
  orderingStatus?: string | null
  onCartChanged?: () => void
}) {
  const t = useTranslations("cafe_starter.orders_sheet")
  const tMenu = useTranslations("cafe_starter")
  const state = useGuestState(open)
  const orders = useGuestOrders(open)
  const reorder = useReorder()
  const [otpOpen, setOtpOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const list = useMemo(() => orders.data ?? [], [orders.data])
  const anyLive = useMemo(() => list.some((row) => liveStatuses.has(row.kitchen_status)), [list])

  // Live tracking: refresh while a kitchen ticket is still moving, then rest.
  useEffect(() => {
    if (!open || !anyLive) return
    const id = window.setInterval(() => void orders.refetch(), 12_000)
    return () => window.clearInterval(id)
  }, [open, anyLive, orders])

  useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => setFlash(null), 2600)
    return () => window.clearTimeout(id)
  }, [flash])

  function reorderRow(row: GuestOrder) {
    setError(null)
    reorder.mutate(row.id, {
      onSuccess: (res) => {
        onCartChanged?.()
        setFlash(
          res.skipped.length
            ? t("reorder_partial", { count: toLocaleDigits(String(res.added), locale), skipped: res.skipped.join("، ") })
            : t("reorder_done", { count: toLocaleDigits(String(res.added), locale) }),
        )
      },
      onError: (e) => setError(getApiErrorMessage(e as Error)),
    })
  }

  function price(minor: number) {
    return money(minor, currency || "IRT", currencyDisplay, locale)
  }

  const stepLabels = [t("step_new"), t("step_preparing"), t("step_ready"), t("step_done")]

  return (
    <>
      <CafeSheet
        open={open}
        onOpenChange={onOpenChange}
        title={t("title")}
        description={t("subtitle")}
        closeLabel={tMenu("close")}
        placement="side"
        skin={skin}
        scheme={scheme}
        className="cafe-orders-sheet"
      >
        <div className="cafe-orders-body">
          {!state.data?.verified ? (
            <div className="cafe-orders-verify">
              <ShieldCheck className="size-5" aria-hidden="true" />
              <div className="min-w-0">
                <p className="cafe-orders-verify-title">{t("verify_title")}</p>
                <p className="cafe-hint">{t("verify_hint")}</p>
              </div>
              <button type="button" className="cafe-chip" onClick={() => setOtpOpen(true)}>
                {t("verify_cta")}
              </button>
            </div>
          ) : (
            <p className="cafe-ok-note">{t("verified_as", { phone: toLocaleDigits(state.data.masked ?? "", locale) })}</p>
          )}

          {flash ? <p className="cafe-ok-note">{flash}</p> : null}
          {error ? <p className="cafe-error">{error}</p> : null}

          {orders.isLoading ? (
            <p className="cafe-hint">{t("loading")}</p>
          ) : list.length === 0 ? (
            <div className="cafe-cart-empty">
              <ClipboardList className="size-8 opacity-40" aria-hidden="true" />
              <p>{t("empty")}</p>
            </div>
          ) : (
            <ul className="cafe-orders-list">
              {list.map((row) => {
                const step = trackerStep(row.kitchen_status, row.status)
                const cancelled = step === -1
                return (
                  <li key={row.id} className="cafe-order-card" data-live={liveStatuses.has(row.kitchen_status) ? "true" : "false"}>
                    <header>
                      <div className="min-w-0">
                        <strong>{t("order_number", { number: toLocaleDigits(String(row.number), locale) })}</strong>
                        <p className="cafe-hint">
                          {tMenu(`fulfillment.${row.fulfillment}`)}
                          {row.table_number ? ` · ${tMenu("table_label")} ${toLocaleDigits(row.table_number, locale)}` : ""}
                          {row.delivery_window ? ` · ${row.delivery_window}` : ""}
                        </p>
                      </div>
                      <span className="cafe-order-total">{price(row.total_minor)}</span>
                    </header>

                    {cancelled ? (
                      <p className="cafe-error">{t("cancelled")}</p>
                    ) : (
                      <ol className="cafe-tracker" aria-label={t("progress")}>
                        {stepLabels.map((label, index) => (
                          <li
                            key={label}
                            data-state={index < step ? "done" : index === step ? "now" : "todo"}
                            aria-current={index === step ? "step" : undefined}
                          >
                            <span className="cafe-tracker-dot" aria-hidden="true">
                              {index < step ? <Check className="size-3" /> : null}
                            </span>
                            <span className="cafe-tracker-label">{label}</span>
                          </li>
                        ))}
                      </ol>
                    )}

                    <ul className="cafe-order-items">
                      {row.items.map((item, i) => (
                        <li key={`${row.id}-${i}`}>
                          <span className="min-w-0">
                            {item.name}
                            {item.selections?.length ? (
                              <small> · {item.selections.map((s) => s.name_fa ?? s.name_en).filter(Boolean).join("، ")}</small>
                            ) : null}
                          </span>
                          <span className="cafe-order-qty">×{toLocaleDigits(String(item.quantity), locale)}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      type="button"
                      className={cn("cafe-chip cafe-reorder", reorder.isPending && "is-busy")}
                      disabled={reorder.isPending || orderingStatus === "closed"}
                      onClick={() => reorderRow(row)}
                    >
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                      {t("reorder")}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </CafeSheet>

      <OtpSheet
        open={otpOpen}
        onOpenChange={setOtpOpen}
        phone={state.data?.phone ?? ""}
        onVerified={() => void orders.refetch()}
        skin={skin}
        scheme={scheme}
        locale={locale}
      />
    </>
  )
}
