"use client"

import { GitBranch } from "lucide-react"
import { useTranslations } from "next-intl"

type NodeProps = {
  label: string
  color: string
  ring?: string
  small?: boolean
}

function FlowNode({ label, color, ring, small }: NodeProps) {
  return (
    <div
      className={`relative rounded-xl border px-3 py-2 text-center font-medium shadow-sm ${small ? "text-[11px]" : "text-xs"} ${color} ${ring ?? ""}`}
    >
      {label}
    </div>
  )
}

function Connector({ tall }: { tall?: boolean }) {
  return (
    <div className="flex justify-center" aria-hidden>
      <div className={`w-0.5 bg-border ${tall ? "h-6" : "h-4"}`} />
    </div>
  )
}

function BranchLine() {
  return (
    <div className="relative mx-auto h-4 w-full max-w-md" aria-hidden>
      <div className="absolute start-1/2 top-0 h-4 w-0.5 -translate-x-1/2 bg-border rtl:translate-x-1/2" />
      <div className="absolute top-0 h-0.5 w-[72%] bg-border start-[14%]" />
      <div className="absolute top-0 h-2 w-0.5 bg-border start-[14%]" />
      <div className="absolute start-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-border rtl:translate-x-1/2" />
      <div className="absolute end-[14%] top-0 h-2 w-0.5 bg-border" />
    </div>
  )
}

export function HomeOrderWorkflow() {
  const t = useTranslations("home")

  return (
    <div className="h-full rounded-2xl border bg-gradient-to-b from-muted/30 to-card p-4 shadow-sm sm:p-5">
      <div className="mb-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <GitBranch className="size-4 text-primary" aria-hidden />
          {t("fulfillment.workflow.title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("fulfillment.workflow.subtitle")}
        </p>
      </div>

      <div className="mx-auto max-w-sm space-y-0">
        <FlowNode
          label={t("fulfillment.workflow.pending")}
          color="border-slate-300/60 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200"
        />
        <Connector />
        <FlowNode
          label={t("fulfillment.workflow.processing")}
          color="border-amber-400/50 bg-amber-100/80 text-amber-900 dark:border-amber-600/40 dark:bg-amber-950/40 dark:text-amber-100"
        />
        <Connector />
        <FlowNode
          label={t("fulfillment.workflow.warehouse")}
          color="border-blue-400/50 bg-blue-100/80 text-blue-900 dark:border-blue-600/40 dark:bg-blue-950/40 dark:text-blue-100"
        />
        <Connector />
        <FlowNode
          label={t("fulfillment.workflow.pack")}
          color="border-violet-400/50 bg-violet-100/80 text-violet-900 dark:border-violet-600/40 dark:bg-violet-950/40 dark:text-violet-100"
        />
        <Connector />
        <p className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("fulfillment.workflow.ship_branch")}
        </p>
        <BranchLine />
        <div className="grid grid-cols-3 gap-2 pt-1">
          <FlowNode
            small
            label={t("fulfillment.workflow.courier")}
            color="border-emerald-400/50 bg-emerald-100/80 text-emerald-900 dark:border-emerald-600/40 dark:bg-emerald-950/40 dark:text-emerald-100"
          />
          <FlowNode
            small
            label={t("fulfillment.workflow.post")}
            color="border-emerald-400/50 bg-emerald-100/80 text-emerald-900 dark:border-emerald-600/40 dark:bg-emerald-950/40 dark:text-emerald-100"
          />
          <FlowNode
            small
            label={t("fulfillment.workflow.tipax")}
            color="border-emerald-400/50 bg-emerald-100/80 text-emerald-900 dark:border-emerald-600/40 dark:bg-emerald-950/40 dark:text-emerald-100"
          />
        </div>
        <Connector tall />
        <FlowNode
          label={t("fulfillment.workflow.completed")}
          color="border-teal-400/50 bg-teal-100/80 text-teal-900 dark:border-teal-600/40 dark:bg-teal-950/40 dark:text-teal-100"
        />
        <Connector />
        <FlowNode
          label={t("fulfillment.workflow.tracking")}
          color="border-cyan-400/50 bg-cyan-100/80 text-cyan-900 dark:border-cyan-600/40 dark:bg-cyan-950/40 dark:text-cyan-100"
          ring="ring-1 ring-cyan-400/20"
        />

        <div className="relative mt-6 rounded-xl border border-dashed border-rose-300/60 bg-rose-50/50 p-3 dark:border-rose-800/50 dark:bg-rose-950/20">
          <p className="mb-2 text-center text-[11px] font-semibold text-rose-700 dark:text-rose-300">
            {t("fulfillment.workflow.cancelled")}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <FlowNode
              small
              label={t("fulfillment.workflow.refund_installment")}
              color="border-rose-300/50 bg-white/80 text-rose-800 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-200"
            />
            <FlowNode
              small
              label={t("fulfillment.workflow.refund_cash")}
              color="border-rose-300/50 bg-white/80 text-rose-800 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-200"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
