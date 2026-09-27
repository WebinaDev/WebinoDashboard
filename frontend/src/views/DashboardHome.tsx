"use client"

import { useQuery } from "@tanstack/react-query"
import { lazy, Suspense, useMemo } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { HomeActionBar } from "@/components/home/HomeActionBar"
import { HomeCommentsQueue } from "@/components/home/HomeCommentsQueue"
import { HomeFulfillmentTodos } from "@/components/home/HomeFulfillmentTodos"
import { HomeKpiStrip } from "@/components/home/HomeKpiStrip"
import { HomeMiniCardsStrip } from "@/components/home/HomeMiniCardsStrip"
import { HomeOrderWorkflow } from "@/components/home/HomeOrderWorkflow"
import { HomeOrdersTable } from "@/components/home/HomeOrdersTable"
import { HomeOverviewSkeleton } from "@/components/home/HomeOverviewSkeleton"
import { HomeProductStatsCard } from "@/components/home/HomeProductStatsCard"
import { HomeProductTable } from "@/components/home/HomeProductTable"
import { TopCategoriesTable, TopCustomersTable } from "@/components/home/HomeTopTables"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { formatDate, formatNumber, normalizeUiLocale } from "@/lib/locale"
import type {
  DashboardOverviewPanels,
  DashboardOverviewResponse,
} from "@/types/dashboardOverview"

const HomeSalesStatCard = lazy(() =>
  import("@/components/home/HomeSalesStatCard").then((m) => ({
    default: m.HomeSalesStatCard,
  })),
)
const HomeTrafficAnalyticsPanel = lazy(() =>
  import("@/components/home/HomeTrafficAnalyticsPanel").then((m) => ({
    default: m.HomeTrafficAnalyticsPanel,
  })),
)
const HomeProfitChart = lazy(() =>
  import("@/components/home/HomeProfitChart").then((m) => ({
    default: m.HomeProfitChart,
  })),
)
const HomeOrdersBreakdown = lazy(() =>
  import("@/components/home/HomeOrdersBreakdown").then((m) => ({
    default: m.HomeOrdersBreakdown,
  })),
)

function HomeChartFallback() {
  return <Skeleton className="h-48 w-full rounded-2xl sm:h-64 lg:h-80" />
}

type AuthUser = {
  id: number
  name: string
  role?: string
  capabilities?: string[]
  tenant?: { id: number; name: string }
}

