"use client"

import { useQuery } from "@tanstack/react-query"
import { BadgeCheck, Check, Clock, Package, Truck } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { localizeNumber } from "@/lib/digits"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/format-date"
import { cn } from "@/lib/utils"

type FinanceRow = { title?: string; amount?: number | null; state?: string }
type FinanceBlock = { key?: string; title?: string; total?: number | null; rows?: FinanceRow[] }
type Item = { title?: string; quantity?: number; id?: string; amount?: number | null }

export type BasalamOrderView = {
  woo_status?: string
  local_status?: string
  status_title?: string
  status_key?: string | null
  notice?: string
  status_id?: number
  code?: string
  hash_id?: string
  created_at?: string | null
  confirmed_at?: string | null
  shipped_at?: string | null
  delivery_estimate?: { from?: string | null; to?: string | null; text?: string }
  shipping_method?: string
  tracking_code?: string
  coupon?: string
  purchase_count?: number
  recipient?: {
    name?: string
    phone?: string
    province?: string
    city?: string
    address?: string
    postcode?: string
  }
  items?: Item[]
  finance?: FinanceBlock[]
  currency?: string
}

const PIPELINE = [
  { key: "step_wait", ids: [3739], icon: Clock },
  { key: "step_prep", ids: [3237], icon: Package },
  { key: "step_ship", ids: [3238], icon: Truck },
  { key: "step_done", ids: [3195], icon: BadgeCheck },
] as const

function estimateLabel(
  estimate: BasalamOrderView["delivery_estimate"],
  locale: string,
): string {
  if (!estimate) return ""
  if (estimate.text) return estimate.text
  const from = estimate.from ? formatDisplayDate(estimate.from, locale, "") : ""
  const to = estimate.to ? formatDisplayDate(estimate.to, locale, "") : ""
  if (from && to) return `${from} – ${to}`
  return from || to || ""
}

