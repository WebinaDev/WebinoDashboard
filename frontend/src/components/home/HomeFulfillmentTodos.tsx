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
import { useLocale, useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import { formatNumber, normalizeUiLocale, toLocaleDigits } from "@/lib/locale"
import type {
  DashboardFulfillmentAction,
  DashboardFulfillmentBucket,
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

function shippingMethodLabel(
  t: ReturnType<typeof useTranslations<"home">>,
  item: DashboardFulfillmentItem,
): string {
  const kind = item.shipping_kind || "other"
  if (kind === "courier") return t("fulfillment.shipping.courier")
  if (kind === "post") return t("fulfillment.shipping.post")
  if (kind === "tipax") return t("fulfillment.shipping.tipax")
  const label = (item.shipping_label || "").trim()
  return label
    ? t("fulfillment.shipping.other", { label })
    : t("fulfillment.shipping.post")
}

function itemMessage(
  t: ReturnType<typeof useTranslations<"home">>,
  item: DashboardFulfillmentItem,
  locale: string,
): string {
  const number = toLocaleDigits(item.number || String(item.id), locale)
  const name = item.customer_name || "—"
  switch (item.action) {
    case "pack":
      return t("fulfillment.pack", { number, name })
    case "ship":
      return t("fulfillment.ship", {
        number,
        method: shippingMethodLabel(t, item),
      })
    case "tracking":
      return t("fulfillment.tracking", { number })
    case "return":
      if (item.return_status === "approved") {
        return t("fulfillment.return_approved", {
          number,
          item: item.return_item || "—",
          qty: toLocaleDigits(String(item.return_qty ?? ""), locale),
        })
      }
      return t("fulfillment.return_requested", {
        number,
        item: item.return_item || "—",
        qty: toLocaleDigits(String(item.return_qty ?? 1), locale),
      })
    case "refund":
      if (item.purchase_type === "installment") {
        return t("fulfillment.refund_installment", { number })
      }
      return t("fulfillment.refund_cash", {
        number,
        gateway: item.payment_method_title
          ? t("fulfillment.refund_cash_gateway", {
              gateway: item.payment_method_title,
            })
          : "",
      })
    default:
      return `#${number} — ${name}`
  }
}

function GroupBlock({
  groupKey,
  bucket,
  icon: Icon,
  tone,
  t,
  locale,
}: {
  groupKey: (typeof GROUPS)[number]["key"]
  bucket: DashboardFulfillmentBucket
  icon: (typeof GROUPS)[number]["icon"]
  tone: string
  t: ReturnType<typeof useTranslations<"home">>
  locale: string
}) {
  if (!bucket?.items?.length) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div
          className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-medium ${tone}`}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden />
          {t(`fulfillment.group.${groupKey}`)}
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {formatNumber(bucket.count, locale)}
          </Badge>
        </div>
        {bucket.href ? (
          <Link href={bucket.href} className="text-xs text-primary hover:underline">
            {t("fulfillment.view_all")}
          </Link>
        ) : null}
      </div>
      <ul className="space-y-1.5">
        {bucket.items.map((item) => (
          <li key={`${groupKey}-${item.id}`}>
            <Link
              href={item.href}
              className="block rounded-lg border bg-card px-3 py-2 text-sm leading-relaxed transition-colors hover:bg-muted/60"
            >
              {itemMessage(t, item, locale)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function HomeFulfillmentTodos({ fulfillment }: HomeFulfillmentTodosProps) {
  const t = useTranslations("home")
  const locale = normalizeUiLocale(useLocale())
  if (!fulfillment) return null

  const total =
    (fulfillment.pack?.count ?? 0) +
    (fulfillment.ship?.count ?? 0) +
    (fulfillment.tracking?.count ?? 0) +
    (fulfillment.returns?.count ?? 0) +
    (fulfillment.refund?.count ?? 0)

  const hasItems = GROUPS.some((g) => (fulfillment[g.key]?.items?.length ?? 0) > 0)

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Box className="size-4 text-primary" aria-hidden />
            {t("fulfillment.title")}
          </h3>
          {total > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {formatNumber(total, locale)} {t("sections.fulfillment")}
            </p>
          ) : null}
        </div>
      </div>

      {!hasItems ? (
        <p className="text-sm text-muted-foreground">{t("fulfillment.empty")}</p>
      ) : (
        <div className="space-y-5">
          {GROUPS.map((g) => (
            <GroupBlock
              key={g.key}
              groupKey={g.key}
              bucket={fulfillment[g.key]}
              icon={g.icon}
              tone={g.tone}
              t={t}
              locale={locale}
            />
          ))}
        </div>
      )}
    </div>
  )
}
