"use client"

import { useTranslations } from "next-intl"

const STEPS = [
  "pending",
  "processing",
  "warehouse",
  "pack",
  "ship_branch",
  "completed",
] as const

export function HomeOrderWorkflow() {
  const t = useTranslations("home")

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold">{t("fulfillment.workflow.title")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("fulfillment.workflow.subtitle")}
        </p>
      </div>
      <ol className="space-y-2">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
              {i + 1}
            </span>
            <span>
              {t(
                step === "ship_branch"
                  ? "fulfillment.workflow.ship_branch"
                  : (`fulfillment.workflow.${step}` as
                      | "fulfillment.workflow.pending"
                      | "fulfillment.workflow.processing"
                      | "fulfillment.workflow.warehouse"
                      | "fulfillment.workflow.pack"
                      | "fulfillment.workflow.completed"),
              )}
            </span>
          </li>
        ))}
      </ol>
      <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
        <p>{t("fulfillment.workflow.tracking")}</p>
        <p>{t("fulfillment.workflow.refund_cash")}</p>
        <p>{t("fulfillment.workflow.refund_installment")}</p>
      </div>
    </div>
  )
}
