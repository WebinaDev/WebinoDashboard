"use client"

import { AlertTriangle, Info } from "lucide-react"
import { useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate, normalizeUiLocale } from "@/lib/locale"
import type { DashboardOverviewAlert } from "@/types/dashboardOverview"

type HomeAlertsPanelProps = {
  alerts: DashboardOverviewAlert[]
  locale: string
}

function alertSourceLabel(
  t: ReturnType<typeof useTranslations<"home">>,
  source: string,
): string {
  switch (source) {
    case "license":
      return t("alerts.source.license")
    case "sms-panel":
      return t("alerts.source.sms_panel")
    case "bale-bot":
      return t("alerts.source.bale_bot")
    case "telegram-bot":
      return t("alerts.source.telegram_bot")
    default:
      return source
  }
}

function AlertIcon({ level }: { level: DashboardOverviewAlert["level"] }) {
  if (level === "error") {
    return <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
  }
  if (level === "warning") {
    return <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
  }
  return <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
}

export function HomeAlertsPanel({ alerts, locale }: HomeAlertsPanelProps) {
  const t = useTranslations("home")
  const lng = normalizeUiLocale(locale)
  if (alerts.length === 0) return null

  return (
    <Card className="border-destructive/20 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{t("sections.alerts")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {alerts.map((alert, idx) => (
            <li key={`${alert.source}-${alert.at}-${idx}`} className="flex gap-2 text-sm">
              <AlertIcon level={alert.level} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{alertSourceLabel(t, alert.source)}</p>
                <p className="text-muted-foreground">{alert.message}</p>
                {alert.at ? (
                  <p className="text-xs text-muted-foreground">
                    {formatDate(alert.at, lng, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
