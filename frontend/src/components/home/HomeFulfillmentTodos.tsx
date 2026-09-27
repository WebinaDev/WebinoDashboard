"use client"

import {
  Box,
  CircleDollarSign,
  Package,
  RotateCcw,
  Send,
  Truck,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import type {
  DashboardFulfillmentAction,
  DashboardFulfillmentItem,
  DashboardOverviewFulfillment,
} from "@/types/dashboardOverview"

type HomeFulfillmentTodosProps = {
  fulfillment?: DashboardOverviewFulfillment
}

const GROUPS: Array<{
  key: keyof DashboardOverviewFulfillment
  action: DashboardFulfillmentAction
  icon: typeof Package
  tone: string
}> = [
  {
    key: "pack",
    action: "pack",
    icon: Package,
    tone: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
  },
  {
    key: "ship",
    action: "ship",
    icon: Truck,
    tone: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  },
  {
    key: "tracking",
    action: "tracking",
    icon: Send,
    tone: "border-cyan-500/30 bg-cyan-500/5 text-cyan-700 dark:text-cyan-300",
  },
  {
    key: "returns",
    action: "return",
    icon: RotateCcw,
    tone: "border-violet-500/30 bg-violet-500/5 text-violet-700 dark:text-violet-300",
  },
  {
    key: "refund",
    action: "refund",
    icon: CircleDollarSign,
    tone: "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300",
  },
]

function itemLabel(
  t: ReturnType<typeof useTranslations<"home">>,
  item: DashboardFulfillmentItem,
): string {
  const number = item.number
  const name = item.customer_name || "—"
  switch (item.action) {
    case "pack":
      return t("fulfillment.pack", { number, name })
    case "ship": {
      const method =
        item.shipping_kind === "courier"
          ? t("fulfillment.shipping.courier")
          : item.shipping_kind === "post"
            ? t("fulfillment.shipping.post")
            : item.shipping_kind === "tipax"
              ? t("fulfillment.shipping.tipax")
              : item.shipping_label || t("fulfillment.shipping.other", { label: "—" })
      return t("fulfillment.ship", { number, method })
    }
    case "tracking":
      return t("fulfillment.tracking", { number })
    case "refund":
      return t("fulfillment.refund_cash", { number, gateway: "" })
    case "return":
      return t("fulfillment.return_requested", {
        number,
        item: item.return_item || "—",
        qty: String(item.return_qty ?? 1),
      })
    default:
      return `#${number} — ${name}`
  }
}

export function HomeFulfillmentTodos({ fulfillment }: HomeFulfillmentTodosProps) {
  const t = useTranslations("home")
  if (!fulfillment) return null

  const total = GROUPS.reduce((sum, g) => sum + (fulfillment[g.key]?.count ?? 0), 0)

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Box className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{t("fulfillment.title")}</h3>
        </div>
        {total > 0 ? (
          <Badge variant="secondary">{total}</Badge>
        ) : null}
      </div>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">{t("fulfillment.empty")}</p>
      ) : (
        <div className="space-y-3">
          {GROUPS.map((group) => {
            const bucket = fulfillment[group.key]
            if (!bucket || bucket.count === 0) return null
            const Icon = group.icon
            return (
              <div key={group.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${group.tone}`}>
                    <Icon className="size-3.5" />
                    {t(`fulfillment.group.${group.key}`)}
                  </div>
                  <Link
                    href={bucket.href}
                    className="text-xs text-primary hover:underline"
                  >
                    {t("fulfillment.view_all")}
                  </Link>
                </div>
                <ul className="space-y-1">
                  {bucket.items.slice(0, 5).map((item) => (
                    <li key={`${group.key}-${item.id}`}>
                      <Link
                        href={item.href}
                        className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                      >
                        {itemLabel(t, item)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
