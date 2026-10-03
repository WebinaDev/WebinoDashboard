"use client"

import dynamic from "next/dynamic"
import { useLocale } from "next-intl"

import type { MetricBarPoint } from "@webina/ui"

const chartLoading = () => (
  <div className="h-[220px] w-full animate-pulse rounded-md bg-muted" />
)

const BarInner = dynamic(
  () => import("@webina/ui").then((m) => m.AccentBarChart),
  { ssr: false, loading: chartLoading },
)

const GaugeInner = dynamic(
  () => import("@webina/ui").then((m) => m.AccentGaugeChart),
  { ssr: false, loading: chartLoading },
)

export function AccentBarChart(props: {
  data: MetricBarPoint[]
  height?: number
  locale?: string | null
}) {
  const locale = useLocale()
  return <BarInner {...props} locale={props.locale ?? locale} />
}

export function AccentGaugeChart(props: {
  label: string
  percent?: number
  height?: number
  locale?: string | null
}) {
  const locale = useLocale()
  return <GaugeInner {...props} locale={props.locale ?? locale} />
}

export { useChartColors, type MetricBarPoint } from "@webina/ui"
