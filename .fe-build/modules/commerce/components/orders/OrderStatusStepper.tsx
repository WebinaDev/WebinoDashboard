"use client"

import { Truck } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ORDER_STATUS_PIPELINE, orderStatusEnumKey, type OrderStatus } from "../../lib/order-statuses"
import { useEnumLabel } from "@/lib/enum-labels"

export function OrderStatusStepper({
  status,
  nextStatuses = [],
  onSelect,
  onShip,
  disabled,
}: {
  status: string
  nextStatuses?: string[]
  onSelect?: (status: string) => void
  onShip?: () => void
  disabled?: boolean
}) {
  const t = useTranslations("orders_admin")
  const enumLabel = useEnumLabel()
  const currentIdx = ORDER_STATUS_PIPELINE.indexOf(status as OrderStatus)

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{t("status")}</p>
      <div className="flex flex-wrap items-center gap-2">
        {ORDER_STATUS_PIPELINE.map((step, i) => {
          const done = currentIdx >= 0 && i <= currentIdx
          const isCurrent = step === status
          return (
            <div key={step} className="flex items-center gap-2">
              {i > 0 ? <span className="text-muted-foreground text-xs">→</span> : null}
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  isCurrent && "border-primary bg-primary/10 font-semibold",
                  done && !isCurrent && "border-emerald-500/40 bg-emerald-500/10",
                  !done && !isCurrent && "text-muted-foreground",
                )}
              >
                {enumLabel("order_status", orderStatusEnumKey(step))}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {nextStatuses.length > 0 && onSelect
          ? nextStatuses.map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => onSelect(s)}
              >
                {enumLabel("order_status", orderStatusEnumKey(s))}
              </Button>
            ))
          : null}
        {onShip ? (
          <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={onShip}>
            <Truck className="size-3.5" />
            {t("ship_order")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
