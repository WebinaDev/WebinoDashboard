"use client"

import { useTranslations } from "next-intl"
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { ChangePctBadge } from "@/components/home/ChangePctBadge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { formatNumber } from "@/lib/locale"

import type { AnalyticsRange } from "../AnalyticsPeriodFilter"
import {
  AnalyticsPanelHeader,
  AnalyticsQueryGate,
  DataTable,
  KpiCard,
  KpiGrid,
  fmtInt,
  fmtPct,
  useAnalyticsLocale,
} from "../analytics-ui"
import type { CommerceData, FunnelStep } from "../types"
import { useAnalyticsQuery } from "../use-analytics-query"

const FUNNEL_STEPS: FunnelStep[] = ["visitors", "product_views", "add_to_cart", "checkout", "orders"]

function FunnelCard({ funnel }: { funnel: CommerceData["funnel"] }) {
  const t = useTranslations("analytics")
  const lng = useAnalyticsLocale()
  const byStep = new Map(funnel.map((f) => [f.step, Number(f.count || 0)]))
  const rows = FUNNEL_STEPS.filter((s) => byStep.has(s)).map((step, i, arr) => {
    const count = byStep.get(step) ?? 0
    const prev = i > 0 ? (byStep.get(arr[i - 1]) ?? 0) : null
    return {
      step,
      label: t(`funnel.${step}`),
      count,
      conv: prev === null ? null : prev > 0 ? (count / prev) * 100 : null,
    }
  })
  const empty = rows.every((r) => r.count === 0)

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{t("funnel.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {empty ? (
          <p className="text-muted-foreground py-8 text-center text-sm">{t("emptyChart")}</p>
        ) : (
          <>
            <ChartContainer
              config={{ count: { label: t("col.count"), color: "var(--color-chart-1)" } }}
              className="h-64 w-full min-w-0"
            >
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border/60" />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4}>
                  <LabelList
                    dataKey="count"
                    position="right"
                    className="fill-foreground"
                    fontSize={11}
                    formatter={(v: unknown) => formatNumber(Number(v ?? 0), lng)}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
            <ol className="grid gap-2 sm:grid-cols-5">
              {rows.map((r) => (
                <li key={r.step} className="rounded-md border p-2 text-sm">
                  <p className="text-muted-foreground text-xs">{r.label}</p>
                  <p className="font-semibold tabular-nums">{fmtInt(r.count, lng)}</p>
                  <p className="text-muted-foreground text-xs">
                    {r.conv === null ? "—" : t("funnel.fromPrev", { pct: fmtPct(r.conv, lng) })}
                  </p>
                </li>
              ))}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function AnalyticsCommercePanel({ range }: { range: AnalyticsRange }) {
  const t = useTranslations("analytics")
  const lng = useAnalyticsLocale()
  const q = useAnalyticsQuery<CommerceData>("commerce", range)
  const d = q.data
  const cur = d?.currency
  const money = (v: number | null | undefined) => <MoneyDisplay amount={v ?? 0} currency={cur} />
  const change = d?.change

  return (
    <div className="space-y-4">
      <AnalyticsPanelHeader range={range} source={d?.source} />
      <AnalyticsQueryGate query={q} variant="overview">
        <KpiGrid>
          <KpiCard
            label={t("kpi.orders")}
            value={fmtInt(d?.order_count, lng)}
            extra={<ChangePctBadge value={change?.order_count_pct ?? null} />}
          />
          <KpiCard
            label={t("kpi.revenue")}
            value={money(d?.revenue_minor)}
            extra={<ChangePctBadge value={change?.revenue_pct ?? null} />}
          />
          <KpiCard
            label={t("kpi.aov")}
            value={money(d?.aov_minor)}
            extra={<ChangePctBadge value={change?.aov_pct ?? null} />}
          />
          <KpiCard label={t("kpi.conversion")} value={fmtPct(d?.conversion_pct, lng)} />
          <KpiCard label={t("kpi.salesSite")} value={money(d?.channels?.site)} />
          <KpiCard label={t("kpi.salesInstagram")} value={money(d?.channels?.instagram)} />
          <KpiCard label={t("kpi.salesOther")} value={money(d?.channels?.other)} />
          <KpiCard
            label={t("kpi.newCustomers")}
            value={fmtInt(d?.new_customers, lng)}
            extra={<ChangePctBadge value={change?.new_customers_pct ?? null} />}
          />
          <KpiCard
            label={t("kpi.returningCustomers")}
            value={fmtInt(d?.returning_customers, lng)}
            extra={<ChangePctBadge value={change?.returning_customers_pct ?? null} />}
          />
        </KpiGrid>

        <FunnelCard funnel={d?.funnel ?? []} />

        <DataTable
          title={t("utmSources")}
          rows={d?.by_utm_source ?? []}
          rowKey={(r, i) => `${r.source}-${i}`}
          columns={[
            {
              key: "source",
              label: t("col.source"),
              cell: (r) => (r.source ? <span dir="ltr">{r.source}</span> : t("utmDirect")),
            },
            { key: "orders", label: t("kpi.orders"), cell: (r) => fmtInt(r.orders, lng) },
            { key: "revenue", label: t("kpi.revenue"), cell: (r) => money(r.revenue_minor) },
          ]}
        />

        <div className="grid gap-4 xl:grid-cols-3">
          <DataTable
            title={t("topViewedProducts")}
            rows={d?.top_viewed_products ?? []}
            rowKey={(r) => r.product_id}
            columns={[
              { key: "name", label: t("col.product"), cell: (r) => r.name || `#${r.product_id}` },
              { key: "views", label: t("col.views"), cell: (r) => fmtInt(r.views, lng) },
            ]}
          />
          <DataTable
            title={t("topCartProducts")}
            rows={d?.top_cart_products ?? []}
            rowKey={(r) => r.product_id}
            columns={[
              { key: "name", label: t("col.product"), cell: (r) => r.name || `#${r.product_id}` },
              { key: "adds", label: t("col.adds"), cell: (r) => fmtInt(r.adds, lng) },
            ]}
          />
          <DataTable
            title={t("topPurchasedProducts")}
            rows={d?.top_purchased_products ?? []}
            rowKey={(r) => r.product_id}
            columns={[
              { key: "name", label: t("col.product"), cell: (r) => r.name || `#${r.product_id}` },
              { key: "quantity", label: t("col.quantity"), cell: (r) => fmtInt(r.quantity, lng) },
              { key: "revenue", label: t("kpi.revenue"), cell: (r) => money(r.revenue_minor) },
            ]}
          />
        </div>
      </AnalyticsQueryGate>
    </div>
  )
}
