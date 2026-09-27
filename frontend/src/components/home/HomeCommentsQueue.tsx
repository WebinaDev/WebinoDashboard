"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate, normalizeUiLocale } from "@/lib/locale"
import type { DashboardOverviewCommentRow } from "@/types/dashboardOverview"

type HomeCommentsQueueProps = {
  items: DashboardOverviewCommentRow[]
  holdCount: number
  locale: string
}

export function HomeCommentsQueue({
  items,
  holdCount,
  locale,
}: HomeCommentsQueueProps) {
  const t = useTranslations("home")
  const lng = normalizeUiLocale(locale)

  return (
    <Card className="min-w-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-medium">
            {t("comments.title")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("comments.pending_count", { count: holdCount })}
          </p>
        </div>
        <Link
          className="text-xs text-primary hover:underline"
          href="/dashboard/settings/shop/reviews"
        >
          {t("view_all")}
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("comments.empty")}</p>
        ) : (
          items.map((row) => (
            <Link
              key={row.id}
              href={row.href || "/dashboard/settings/shop/reviews"}
              className="block space-y-0.5 rounded-lg border px-3 py-2 hover:bg-muted/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {row.author_name}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {row.date
                    ? formatDate(row.date, lng, { dateStyle: "short" })
                    : ""}
                </span>
              </div>
              {row.post_title ? (
                <p className="truncate text-xs text-muted-foreground">
                  {row.post_title}
                </p>
              ) : null}
              <p className="line-clamp-2 text-xs">{row.content}</p>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  )
}
