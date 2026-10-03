"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { ShoppingCart } from "lucide-react"
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { trackAnalyticsEvent } from "@/lib/analytics-track"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatShopPrice, type ShopCurrencyDisplay } from "@/lib/format"
import { toLocaleDigits } from "@/lib/locale"

import type { CafeOrderingStatus } from "../types"

type CartLine = {
  id: number
  quantity: number
  meta?: { unit_minor?: number; selections?: { name_fa?: string; name_en?: string }[] } | null
  product?: { id: number; name: string; price_minor: number; currency: string }
}

type Cart = {
  id?: number
  guest_token?: string | null
  table_number?: string | null
  items?: CartLine[]
}

const TOKEN_KEY = "cafe_guest_token"

function getGuestToken(): string {
  if (typeof window === "undefined") return ""
  let token = localStorage.getItem(TOKEN_KEY)
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "")
    localStorage.setItem(TOKEN_KEY, token)
  }
  return token
}

export function CafeCartDrawer({
  tableNumber,
  branchSlug,
  ordering,
  currency,
  currencyDisplay,
}: {
  tableNumber?: string | null
  branchSlug?: string | null
  ordering?: CafeOrderingStatus | null
  currency?: string
  currencyDisplay?: ShopCurrencyDisplay | null
}) {
  const t = useTranslations("cafe_starter.cart")
  const tMenu = useTranslations("cafe_starter")
  const locale = useLocale()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState("")
  const [phone, setPhone] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const fulfillmentOptions = (["dine_in", "pickup", "delivery"] as const).filter((key) => ordering?.fulfillment?.[key] !== false)
  const [fulfillment, setFulfillment] = useState<(typeof fulfillmentOptions)[number]>("dine_in")

  useEffect(() => {
    setToken(getGuestToken())
  }, [])

  const { data: cart } = useQuery({
    queryKey: ["guest-cart", token, tableNumber, branchSlug],
    enabled: Boolean(token),
    queryFn: () =>
      api<Cart>(`/api/v1/public/cafe/cart?guest_token=${encodeURIComponent(token)}&table=${encodeURIComponent(tableNumber ?? "")}&branch=${encodeURIComponent(branchSlug ?? "")}`),
  })

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
      setOpen(false)
      setError(null)
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const count = cart?.items?.reduce((sum, line) => sum + line.quantity, 0) ?? 0
  const subtotal = cart?.items?.reduce((sum, line) => sum + line.quantity * (line.meta?.unit_minor ?? line.product?.price_minor ?? 0), 0) ?? 0
  const fee = (ordering?.packaging_fee_minor ?? 0) + (fulfillment === "delivery" ? ordering?.delivery_fee_minor ?? 0 : 0)

  function price(amount: number) {
    return toLocaleDigits(formatShopPrice(amount / 10, { ...currencyDisplay, currency: currencyDisplay?.currency || currency || "IRT" }, currency || "IRT"), locale === "fa" ? "fa" : "en")
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="relative">
          <ShoppingCart className="size-4" />
          {count > 0 ? <Badge className="absolute -top-2 -end-2 size-5 justify-center rounded-full p-0 text-xs">{toLocaleDigits(String(count), locale === "fa" ? "fa" : "en")}</Badge> : null}
          <span className="sr-only">{t("title")}</span>
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          {tableNumber ? <p className="text-muted-foreground text-sm">{t("table", { number: tableNumber })}</p> : null}
        </SheetHeader>
        <div className="mt-6 space-y-3">
          {!cart?.items?.length ? (
            <p className="text-muted-foreground text-sm">{t("empty")}</p>
          ) : (
            cart.items.map((line) => (
              <div key={line.id} className="flex justify-between gap-3 text-sm">
                <span>
                  {line.product?.name}
                  {line.meta?.selections?.length ? (
                    <span className="text-muted-foreground block text-xs">
                      {line.meta.selections.map((s) => (locale === "fa" ? s.name_fa : s.name_en) || s.name_fa).join("، ")}
                    </span>
                  ) : null}
                </span>
                <span>×{toLocaleDigits(String(line.quantity), locale === "fa" ? "fa" : "en")}</span>
              </div>
            ))
          )}
          <div className="flex flex-wrap gap-2">
            {fulfillmentOptions.map((key) => (
              <Button key={key} type="button" size="sm" variant={fulfillment === key ? "default" : "outline"} onClick={() => setFulfillment(key)}>
                {tMenu(`fulfillment.${key}`)}
              </Button>
            ))}
          </div>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("phone")} />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("note")} />
          {subtotal > 0 ? <p className="text-sm">{t("subtotal")}: {price(subtotal + fee)}</p> : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <Button className="w-full" disabled={!cart?.items?.length || checkout.isPending || ordering?.accepting_orders === false} onClick={() => {
            trackAnalyticsEvent("checkout_start")
            checkout.mutate()
          }}>
            {ordering?.accepting_orders === false ? tMenu("orders_paused") : t("checkout")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
