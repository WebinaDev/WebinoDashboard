"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import type { AnalyticsRange } from "../AnalyticsPeriodFilter"
import {
  AnalyticsPanelHeader,
  AnalyticsQueryGate,
  DataTable,
  DimToggle,
  fmtInt,
  fmtPct,
  useAnalyticsLocale,
} from "../analytics-ui"
import type { DimData } from "../types"
import { useAnalyticsQuery } from "../use-analytics-query"

function DimensionPanel<D extends string>({
  section,
  range,
  dims,
  toggleLabel,
}: {
  section: "geo" | "devices"
  range: AnalyticsRange
  dims: Array<{ value: D; label: string }>
  toggleLabel: string
}) {
  const t = useTranslations("analytics")
  const lng = useAnalyticsLocale()
  const [dim, setDim] = useState<D>(dims[0].value)
  const q = useAnalyticsQuery<DimData>(section, range, { dim })
  const d = q.data
  const items = d && (!d.dim || d.dim === dim) ? (d.items ?? []) : []
  const total = items.reduce((s, r) => s + Number(r.views || 0), 0)
  const dimLabel = dims.find((o) => o.value === dim)?.label ?? dim

  return (
    <div className="space-y-4">
      <AnalyticsPanelHeader range={range} source={d?.source}>
        <DimToggle label={toggleLabel} value={dim} options={dims} onChange={setDim} />
      </AnalyticsPanelHeader>
      <AnalyticsQueryGate query={q}>
        <DataTable
          rows={items}
          rowKey={(r, i) => `${r.value ?? ""}-${i}`}
          columns={[
            { key: "value", label: dimLabel, cell: (r) => r.value || t("unknown") },
            { key: "views", label: t("col.views"), cell: (r) => fmtInt(r.views, lng) },
            {
              key: "share",
              label: t("col.share"),
              cell: (r) => (total > 0 ? fmtPct((Number(r.views) / total) * 100, lng) : "—"),
            },
          ]}
        />
      </AnalyticsQueryGate>
    </div>
  )
}

export function AnalyticsGeoPanel({ range }: { range: AnalyticsRange }) {
  const t = useTranslations("analytics")
  return (
    <DimensionPanel
      section="geo"
      range={range}
      toggleLabel={t("geoDim")}
      dims={[
        { value: "country", label: t("geoCountry") },
        { value: "city", label: t("geoCity") },
      ]}
    />
  )
}

export function AnalyticsDevicesPanel({ range }: { range: AnalyticsRange }) {
  const t = useTranslations("analytics")
  return (
    <DimensionPanel
      section="devices"
      range={range}
      toggleLabel={t("deviceDim")}
      dims={[
        { value: "browser", label: t("deviceBrowser") },
        { value: "os", label: t("deviceOs") },
        { value: "device", label: t("deviceType") },
      ]}
    />
  )
}
