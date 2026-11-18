"use client"

import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export function useChartColors() {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return {
        primary: "hsl(240 5.9% 10%)",
        muted: "hsl(240 4.8% 95.9%)",
        foreground: "hsl(240 10% 3.9%)",
        border: "hsl(240 5.9% 90%)",
      }
    }
    const styles = getComputedStyle(document.documentElement)
    const read = (name: string, fallback: string) => {
      const raw = styles.getPropertyValue(name).trim()
      return raw ? `hsl(${raw})` : fallback
    }
    return {
      primary: read("--primary", "hsl(240 5.9% 10%)"),
      muted: read("--muted", "hsl(240 4.8% 95.9%)"),
      foreground: read("--foreground", "hsl(240 10% 3.9%)"),
      border: read("--border", "hsl(240 5.9% 90%)"),
    }
  }, [])
}

export type MetricBarPoint = { label: string; value: number }

export function AccentBarChart({
  data,
  height = 220,
}: {
  data: MetricBarPoint[]
  height?: number
}) {
  const colors = useChartColors()
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: colors.foreground, fontSize: 12 }}
            axisLine={{ stroke: colors.border }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: colors.foreground, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: colors.muted,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              color: colors.foreground,
            }}
          />
          <Bar dataKey="value" fill={colors.primary} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export type DonutSegment = { label: string; value: number; color?: string }

export function AccentDonutChart({
  segments,
  height = 220,
}: {
  segments: DonutSegment[]
  height?: number
}) {
  const colors = useChartColors()
  const data = segments.filter((s) => s.value > 0)

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
          >
            {data.map((entry) => (
              <Cell
                key={entry.label}
                fill={entry.color ?? colors.primary}
                stroke="transparent"
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: colors.muted,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              color: colors.foreground,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

export function AccentGaugeChart({
  label,
  percent = 0,
  height = 180,
}: {
  label: string
  percent?: number
  height?: number
}) {
  const colors = useChartColors()
  const value = Math.min(100, Math.max(0, percent ?? 0))
  const data = [{ name: label, value, fill: colors.primary }]

  return (
    <div className="flex flex-col items-center gap-2" style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height={height - 28}>
        <RadialBarChart
          innerRadius="70%"
          outerRadius="100%"
          data={data}
          startAngle={180}
          endAngle={0}
        >
          <RadialBar background dataKey="value" cornerRadius={8} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="text-center text-sm">
        <div className="text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{Math.round(value)}%</div>
      </div>
    </div>
  )
}