/** Rich Basalam invoice panel for the order detail screen (WP BasalamOrderPanel parity). */
export function BasalamOrderPanel({ orderId }: { orderId: number }) {
  const t = useTranslations("marketplace_admin.basalam")
  const locale = useLocale()

  const q = useQuery({
    queryKey: ["basalam", "order-view", orderId],
    queryFn: () => api<BasalamOrderView>(`/api/v1/marketplace/basalam/orders/${orderId}/view`),
    retry: false,
  })

  const view = q.data
  const currency = view?.currency || "IRT"
  const recipient = view?.recipient
  const addressLine = [recipient?.province, recipient?.city, recipient?.address].filter(Boolean).join(" - ")

  return (
    <Card className="border-emerald-600/30 bg-emerald-600/5 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">{t("order_banner")}</CardTitle>
          {view?.status_title ? <Badge variant="secondary">{view.status_title}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {q.isLoading ? <p className="text-muted-foreground text-sm">{t("order_view_loading")}</p> : null}
        {q.isError ? <p className="text-destructive text-sm">{getApiErrorMessage(q.error) || t("order_view_error")}</p> : null}

        {view ? (
          <>
            {view.notice ? <p className="text-sm leading-relaxed">{view.notice}</p> : null}
            <p className="text-muted-foreground text-sm leading-relaxed">{t("satisfaction_hint")}</p>
            <BasalamStatusRail statusId={view.status_id} localStatus={view.local_status || view.woo_status} t={t} />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Fact label={t("order_code")} value={view.code ? localizeNumber(view.code, locale) : ""} />
              <Fact label={t("invoice")} value={view.hash_id || view.code || ""} />
              <Fact
                label={t("placed_at")}
                value={view.created_at ? formatDisplayDateTime(view.created_at, locale) : ""}
              />
              <Fact
                label={t("confirmed_at")}
                value={view.confirmed_at ? formatDisplayDate(view.confirmed_at, locale) : ""}
              />
              <Fact
                label={t("shipped_at")}
                value={view.shipped_at ? formatDisplayDate(view.shipped_at, locale) : ""}
              />
              <Fact label={t("delivery_estimate")} value={estimateLabel(view.delivery_estimate, locale)} />
              <Fact label={t("shipping_method")} value={view.shipping_method || ""} />
              <Fact
                label={t("tracking")}
                value={view.tracking_code ? localizeNumber(view.tracking_code, locale) : ""}
              />
              <Fact label={t("coupon")} value={view.coupon || ""} />
            </div>

            {view.items && view.items.length > 0 ? (
              <ul className="space-y-2">
                {view.items.map((item, i) => (
                  <li
                    key={`${item.id}-${i}`}
                    className="bg-background/80 flex flex-wrap items-baseline justify-between gap-2 rounded-lg border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {t("item_qty", { count: localizeNumber(String(item.quantity ?? 1), locale) })}
                        {item.id ? ` · ${t("item_id", { id: localizeNumber(item.id, locale) })}` : ""}
                      </p>
                    </div>
                    {typeof item.amount === "number" ? (
                      <MoneyDisplay amount={item.amount} currency={currency} />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {recipient?.name || addressLine ? (
              <div className="bg-background/80 space-y-1 rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {t("recipient")}: {recipient?.name}
                </p>
                {recipient?.phone ? <p>{localizeNumber(recipient.phone, locale)}</p> : null}
                {addressLine ? <p className="leading-relaxed">{addressLine}</p> : null}
                {recipient?.postcode ? (
                  <p>
                    {t("postcode")}: {localizeNumber(recipient.postcode, locale)}
                  </p>
                ) : null}
                {view.purchase_count ? (
                  <p className="text-muted-foreground text-xs">
                    {t("purchase_count", { count: localizeNumber(String(view.purchase_count), locale) })}
                  </p>
                ) : null}
              </div>
            ) : null}

            {view.finance && view.finance.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {view.finance.map((block) => (
                  <div key={block.key || block.title} className="bg-background/80 rounded-lg border p-3 text-sm">
                    <p className="mb-2 font-medium">{block.title}</p>
                    <ul className="space-y-1">
                      {(block.rows ?? []).map((row, i) => (
                        <li key={`${row.title}-${i}`} className="flex items-baseline justify-between gap-2">
                          <span className="text-muted-foreground">{row.title}</span>
                          {block.key === "balance" && row.state ? (
                            <span>{row.state}</span>
                          ) : typeof row.amount === "number" ? (
                            <MoneyDisplay amount={row.amount} currency={currency} />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {typeof block.total === "number" ? (
                      <p className="mt-2 flex items-baseline justify-between border-t pt-2 font-medium">
                        <span>{t("finance_total")}</span>
                        <MoneyDisplay amount={block.total} currency={currency} />
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

function BasalamStatusRail({
  statusId,
  localStatus,
  t,
}: {
  statusId?: number
  localStatus?: string
  t: ReturnType<typeof useTranslations>
}) {
  const rejected =
    statusId === 3067 ||
    statusId === 3233 ||
    localStatus === "cancelled" ||
    localStatus === "bslm-rejected" ||
    (typeof localStatus === "string" && localStatus.includes("rejected"))
  const fromId = PIPELINE.findIndex((step) => (step.ids as readonly number[]).includes(statusId ?? 0))
  const fromLocal = ["on_hold", "processing", "shipped", "completed"].indexOf(localStatus ?? "")
  const fromBslm = ["bslm-wait-vendor", "bslm-preparation", "bslm-shipping", "bslm-completed"].indexOf(localStatus ?? "")
  const active = fromId >= 0 ? fromId : fromBslm >= 0 ? fromBslm : fromLocal
  if (rejected) {
    return <p className="text-destructive text-sm font-medium">{t("step_rejected")}</p>
  }
  if (active < 0) return null
  return (
    <ol className="flex flex-wrap items-center gap-1">
      {PIPELINE.map((step, idx) => {
        const done = active > idx
        const current = active === idx
        const Icon = step.icon
        return (
          <li key={step.key} className="flex items-center">
            {idx > 0 ? (
              <span className={cn("mx-1 hidden h-px w-6 sm:block", done || current ? "bg-primary" : "bg-border")} aria-hidden />
            ) : null}
            <span className="inline-flex max-w-[7.5rem] flex-col items-center gap-1 px-1.5 py-1 text-center sm:max-w-none sm:px-2">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border",
                  done && "border-primary bg-primary text-primary-foreground",
                  current && !done && "border-primary text-primary",
                  !done && !current && "border-muted-foreground/30 text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
              </span>
              <span className={cn("text-[10px] leading-tight sm:text-xs", current || done ? "text-foreground font-medium" : "text-muted-foreground")}>
                {t(step.key)}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="break-all text-sm">{value}</p>
    </div>
  )
}
