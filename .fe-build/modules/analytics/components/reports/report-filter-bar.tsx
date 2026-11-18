"use client"

import { ChevronDown, Download, Loader2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useEnumLabel } from "@/lib/enum-labels"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { REPORT_RANGE_PRESETS } from "@/lib/report-range"

import type { ReportInterval } from "./types"
import { SALE_STATUS_OPTIONS, useReportExport, type ReportFilterState } from "./use-report-filters"

type ReportFilterBarProps = {
  state: ReportFilterState
  /** Report section for CSV export; omit to hide the export button. */
  exportSection?: string
}

export function ReportFilterBar({ state, exportSection }: ReportFilterBarProps) {
  const t = useTranslations("reports")
  const locale = useLocale()
  const lng = normalizeUiLocale(locale)
  const enumLabel = useEnumLabel()
  const exporter = useReportExport()

  const toggleStatus = (slug: string, checked: boolean) => {
    const cur = state.statuses
    state.setStatuses(checked ? (cur.includes(slug) ? cur : [...cur, slug]) : cur.filter((s) => s !== slug))
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {REPORT_RANGE_PRESETS.map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={state.preset === p ? "default" : "outline"}
              onClick={() => state.applyPreset(p)}
            >
              {t(`preset.${p}`)}
            </Button>
          ))}
          <div className="ms-auto flex items-center gap-2">
            {state.activeCount > 0 ? (
              <Button type="button" size="sm" variant="ghost" onClick={state.reset}>
                {t("filters.reset")}
                <Badge variant="secondary" className="ms-1">
                  {formatNumber(state.activeCount, lng)}
                </Badge>
              </Button>
            ) : null}
            {exportSection ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={exporter.busy}
                onClick={() => void exporter.run(exportSection, state.filters)}
              >
                {exporter.busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                {t("exportCsv")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label>{t("dateFrom")}</Label>
            <LocaleDatePicker
              locale={locale}
              value={state.fromYmd}
              onChange={state.setFromYmd}
              aria-label={t("dateFrom")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("dateTo")}</Label>
            <LocaleDatePicker locale={locale} value={state.toYmd} onChange={state.setToYmd} aria-label={t("dateTo")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("interval")}</Label>
            <Select value={state.interval} onValueChange={(v) => state.setInterval(v as ReportInterval)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">{t("intervalDay")}</SelectItem>
                <SelectItem value="week">{t("intervalWeek")}</SelectItem>
                <SelectItem value="month">{t("intervalMonth")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("statusFilter")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate">
                    {state.statuses.length
                      ? t("filters.statusesSelected", { count: formatNumber(state.statuses.length, lng) })
                      : t("filters.allSaleStatuses")}
                  </span>
                  <ChevronDown className="size-4 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-2">
                <p className="text-muted-foreground px-1 pb-2 text-xs">{t("statusFilterHint")}</p>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {SALE_STATUS_OPTIONS.map((slug) => (
                    <label
                      key={slug}
                      className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm"
                    >
                      <Checkbox
                        checked={state.statuses.includes(slug)}
                        onCheckedChange={(v) => toggleStatus(slug, v)}
                      />
                      <span>{enumLabel("order_status", slug)}</span>
                    </label>
                  ))}
                </div>
                {state.statuses.length ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-2 w-full"
                    onClick={() => state.setStatuses([])}
                  >
                    {t("filters.clearStatuses")}
                  </Button>
                ) : null}
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-end pb-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Switch checked={state.compare} onCheckedChange={state.setCompare} />
              {t("comparePrevious")}
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
