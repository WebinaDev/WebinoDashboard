"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useRef } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { formatDisplayDateTime } from "@/lib/format-date"
import { useLocale } from "next-intl"

type KitchenOrder = {
  id: number
  number: string | number
  kitchen_status: string
  fulfillment: string
  table_number?: string | null
  customer_phone?: string | null
  customer_note?: string | null
  total_minor: number
  created_at: string
  items: { id: number; name?: string | null; quantity: number; selections?: { name_fa?: string }[] }[]
}

const FLOW = ["new", "preparing", "ready", "served", "out_for_delivery", "done"] as const

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

export default function KitchenPageClient({ route }: { route: ResolvedAdminRoute }) {
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
      api(`/api/v1/cafe/kitchen-orders/${payload.id}`, { method: "PATCH", json: { kitchen_status: payload.kitchen_status } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cafe-kitchen"] })
    },
  })

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>
      {orders.length === 0 ? <p className="text-muted-foreground text-sm">{t("empty")}</p> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orders.map((order) => (
          <Card key={order.id} className={order.kitchen_status === "new" ? "border-primary" : undefined}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span>#{order.number}</span>
                <Badge>{t(`status.${order.kitchen_status}`)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{t("table")}: {order.table_number || "—"} · {t(`fulfillment.${order.fulfillment}`)}</p>
              <p className="text-muted-foreground">{formatDisplayDateTime(order.created_at, locale)}</p>
              {order.customer_note ? <p>{order.customer_note}</p> : null}
              <ul className="space-y-1">
                {order.items.map((item) => (
                  <li key={item.id}>{item.quantity}× {item.name}{item.selections?.length ? ` (${item.selections.map((s) => s.name_fa).join("، ")})` : ""}</li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1 pt-2">
                {FLOW.map((status) => (
                  <Button key={status} size="sm" variant={order.kitchen_status === status ? "default" : "outline"} onClick={() => update.mutate({ id: order.id, kitchen_status: status })}>
                    {t(`status.${status}`)}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
