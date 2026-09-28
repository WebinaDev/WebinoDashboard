"use client"

import type { ReactNode } from "react"
import { useTranslations } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { ChangePctBadge } from "@/components/home/ChangePctBadge"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { pctDelta } from "@/lib/pctDelta"

import { useReportFormat } from "./format"
import type { ReportSummary } from "./types"

type KpiDef = {
  key: keyof ReportSummary
  label: string
  kind: "money" | "int" | "pct"
}

const KPIS: KpiDef[] = [
  { key: "revenue", label: "kpi.revenue", kind: "money" },
  { key: "net_revenue", label: "kpi.netRevenue", kind: "money" },
  { key: "cogs", label: "kpi.cogs", kind: "money" },
  { key: "gross_profit", label: "kpi.grossProfit", kind: "money" },
  { key: "gross_margin_pct", label: "kpi.grossMargin", kind: "pct" },
  { key: "order_count", label: "kpi.orders", kind: "int" },
  { key: "avg_order_value", label: "kpi.aov", kind: "money" },
  { key: "items_sold", label: "kpi.itemsSold", kind: "int" },
  { key: "items_missing_cost", label: "kpi.missingCost", kind: "int" },
  { key: "discount_total", label: "kpi.discounts", kind: "money" },
  { key: "shipping_total", label: "kpi.shipping", kind: "money" },
  { key: "tax_total", label: "kpi.tax", kind: "money" },
  { key: "refunds", label: "kpi.refunds", kind: "money" },
  { key: "refund_count", label: "kpi.refundCount", kind: "int" },
]

export function KpiCard({ label, value, extra }: { label: ReactNode; value: ReactNode; extra?: ReactNode }) {
  return (
    <Card variant="stat" className="overflow-hidden">
      <CardContent className="space-y-1 pt-4">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-lg font-semibold tracking-tight sm:text-xl">{value}</div>
          {extra}
        </div>
      </CardContent>
    </Card>
  )
}

export function WfcpHint({ enabled }: { enabled: boolean }) {
  const t = useTranslations("reports")
  if (enabled) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">{t("wfcpDisabledHint")}</Badge>
      <p className="text-muted-foreground text-xs">{t("cogsApproxHint")}</p>
    </div>
  )
}

export function ReportKpiGrid({
  summary,
  compareSummary,
  currency,
}: {
  summary: ReportSummary
  compareSummary?: ReportSummary
  currency?: string
}) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()

  return (
    <div className="space-y-3">
      <WfcpHint enabled={Boolean(summary.wfcp_enabled)} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-7">
        {KPIS.map((kpi) => {
          const value = Number(summary[kpi.key] ?? 0)
          const prev = compareSummary ? Number(compareSummary[kpi.key] ?? 0) : undefined
          return (
            <KpiCard
              key={kpi.key}
              label={t(kpi.label as never)}
              value={
                kpi.kind === "money" ? (
                  <MoneyDisplay amount={value} currency={currency} />
                ) : kpi.kind === "pct" ? (
                  fmt.pct(value)
                ) : (
                  fmt.num(value)
                )
              }
              extra={compareSummary ? <ChangePctBadge value={pctDelta(value, prev)} /> : null}
            />
          )
        })}
      </div>
    </div>
  )
}
