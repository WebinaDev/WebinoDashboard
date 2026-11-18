"use client"

import dynamic from "next/dynamic"

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
  /** Kept for call-site compat; @webina/ui v0.1.0 charts do not take locale. */
  locale?: string | null
}) {
  const { locale: _locale, ...rest } = props
  return <BarInner {...rest} />
}

export function AccentGaugeChart(props: {
  label: string
  percent?: number
  height?: number
  /** Kept for call-site compat; @webina/ui v0.1.0 charts do not take locale. */
  locale?: string | null
}) {
  const { locale: _locale, ...rest } = props
  return <GaugeInner {...rest} />
}

export { useChartColors, type MetricBarPoint } from "@webina/ui"
