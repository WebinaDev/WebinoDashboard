"use client"

import { useTranslations } from "next-intl"

import { ChangePctBadge } from "@/components/home/ChangePctBadge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import type { DashboardTrafficPeriod } from "@/types/dashboardOverview"

const PERIOD_LABEL_KEYS: Record<string, "traffic.period_today" | "traffic.period_yesterday" | "traffic.last7_recent" | "traffic.last14_recent" | "traffic.all_time"> = {
  today: "traffic.period_today",
  yesterday: "traffic.period_yesterday",
  last7_excl_today: "traffic.last7_recent",
  last14_excl_today: "traffic.last14_recent",
  all_time: "traffic.all_time",
}

function MetricCell({
  value,
  changePct,
  locale,
  compact,
}: {
  value: number
  changePct: number | null
  locale: string
  compact?: boolean
}) {
  const lng = normalizeUiLocale(locale)
  const formatted = compact && value >= 1000
    ? new Intl.NumberFormat(lng, { notation: "compact", maximumFractionDigits: 1 }).format(value)
    : formatNumber(value, lng)

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-medium tabular-nums">{formatted}</span>
      {changePct !== null ? <ChangePctBadge value={changePct} /> : null}
    </div>
  )
}

type HomeTrafficPeriodsTableProps = {
  periods: DashboardTrafficPeriod[]
  locale: string
  embedded?: boolean
}

export function HomeTrafficPeriodsTable({
  periods,
  locale,
  embedded,
}: HomeTrafficPeriodsTableProps) {
  const t = useTranslations("home")
  const tAnalytics = useTranslations("analytics")

  const table = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("traffic.period")}</TableHead>
          <TableHead className="text-end">{tAnalytics("kpi.visitors")}</TableHead>
          <TableHead className="text-end">{tAnalytics("kpi.views")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {periods.map((row) => {
          const labelKey = PERIOD_LABEL_KEYS[row.id]
          const showPct = row.id !== "today" && row.id !== "all_time"
          const compact = row.visitors >= 1000 || row.views >= 1000
          return (
            <TableRow key={row.id}>
              <TableCell className="font-medium">
                {labelKey ? t(labelKey) : row.id}
              </TableCell>
              <TableCell className="text-end">
                <MetricCell
                  value={row.visitors}
                  changePct={showPct ? row.visitors_change_pct : null}
                  locale={locale}
                  compact={compact}
                />
              </TableCell>
              <TableCell className="text-end">
                <MetricCell
                  value={row.views}
                  changePct={showPct ? row.views_change_pct : null}
                  locale={locale}
                  compact={compact}
                />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )

  if (embedded) {
    return <div className="overflow-x-auto">{table}</div>
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{t("traffic.periods_title")}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 pt-2">{table}</CardContent>
    </Card>
  )
}
