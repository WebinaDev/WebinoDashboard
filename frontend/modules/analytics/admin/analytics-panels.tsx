"use client"

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { api } from "@/lib/api"
import { formatInteger } from "@/lib/format"
import { normalizeUiLocale } from "@/lib/locale"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Label } from "@/components/ui/label"

export function usePeriodRange(defaultDays = 30) {
  const [days, setDays] = useState(defaultDays)
  const to = Math.floor(Date.now() / 1000)
  const from = to - days * 86400
  return { days, setDays, from, to }
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

function PeriodBar({
  days,
  setDays,
}: {
  days: number
  setDays: (d: number) => void
}) {
  const t = useTranslations("analytics")
  return (
    <div className="flex flex-wrap gap-2">
      {[7, 30, 90].map((d) => (
        <Button
          key={d}
          size="sm"
          variant={days === d ? "default" : "outline"}
          onClick={() => setDays(d)}
        >
          {d === 7 ? t("period7") : d === 30 ? t("period30") : t("period90")}
        </Button>
      ))}
    </div>
  )
}

function SeriesChart({
  title,
  data,
  dataKey,
}: {
  title: string
  data: Array<Record<string, unknown>>
  dataKey: string
}) {
  const t = useTranslations("analytics")
  if (!data.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">{t("emptyChart")}</CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Area type="monotone" dataKey={dataKey} stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function SimpleTable({
  columns,
  rows,
}: {
  columns: { key: string; label: string }[]
  rows: Array<Record<string, unknown>>
}) {
  const t = useTranslations("analytics")
  if (!rows.length) {
    return <p className="text-muted-foreground text-sm">{t("empty")}</p>
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key}>{c.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => (
                <TableCell key={c.key}>{String(row[c.key] ?? "—")}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function AnalyticsSectionPanel({ section }: { section: string }) {
  const t = useTranslations("analytics")
  const locale = useLocale()
  const lng = normalizeUiLocale(locale)
  const period = usePeriodRange(30)
  const [search, setSearch] = useState("")
  const [dim, setDim] = useState(section === "geo" ? "country" : "browser")

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    p.set("from", String(period.from))
    p.set("to", String(period.to))
    if (section === "pages" && search.trim()) p.set("search", search.trim())
    if (section === "geo" || section === "devices") p.set("dim", dim)
    return p.toString()
  }, [period.from, period.to, section, search, dim])

  const q = useQuery({
    queryKey: ["analytics", section, qs],
    queryFn: () => api<Record<string, unknown>>(`/api/v1/analytics/${section}?${qs}`),
  })

  const d = q.data
  const n = (v: unknown) => formatInteger(Number(v ?? 0), lng)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PeriodBar days={period.days} setDays={period.setDays} />
        {section === "pages" ? (
          <div className="grid gap-1">
            <Label>{t("search")}</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          </div>
        ) : null}
        {section === "geo" ? (
          <div className="flex gap-2">
            <Button size="sm" variant={dim === "country" ? "default" : "outline"} onClick={() => setDim("country")}>
              {t("geoCountry")}
            </Button>
            <Button size="sm" variant={dim === "city" ? "default" : "outline"} onClick={() => setDim("city")}>
              {t("geoCity")}
            </Button>
          </div>
        ) : null}
        {section === "devices" ? (
          <div className="flex gap-2">
            {(["browser", "os", "device"] as const).map((k) => (
              <Button key={k} size="sm" variant={dim === k ? "default" : "outline"} onClick={() => setDim(k)}>
                {k === "browser" ? t("deviceBrowser") : k === "os" ? t("deviceOs") : t("deviceType")}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      {q.isLoading ? <p className="text-muted-foreground text-sm">{t("loading")}</p> : null}
      {q.isError ? <p className="text-destructive text-sm">{t("error")}</p> : null}

      {section === "overview" && d ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label={t("kpi.visitors")} value={n(d.visitors)} />
            <Kpi label={t("kpi.views")} value={n(d.views)} />
            <Kpi label={t("kpi.online")} value={n(d.online)} />
            <Kpi label={t("source")} value={String(d.source ?? "native")} />
          </div>
          <SeriesChart title={t("chartViews")} data={(d.series as Array<Record<string, unknown>>) ?? []} dataKey="views" />
        </>
      ) : null}

      {section === "visitors" && d ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label={t("kpi.visitors")} value={n(d.visitors)} />
          <Kpi label={t("kpi.views")} value={n(d.views)} />
          <Kpi label={t("sessions")} value={n(d.sessions)} />
          <Kpi label={t("bounceRate")} value={`${d.bounce_rate ?? 0}%`} />
        </div>
      ) : null}

      {section === "pages" && d ? (
        <SimpleTable
          columns={[
            { key: "uri", label: t("col.uri") },
            { key: "views", label: t("col.views") },
          ]}
          rows={((d.items as Array<Record<string, unknown>>) ?? []).slice(0, 50)}
        />
      ) : null}

      {section === "referrals" && d ? (
        <SimpleTable
          columns={[
            { key: "source", label: t("col.source") },
            { key: "category", label: t("col.category") },
            { key: "visits", label: t("col.visits") },
          ]}
          rows={((d.items as Array<Record<string, unknown>>) ?? []).slice(0, 50)}
        />
      ) : null}

      {(section === "geo" || section === "devices") && d ? (
        <SimpleTable
          columns={[
            { key: "label", label: t("col.metric") },
            { key: "views", label: t("col.views") },
          ]}
          rows={((d.items as Array<Record<string, unknown>>) ?? []).map((r) => ({
            ...r,
            label: r.value ?? r.label ?? r.country ?? r.city ?? r.browser ?? r.os ?? r.device,
          }))}
        />
      ) : null}

      {section === "commerce" && d ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label={t("kpi.orders")} value={n(d.order_count ?? (d as { orders?: number }).orders)} />
          <Kpi label={t("kpi.revenue")} value={n(d.revenue)} />
          <Kpi label={t("kpi.aov")} value={n(d.aov)} />
          <Kpi label={t("kpi.conversion")} value={`${d.conversion ?? 0}%`} />
        </div>
      ) : null}

      {section === "compare" && d ? (
        <SimpleTable
          columns={[
            { key: "metric", label: t("compare.metric") },
            { key: "current", label: t("compare.thisMonth") },
            { key: "previous", label: t("compare.lastMonth") },
            { key: "change", label: t("compare.change") },
          ]}
          rows={((d.metrics as Array<Record<string, unknown>>) ?? (d.items as Array<Record<string, unknown>>) ?? [])}
        />
      ) : null}

      {section === "seo" && d ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label={t("seo.products")} value={n(d.products_published ?? d.products)} />
          <Kpi label={t("seo.posts")} value={n(d.posts_published ?? d.posts)} />
          <Kpi label={t("seo.pages")} value={n(d.pages_published ?? d.pages)} />
          <Kpi label={t("seo.score")} value={n(d.avg_score ?? 0)} />
        </div>
      ) : null}

      {section === "support" && d ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi label={t("support.open")} value={n(d.open ?? 0)} />
          <Kpi label={t("support.closed")} value={n(d.closed ?? 0)} />
          <Kpi label={t("support.avgReply")} value={String(d.avg_reply_hours ?? "—")} />
        </div>
      ) : null}

      {section === "content" && d ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi label={t("content.productsCreated")} value={n(d.products_created ?? d.products)} />
          <Kpi label={t("content.postsPublished")} value={n(d.posts_published ?? d.posts)} />
          <Kpi label={t("content.aiPages")} value={n(d.pages_published ?? d.pages)} />
        </div>
      ) : null}

      {section === "month-summary" && d ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label={t("monthSummary.kpi.visitors")} value={n(d.visitors)} />
          <Kpi label={t("monthSummary.kpi.orders")} value={n(d.orders ?? d.order_count)} />
          <Kpi label={t("monthSummary.kpi.revenue")} value={n(d.revenue)} />
          <Kpi label={t("monthSummary.score")} value={n(d.score ?? 0)} />
        </div>
      ) : null}
    </div>
  )
}
