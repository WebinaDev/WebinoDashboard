"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"

import { HomeAlertsPanel } from "@/components/home/HomeAlertsPanel"
import { Badge } from "@/components/ui/badge"
import type {
  DashboardOverviewAlert,
  DashboardOverviewTasks,
} from "@/types/dashboardOverview"

type HomeActionBarProps = {
  alerts?: DashboardOverviewAlert[]
  tasks?: DashboardOverviewTasks
  locale: string
}

export function HomeActionBar({ alerts, tasks, locale }: HomeActionBarProps) {
  const t = useTranslations("home")
  const chips: Array<{
    key: string
    label: string
    count: number
    href: string
    variant?: "default" | "destructive" | "secondary"
  }> = []

  if (tasks?.orders_processing && tasks.orders_processing.count > 0) {
    chips.push({
      key: "processing",
      label: t("tasks.processing"),
      count: tasks.orders_processing.count,
      href: tasks.orders_processing.href,
      variant: "destructive",
    })
  }
  if (tasks?.orders_on_hold && tasks.orders_on_hold.count > 0) {
    chips.push({
      key: "on-hold",
      label: t("tasks.on_hold"),
      count: tasks.orders_on_hold.count,
      href: tasks.orders_on_hold.href,
      variant: "secondary",
    })
  }
  if (tasks?.comments_hold && tasks.comments_hold.count > 0) {
    chips.push({
      key: "comments",
      label: t("tasks.comments_pending"),
      count: tasks.comments_hold.count,
      href: tasks.comments_hold.href,
    })
  }
  if (tasks?.products_outofstock && tasks.products_outofstock.count > 0) {
    chips.push({
      key: "stock",
      label: t("tasks.out_of_stock"),
      count: tasks.products_outofstock.count,
      href: tasks.products_outofstock.href,
    })
  }

  if (chips.length === 0 && (!alerts || alerts.length === 0)) return null

  return (
    <div className="space-y-3">
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <Link key={chip.key} href={chip.href}>
              <Badge
                variant={chip.variant ?? "default"}
                className="cursor-pointer gap-1 px-3 py-1 text-sm hover:opacity-90"
              >
                {chip.label}
                <span className="font-semibold">{chip.count}</span>
              </Badge>
            </Link>
          ))}
        </div>
      ) : null}
      {alerts && alerts.length > 0 ? (
        <HomeAlertsPanel alerts={alerts} locale={locale} />
      ) : null}
    </div>
  )
}