export default function DashboardHome({
  initialOverview,
}: {
  initialOverview?: DashboardOverviewResponse
}) {
  const t = useTranslations("home")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const lng = normalizeUiLocale(locale)
  const router = useRouter()

  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: () => api<AuthUser>("/api/v1/auth/user"),
  })

  const caps = user?.capabilities ?? []
  const hasCap = (c: string) =>
    caps.includes("*") ||
    caps.includes(c) ||
    caps.some((g) => g.endsWith(".*") && (c === g.slice(0, -2) || c.startsWith(g.slice(0, -2) + ".")))
  const isPortalOnly =
    Boolean(user) &&
    (hasCap("account.portal") || hasCap("partner.portal")) &&
    !hasCap("orders.*") &&
    !hasCap("orders.own") &&
    (user?.role === "customer" || user?.role === "partner" || user?.role === "subscriber")

  useEffect(() => {
    if (isPortalOnly) {
      router.replace("/dashboard/account")
    }
  }, [isPortalOnly, router])

  const overview = useQuery({
    queryKey: ["dashboard-overview", lng],
    queryFn: () =>
      api<DashboardOverviewResponse>(
        `/api/v1/dashboard/overview?locale=${encodeURIComponent(lng)}`,
      ),
    retry: false,
    staleTime: 90_000,
    enabled: !isPortalOnly,
    initialData: initialOverview,
  })

  const smsUnavailable = overview.data?.panels?.sms?.unavailable === true
  const smsPanelQ = useQuery({
    queryKey: ["dashboard-sms-panel"],
    queryFn: () =>
      api<NonNullable<DashboardOverviewPanels["sms"]>>(
        "/api/v1/dashboard/sms-panel?refresh=1",
      ),
    enabled: smsUnavailable && !isPortalOnly,
    retry: false,
    staleTime: 60_000,
  })

  const smsRefetch =
    smsUnavailable &&
    (smsPanelQ.isFetching || smsPanelQ.isPending || smsPanelQ.isError)
      ? {
          status: (smsPanelQ.isError ? "error" : "loading") as "error" | "loading",
          onRetry: () => void smsPanelQ.refetch(),
          message: smsPanelQ.error?.message,
        }
      : undefined

  const panels = useMemo((): DashboardOverviewPanels | undefined => {
    const base = overview.data?.panels
    if (!base) return undefined
    if (smsPanelQ.data && !smsPanelQ.data.unavailable) {
      return { ...base, sms: smsPanelQ.data }
    }
    return base
  }, [overview.data?.panels, smsPanelQ.data])

  const data = overview.data
  const hasSection = (id: string) => data?.sections.includes(id) ?? false
  const currency = data?.sales?.currency || undefined
  const showLoading = overview.isLoading && !overview.data

  if (isPortalOnly) {
    return <HomeOverviewSkeleton />
  }

  const licenseActive = panels?.license?.active ?? false
  const trafficActive = panels?.analytics?.active ?? data?.traffic?.active ?? false
  const trafficOnline = panels?.analytics?.online ?? data?.traffic?.online ?? 0
  const shopActive =
    panels?.woocommerce?.active ?? Boolean(data?.products || data?.sales) ?? false

  return (
    <div className="space-y-5">
      <header className="wd-home-hero relative z-0 space-y-1.5">
        <p className="relative text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {formatDate(new Date().toISOString(), lng, { dateStyle: "full" })}
        </p>
        <h1 className="relative text-xl font-semibold tracking-tight sm:text-2xl">
          {t("welcome")}
        </h1>
        {user?.tenant?.name ? (
          <p className="relative max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {user.tenant.name}
          </p>
        ) : null}
      </header>

      {showLoading ? (
        <HomeOverviewSkeleton />
      ) : overview.isError && !overview.data ? (
        <div className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">
            {overview.error?.message || tCommon("error_generic")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void overview.refetch()}
          >
            {t("overview.retry")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          <HomeActionBar alerts={data?.alerts} tasks={data?.tasks} locale={lng} />

          <HomeMiniCardsStrip
            panels={panels}
            products={data?.products}
            locale={lng}
            smsRefetch={smsRefetch}
            licenseActive={licenseActive}
            trafficActive={trafficActive}
            trafficOnline={trafficOnline}
            shopActive={shopActive}
          />

          {(hasSection("account") || hasSection("partner")) &&
          (data?.account || data?.partner) ? (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold tracking-tight">
                {t("partner.title")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card variant="stat" className="wd-mini-tint rounded-2xl p-4">
                  <p className="text-xs text-muted-foreground">
                    {t("partner.order_count")}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {formatNumber(Number((data.account ?? data.partner)?.order_count ?? 0), lng)}
                  </p>
                </Card>
                <Card variant="stat" className="wd-mini-tint rounded-2xl p-4">
                  <p className="text-xs text-muted-foreground">
                    {t("partner.last_order")}
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {(data.account ?? data.partner)?.last_order_at
                      ? formatDate(
                          (data.account ?? data.partner)?.last_order_at as string,
                          lng,
                          { dateStyle: "medium" },
                        )
                      : t("no_orders")}
                  </p>
                </Card>
              </div>
              <HomeOrdersTable
                title={t("recent_orders")}
                rows={(data.account ?? data.partner)?.recent_orders ?? []}
                monthLabel=""
                viewAllHref="/dashboard/account/orders"
                orderHrefBase="/dashboard/account/orders"
                emptyMessage={t("no_orders")}
                currency={currency}
                locale={lng}
              />
            </section>
          ) : null}

          {hasSection("sales") && data?.sales ? (
            <HomeKpiStrip
              summary={data.sales.summary}
              compareSummary={data.sales.compare_summary}
              currency={currency}
              locale={lng}
            />
          ) : null}

          {hasSection("fulfillment") && data?.fulfillment ? (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold tracking-tight">
                {t("sections.fulfillment")}
              </h2>
              <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
                <div className="min-w-0 lg:col-span-3">
                  <HomeFulfillmentTodos fulfillment={data.fulfillment} />
                </div>
                <div className="min-w-0 lg:col-span-2">
                  <HomeOrderWorkflow />
                </div>
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold tracking-tight">
              {t("sections.charts")}
            </h2>
            <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-2">
              {hasSection("sales") && data?.sales ? (
                <div className="min-w-0 overflow-hidden">
                  <Suspense fallback={<HomeChartFallback />}>
                    <HomeSalesStatCard
                      sales={data.sales}
                      currency={currency}
                      locale={lng}
                    />
                  </Suspense>
                </div>
              ) : null}

              {hasSection("traffic") && data?.traffic ? (
                <div className="min-w-0 overflow-hidden">
                  <Suspense fallback={<HomeChartFallback />}>
                    <HomeTrafficAnalyticsPanel
                      traffic={data.traffic}
                      locale={lng}
                    />
                  </Suspense>
                </div>
              ) : null}

              {hasSection("sales") && data?.sales ? (
                <div className="min-w-0 overflow-hidden">
                  <Suspense fallback={<HomeChartFallback />}>
                    <HomeProfitChart
                      series={data.sales.series}
                      compareSeries={data.sales.compare_series}
                      locale={lng}
                    />
                  </Suspense>
                </div>
              ) : null}

              {hasSection("products") && data?.products ? (
                <div className="min-w-0 overflow-hidden">
                  <HomeProductStatsCard stats={data.products} locale={lng} />
                </div>
              ) : null}
            </div>
          </section>

          {hasSection("sales") && data?.sales ? (
            <Suspense fallback={<HomeChartFallback />}>
              <HomeOrdersBreakdown
                locale={lng}
                byStatus={data.sales.by_status ?? []}
                byPayment={data.sales.by_payment ?? []}
                byHour={data.sales.by_hour ?? []}
              />
            </Suspense>
          ) : null}

          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            {hasSection("sales") && data?.sales ? (
              <HomeOrdersTable
                title={t("recent_orders")}
                rows={data.sales.recent_orders}
                monthLabel={data.sales.month_label}
                viewAllHref="/dashboard/orders"
                emptyMessage={t("orders.empty_month")}
                currency={currency}
                locale={lng}
              />
            ) : null}

            {hasSection("comments") && data?.comments ? (
              <HomeCommentsQueue
                items={data.comments.items}
                holdCount={data.comments.counts.hold}
                locale={lng}
              />
            ) : null}
          </div>

          {hasSection("sales") && data?.sales ? (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold tracking-tight">
                {t("sections.lists")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <HomeProductTable
                  title={t("recent_products")}
                  rows={data.sales.recent_products}
                  viewAllHref="/dashboard/products"
                  emptyMessage={t("no_products")}
                  metricKey="price"
                  currency={currency}
                  locale={lng}
                />
                <HomeProductTable
                  title={t("tables.top_products")}
                  rows={data.sales.top_products}
                  viewAllHref="/dashboard/reports/overview"
                  emptyMessage={t("empty_hint")}
                  metricKey="revenue"
                  currency={currency}
                  locale={lng}
                />
                <HomeProductTable
                  title={t("tables.top_by_views")}
                  rows={data.sales.top_products_by_views}
                  viewAllHref="/dashboard/products"
                  emptyMessage={t("empty_hint")}
                  metricKey="views"
                  locale={lng}
                />
                <TopCategoriesTable
                  rows={data.sales.top_categories}
                  currency={currency}
                  locale={lng}
                />
              </div>
              <div className="min-w-0 overflow-x-auto rounded-2xl">
                <TopCustomersTable
                  rows={data.sales.top_customers}
                  currency={currency}
                  locale={lng}
                />
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}
