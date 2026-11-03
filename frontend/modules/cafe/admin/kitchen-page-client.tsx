"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toLocaleDigits } from "@/lib/locale"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatDisplayDateTime } from "@/lib/format-date"

import { CafeAdminShell, CafeEmptyState, cafeSelectClass } from "./cafe-admin-ui"

type KitchenOrder = {
  id: number
  number: string | number
  kitchen_status: string
  fulfillment: string
  table_number?: string | null
  customer_phone?: string | null
  status?: string
  customer_name?: string | null
  shipping_address?: string | null
  delivery?: { lat?: number | null; lng?: number | null } | null
  pickup_at?: string | null
  payment_method?: string | null
  customer_note?: string | null
  total_minor: number
  created_at: string
  items: { id: number; name?: string | null; quantity: number; selections?: { name_fa?: string; name_en?: string }[] }[]
}

const FLOW = ["new", "preparing", "ready", "served", "out_for_delivery", "done"] as const

function nextStatus(current: string): string | null {
  const idx = FLOW.indexOf(current as (typeof FLOW)[number])
  if (idx < 0 || idx >= FLOW.length - 1) return null
  return FLOW[idx + 1]
}

function beep() {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = 880
  gain.gain.value = 0.05
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.18)
}

export default function KitchenPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.kitchen")
  const locale = useLocale()
  const queryClient = useQueryClient()
  const seen = useRef<Set<number>>(new Set())
  const primed = useRef(false)

  const { data: orders = [] } = useQuery({
    queryKey: ["cafe-kitchen"],
    queryFn: () => api<KitchenOrder[]>("/api/v1/cafe/kitchen-orders"),
    refetchInterval: 8000,
  })

  useEffect(() => {
    const ids = new Set(orders.map((o) => o.id))
    if (primed.current) {
      for (const order of orders) {
        if (!seen.current.has(order.id) && order.kitchen_status === "new") beep()
      }
    }
    seen.current = ids
    primed.current = true
  }, [orders])

  const update = useMutation({
    mutationFn: (payload: { id: number; kitchen_status: string }) =>
      api(`/api/v1/cafe/kitchen-orders/${payload.id}`, {
        method: "PATCH",
        json: { kitchen_status: payload.kitchen_status },
      }),
    onSuccess: async (_data, variables) => {
      toast.success(t("status_updated", { status: t(`status.${variables.kitchen_status}`) }))
      await queryClient.invalidateQueries({ queryKey: ["cafe-kitchen"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      {orders.length === 0 ? (
        <CafeEmptyState message={`${t("empty")} — ${t("empty_hint")}`} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => {
            const advanceTo = nextStatus(order.kitchen_status)
            return (
              <article
                key={order.id}
                className={`rounded-xl border p-4 ${order.kitchen_status === "new" ? "border-primary" : ""}`}
              >
                <header className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold">#{toLocaleDigits(String(order.number), locale)}</p>
                    <p className="text-muted-foreground text-xs">
                      {t(`fulfillment.${order.fulfillment}`)}
                      {order.fulfillment === "dine_in"
                        ? ` · ${t("table")}: ${order.table_number ? toLocaleDigits(order.table_number, locale) : t("none")}`
                        : ""}
                    </p>
                  </div>
                  <Badge variant={order.kitchen_status === "new" ? "default" : "secondary"}>
                    {t(`status.${order.kitchen_status}`)}
                  </Badge>
                </header>

                <div className="space-y-1.5 text-sm">
                  <p className="text-muted-foreground text-xs">
                    {t(order.status === "paid" ? "paid_online" : "pay_on_site")}
                  </p>
                  {order.customer_name || order.customer_phone ? (
                    <p>
                      {order.customer_name ?? ""}{" "}
                      {order.customer_phone ? (
                        <a dir="ltr" href={`tel:${order.customer_phone}`}>
                          {toLocaleDigits(order.customer_phone, locale)}
                        </a>
                      ) : null}
                    </p>
                  ) : null}
                  {order.pickup_at ? (
                    <p>
                      {t("pickup_at")}: {formatDisplayDateTime(order.pickup_at, locale)}
                    </p>
                  ) : null}
                  {order.fulfillment === "delivery" ? (
                    <p>
                      {order.shipping_address || t("none")}
                      {order.delivery?.lat != null && order.delivery?.lng != null ? (
                        <>
                          {" "}
                          <a
                            className="text-primary underline"
                            target="_blank"
                            rel="noreferrer"
                            href={`https://www.openstreetmap.org/?mlat=${order.delivery.lat}&mlon=${order.delivery.lng}#map=18/${order.delivery.lat}/${order.delivery.lng}`}
                          >
                            {t("open_map")}
                          </a>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground text-xs">{formatDisplayDateTime(order.created_at, locale)}</p>
                  {order.customer_note ? <p className="rounded-md bg-muted/40 px-2 py-1 text-xs">{order.customer_note}</p> : null}
                  <ul className="space-y-1 border-t pt-2">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        {toLocaleDigits(String(item.quantity), locale)}× {item.name}
                        {item.selections?.length
                          ? ` (${item.selections.map((s) => (locale === "fa" ? s.name_fa : s.name_en || s.name_fa)).join("، ")})`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                  {advanceTo ? (
                    <Button
                      size="sm"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: order.id, kitchen_status: advanceTo })}
                    >
                      {t("advance")}: {t(`status.${advanceTo}`)}
                    </Button>
                  ) : null}
                  <select
                    className={`${cafeSelectClass} h-8 w-auto min-w-[8rem]`}
                    aria-label={t("set_status")}
                    value={order.kitchen_status}
                    disabled={update.isPending}
                    onChange={(e) => update.mutate({ id: order.id, kitchen_status: e.target.value })}
                  >
                    {FLOW.map((status) => (
                      <option key={status} value={status}>
                        {t(`status.${status}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </CafeAdminShell>
  )
}
