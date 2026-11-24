"use client"

import { useMutation } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"

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
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { toLocaleDigits } from "@/lib/locale"
import { MoneyText } from "@/components/currency/MoneyDisplay"
import { cn } from "@/lib/utils"

import { cafeSelectClass } from "./cafe-admin-ui"

type Tender = { tender: string; amount_minor: number; received_minor: number; reference: string }

const TENDERS = ["cash", "card_to_card", "pos_terminal", "online", "wallet", "other"] as const

/** Cash tenders need a "received" figure so the change can be worked out at the counter. */
const NEEDS_RECEIVED = new Set(["cash"])

/**
 * Settle one order from anywhere — the workbench, the floor, a ticket that is finished.
 *
 * The till has its own settle step inside the cart, but an order whose kitchen work is done
 * used to be settleable only by going back to the POS and rebuilding it. This dialog takes the
 * order as it stands and writes tenders against it.
 *
 * Split payments are first-class: add a second tender when the guest pays part cash and part
 * card, exactly as at the counter.
 */
export function SettleDialog({
  open,
  onOpenChange,
  orderId,
  orderLabel,
  totalMinor,
  onSettled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: number | null
  orderLabel: string
  totalMinor: number
  onSettled?: () => void
}) {
  // Labels already exist on the POS screen; reuse them rather than adding a parallel set.
  const t = useTranslations("cafe_admin.pos")
  const tCommon = useTranslations("common")

  const [tenders, setTenders] = useState<Tender[]>([
    { tender: "cash", amount_minor: totalMinor, received_minor: totalMinor, reference: "" },
  ])

  const remaining = useMemo(
    () => totalMinor - tenders.reduce((sum, row) => sum + (Number(row.amount_minor) || 0), 0),
    [tenders, totalMinor],
  )

  const change = useMemo(() => {
    const cash = tenders.filter((row) => NEEDS_RECEIVED.has(row.tender))
    const received = cash.reduce((sum, row) => sum + (Number(row.received_minor) || 0), 0)
    const due = cash.reduce((sum, row) => sum + (Number(row.amount_minor) || 0), 0)
    return Math.max(0, received - due)
  }, [tenders])

  const settle = useMutation({
    mutationFn: () =>
      api(`/api/v1/cafe/orders/${orderId}/settle`, {
        method: "POST",
        json: {
          payments: tenders
            .filter((row) => Number(row.amount_minor) > 0)
            .map((row) => ({
              tender: row.tender,
              amount_minor: Number(row.amount_minor),
              received_minor: NEEDS_RECEIVED.has(row.tender) ? Number(row.received_minor) : null,
              reference: row.reference.trim() || null,
            })),
        },
      }),
    onSuccess: () => {
      toast.success(t("settled_ok"))
      onOpenChange(false)
      onSettled?.()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const patch = (index: number, next: Partial<Tender>) =>
    setTenders((rows) => rows.map((row, i) => (i === index ? { ...row, ...next } : row)))

  const addTender = () =>
    setTenders((rows) => [
      ...rows,
      { tender: "pos_terminal", amount_minor: Math.max(0, remaining), received_minor: 0, reference: "" },
    ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("settle_title")} — {orderLabel}
          </DialogTitle>
          <DialogDescription>{t("settle_description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span>{t("total_due")}</span>
            <span className="font-mono font-semibold">
              <MoneyText amount={totalMinor} />
            </span>
          </div>

          {tenders.map((row, index) => (
            <div key={index} className="space-y-2 rounded-md border p-2">
              <div className="flex items-center gap-2">
                <select
                  className={cn(cafeSelectClass, "h-9 flex-1")}
                  value={row.tender}
                  aria-label={t("tender")}
                  onChange={(e) => patch(index, { tender: e.target.value })}
                >
                  {TENDERS.map((tender) => (
                    <option key={tender} value={tender}>
                      {t(`tender_${tender}`)}
                    </option>
                  ))}
                </select>
                {tenders.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setTenders((rows) => rows.filter((_, i) => i !== index))}
                  >
                    ×
                  </Button>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("amount")}</Label>
                  <Input
                    inputMode="numeric"
                    value={String(row.amount_minor)}
                    onChange={(e) => patch(index, { amount_minor: Number(e.target.value.replace(/\D/g, "") || 0) })}
                  />
                </div>
                {NEEDS_RECEIVED.has(row.tender) ? (
                  <div className="space-y-1">
                    <Label className="text-xs">{t("received")}</Label>
                    <Input
                      inputMode="numeric"
                      value={String(row.received_minor)}
                      onChange={(e) =>
                        patch(index, { received_minor: Number(e.target.value.replace(/\D/g, "") || 0) })
                      }
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-xs">{t("reference")}</Label>
                    <Input
                      value={row.reference}
                      onChange={(e) => patch(index, { reference: e.target.value })}
                      placeholder={t("reference_hint")}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between text-sm">
            <Button type="button" size="sm" variant="outline" onClick={addTender}>
              + {t("add_tender")}
            </Button>
            <span className={remaining === 0 ? "text-muted-foreground" : "text-destructive"}>
              {remaining === 0
                ? t("fully_covered")
                : t("remaining", { amount: toLocaleDigits(String(remaining), "fa") })}
            </span>
          </div>

          {change > 0 ? (
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
              <span>{t("change_due")}</span>
              <span className="font-mono font-semibold">
                <MoneyText amount={change} />
              </span>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            type="button"
            // Under-paid is refused by the server anyway; disable it so the error is not the
            // way the cashier finds out.
            disabled={remaining !== 0 || settle.isPending || totalMinor <= 0}
            onClick={() => void settle.mutateAsync()}
          >
            {t("settle_confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
