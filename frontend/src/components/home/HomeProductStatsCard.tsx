"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import type { DashboardOverviewProductStats } from "@/types/dashboardOverview"

type HomeProductStatsCardProps = {
  stats: DashboardOverviewProductStats
  locale: string
}

const STATUS_KEYS = ["publish", "draft", "pending", "private", "trash"] as const
const STOCK_KEYS = ["instock", "outofstock", "onbackorder"] as const

export function HomeProductStatsCard({
  stats,
  locale,
}: HomeProductStatsCardProps) {
  const t = useTranslations("home")
  const lng = normalizeUiLocale(locale)

  if (!stats || typeof stats.total !== "number") {
    return null
  }
  const byStatus = stats.by_status ?? {}
  const byStock = stats.by_stock ?? {}

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">
          {t("sections.products")}
        </CardTitle>
        <Link
          className="text-xs text-primary hover:underline"
          href="/dashboard/products"
        >
          {t("view_all")}
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">{t("products.total")}</p>
          <p className="text-2xl font-semibold">
            {formatNumber(stats.total, lng)}
          </p>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              {t("products.by_status_title")}
            </p>
            <ul className="space-y-0.5">
              {STATUS_KEYS.map((key) =>
                byStatus[key] ? (
                  <li key={key} className="flex justify-between gap-2">
                    <span>{t(`products.by_status.${key}`)}</span>
                    <span className="font-medium">
                      {formatNumber(byStatus[key], lng)}
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              {t("products.by_stock_title")}
            </p>
            <ul className="space-y-0.5">
              {STOCK_KEYS.map((key) => (
                <li key={key} className="flex justify-between gap-2">
                  <span>{t(`products.by_stock.${key}`)}</span>
                  <span className="font-medium">
                    {formatNumber(byStock[key] ?? 0, lng)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
