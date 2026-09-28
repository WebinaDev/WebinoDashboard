"use client"

import type { ComponentType } from "react"
import { useTranslations } from "next-intl"

import type { ResolvedAdminRoute } from "@/kernel/types"

import { FinancialPanel } from "../components/reports/panels/financial-panel"
import {
  CategoriesPanel,
  CouponsPanel,
  CustomersPanel,
  DownloadsPanel,
  ProductsPanel,
  TaxesPanel,
  VariationsPanel,
} from "../components/reports/panels/list-panels"
import { OrdersPanel } from "../components/reports/panels/orders-panel"
import { OverviewPanel } from "../components/reports/panels/overview-panel"
import type { ReportPanelProps } from "../components/reports/panels/panel-state"
import { RevenuePanel } from "../components/reports/panels/revenue-panel"
import { SalesPanel } from "../components/reports/panels/sales-panel"
import { StockPanel } from "../components/reports/panels/stock-panel"
import { ReportFilterBar } from "../components/reports/report-filter-bar"
import { useReportFilters } from "../components/reports/use-report-filters"

const PANELS: Record<string, ComponentType<ReportPanelProps>> = {
  overview: OverviewPanel,
  revenue: RevenuePanel,
  orders: OrdersPanel,
  products: ProductsPanel,
  variations: VariationsPanel,
  categories: CategoriesPanel,
  coupons: CouponsPanel,
  taxes: TaxesPanel,
  customers: CustomersPanel,
  downloads: DownloadsPanel,
  sales: SalesPanel,
  financial: FinancialPanel,
}

export default function ShopReportsShellPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("reports")
  const raw = route.path.replace(/^reports\/?/, "") || "overview"
  const section = raw === "stock" || raw in PANELS ? raw : "overview"
  const filterState = useReportFilters()
  const Panel = PANELS[section]

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t(`sections.${section}` as never)}</h1>
        <p className="text-muted-foreground text-sm">{t("shopDescription")}</p>
      </div>
      {section === "stock" ? (
        <StockPanel />
      ) : (
        <>
          <ReportFilterBar state={filterState} exportSection={section} />
          {Panel ? <Panel key={section} filters={filterState.filters} /> : null}
        </>
      )}
    </div>
  )
}
