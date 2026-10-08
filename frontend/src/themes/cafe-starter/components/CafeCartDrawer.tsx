"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { ShoppingBag } from "lucide-react"
import { useState } from "react"

import { trackAnalyticsEvent } from "@/lib/analytics-track"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import type { ShopCurrencyDisplay } from "@/lib/format"
import { toLocaleDigits } from "@/lib/locale"
import { cn } from "@/lib/utils"

import { useGuestCart } from "../lib/cart"
import { money } from "../lib/helpers"
import type { CafeOrderingStatus } from "../types"
import { CafeSheet } from "./CafeSheet"

export type CartTriggerVariant = "icon" | "bar" | "pill"

export function CafeCartDrawer({
  tableNumber,
  branchSlug,
  ordering,
  currency,
  currencyDisplay,
  variant = "icon",
  skin,
  scheme,
  className,
}: {
  tableNumber?: string | null
  branchSlug?: string | null
  ordering?: CafeOrderingStatus | null
  currency?: string
  currencyDisplay?: ShopCurrencyDisplay | null
  variant?: CartTriggerVariant
  skin?: string
  scheme?: string
  className?: string
}) {
  const t = useTranslations("cafe_starter.cart")
  const tMenu = useTranslations("cafe_starter")
  const locale = useLocale()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const fulfillmentOptions = (["dine_in", "pickup", "delivery"] as const).filter((key) => ordering?.fulfillment?.[key] !== false)
  const [fulfillment, setFulfillment] = useState<(typeof fulfillmentOptions)[number]>(fulfillmentOptions[0] ?? "dine_in")
  const { token, cart, count, subtotal } = useGuestCart(tableNumber, branchSlug)
  const lang = locale === "fa" ? "fa" : "en"

  const checkout = useMutation({
    mutationFn: () =>
      api("/api/v1/public/cafe/checkout", {
        method: "POST",
        json: {
          guest_token: token,
          table_number: tableNumber ?? cart?.table_number,
          branch_slug: branchSlug ?? undefined,
          customer_phone: phone || undefined,
          customer_note: note || undefined,
          fulfillment,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["guest-cart"] })
      setError(null)
      setDone(true)
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const fee = (ordering?.packaging_fee_minor ?? 0) + (fulfillment === "delivery" ? ordering?.delivery_fee_minor ?? 0 : 0)

  function price(amount: number) {
    return money(amount, currency || "IRT", currencyDisplay, lang)
  }

  const countLabel = toLocaleDigits(String(count), lang)

  const trigger =
    variant === "bar" ? (
      <button type="button" className={cn("cafe-cart-bar", count === 0 && "is-empty", className)} aria-label={t("title")}>
        <span className="cafe-cart-bar-count" key={count}>{countLabel}</span>
        <span className="cafe-cart-bar-label">{t("view_cart")}</span>
        <span className="cafe-cart-bar-total">{price(subtotal)}</span>
      </button>
    ) : variant === "pill" ? (
      <button type="button" className={cn("cafe-cart-pill", count === 0 && "is-empty", className)} aria-label={t("title")}>
        <ShoppingBag className="size-4" />
        <span className="cafe-cart-pill-count" key={count}>{countLabel}</span>
        {count > 0 ? <span className="cafe-cart-pill-total">{price(subtotal)}</span> : null}
      </button>
    ) : (
      <button type="button" className={cn("cafe-icon-btn cafe-cart-icon", className)} aria-label={t("title")}>
        <ShoppingBag className="size-4" />
        {count > 0 ? (
          <span className="cafe-cart-badge" key={count}>
            {countLabel}
          </span>
        ) : null}
      </button>
    )

  return (
    <CafeSheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setDone(false)
      }}
      title={t("title")}
      description={tableNumber ? t("table", { number: toLocaleDigits(tableNumber, lang) }) : undefined}
      closeLabel={tMenu("close")}
      placement="side"
      skin={skin}
      scheme={scheme}
      trigger={trigger}
    >
      <div className="cafe-cart-body">
        {done ? (
          <div className="cafe-cart-done">
            <span aria-hidden="true">✓</span>
            <p>{t("order_placed")}</p>
          </div>
        ) : !cart?.items?.length ? (
          <div className="cafe-cart-empty">
            <ShoppingBag className="size-8 opacity-40" />
            <p>{t("empty")}</p>
          </div>
        ) : (
          <ul className="cafe-cart-lines">
            {cart.items.map((line) => (
              <li key={line.id}>
                <div className="min-w-0">
                  <p className="cafe-cart-line-name">{line.product?.name}</p>
                  {line.meta?.selections?.length ? (
                    <p className="cafe-cart-line-meta">
                      {line.meta.selections.map((s) => (locale === "fa" ? s.name_fa : s.name_en) || s.name_fa).join("، ")}
                    </p>
                  ) : null}
                </div>
                <span className="cafe-cart-line-qty">×{toLocaleDigits(String(line.quantity), lang)}</span>
                <span className="cafe-cart-line-price">
                  {price(line.quantity * (line.meta?.unit_minor ?? line.product?.price_minor ?? 0))}
                </span>
              </li>
            ))}
          </ul>
        )}

        {!done && cart?.items?.length ? (
          <>
            {fulfillmentOptions.length > 1 ? (
              <div className="cafe-seg" role="group" aria-label={t("fulfillment")}>
                {fulfillmentOptions.map((key) => (
                  <button key={key} type="button" data-on={fulfillment === key ? "true" : "false"} onClick={() => setFulfillment(key)}>
                    {tMenu(`fulfillment.${key}`)}
                  </button>
                ))}
              </div>
            ) : null}
            <input className="cafe-field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("phone")} aria-label={t("phone")} inputMode="tel" />
            <input className="cafe-field" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("note")} aria-label={t("note")} />
            <dl className="cafe-cart-sum">
              <div>
                <dt>{t("items_total")}</dt>
                <dd>{price(subtotal)}</dd>
              </div>
              {fee > 0 ? (
                <div>
                  <dt>{t("fees")}</dt>
                  <dd>{price(fee)}</dd>
                </div>
              ) : null}
              <div className="is-total">
                <dt>{t("subtotal")}</dt>
                <dd>{price(subtotal + fee)}</dd>
              </div>
            </dl>
            {error ? <p className="cafe-error">{error}</p> : null}
            <button
              type="button"
              className="cafe-primary-btn"
              disabled={checkout.isPending || ordering?.accepting_orders === false}
              onClick={() => {
                trackAnalyticsEvent("checkout_start")
                checkout.mutate()
              }}
            >
              {ordering?.accepting_orders === false ? tMenu("orders_paused") : checkout.isPending ? t("sending") : t("checkout")}
            </button>
          </>
        ) : null}
      </div>
    </CafeSheet>
  )
}
