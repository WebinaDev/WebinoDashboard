"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

import { useReportFormat } from "./format"
import type { HeatmapCell } from "./types"

/** Row order by JS day index (0 = Sunday): Saturday-first for fa, Monday-first otherwise. */
function dowOrder(locale: string): number[] {
  return locale === "fa" ? [6, 0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 0]
}

export function WeekHourHeatmap({ cells, currency }: { cells: HeatmapCell[]; currency?: string }) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()

  const { map, max } = useMemo(() => {
    const m = new Map<string, HeatmapCell>()
    let mx = 0
    for (const c of cells) {
      m.set(`${c.dow}-${c.hour}`, c)
      if (c.orders > mx) mx = c.orders
    }
    return { map: m, max: mx }
  }, [cells])

  const bg = (orders: number) =>
    orders > 0 && max > 0
      ? `color-mix(in oklab, var(--color-chart-1) ${Math.round(Math.max(0.1, orders / max) * 100)}%, transparent)`
      : "var(--color-muted)"

  return (
    <Card className="min-w-0 overflow-hidden shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{t("chart.heatmap")}</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 pt-0">
        {max === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">{t("emptyHint")}</p>
        ) : (
          <TooltipProvider delayDuration={100}>
            <div className="overflow-x-auto pb-2">
              <div className="min-w-[640px] space-y-0.5">
                <div className="text-muted-foreground grid grid-cols-[4.5rem_repeat(24,minmax(0,1fr))] gap-0.5 text-[10px]">
                  <div />
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="text-center">
                      {fmt.digits(h)}
                    </div>
                  ))}
                </div>
                {dowOrder(fmt.locale).map((dow) => (
                  <div key={dow} className="grid grid-cols-[4.5rem_repeat(24,minmax(0,1fr))] gap-0.5">
                    <div className="text-muted-foreground flex items-center text-xs">{t(`heatmap.dow.${dow}` as never)}</div>
                    {Array.from({ length: 24 }, (_, hour) => {
                      const cell = map.get(`${dow}-${hour}`)
                      const orders = cell?.orders ?? 0
                      return (
                        <Tooltip key={hour}>
                          <TooltipTrigger asChild>
                            <div
                              className="border-border/40 aspect-square min-h-5 rounded-sm border"
                              style={{ backgroundColor: bg(orders) }}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-medium">
                              {t(`heatmap.dow.${dow}` as never)} · {t("heatmap.hour", { hour: fmt.digits(hour) })}
                            </p>
                            <p>
                              {t("orders")}: {fmt.num(orders)}
                            </p>
                            <p>
                              {t("revenue")}: <span dir="ltr">{fmt.money(cell?.revenue ?? 0, currency)}</span>
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="text-muted-foreground mt-2 flex items-center justify-end gap-2 text-xs">
              <span>{t("heatmap.legendMin")}</span>
              <div className="flex gap-0.5">
                {[0.15, 0.35, 0.55, 0.75, 1].map((a) => (
                  <div
                    key={a}
                    className="size-3 rounded-sm"
                    style={{ backgroundColor: `color-mix(in oklab, var(--color-chart-1) ${a * 100}%, transparent)` }}
                  />
                ))}
              </div>
              <span>{t("heatmap.legendMax")}</span>
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  )
}
