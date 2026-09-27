"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api } from "@/lib/api"
import { formatDate, formatNumber, normalizeUiLocale } from "@/lib/locale"
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
  const qc = useQueryClient()
  const [busyId, setBusyId] = useState<number | null>(null)

  const moderate = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => {
      setBusyId(id)
      return api(`/api/v1/product-reviews/${id}`, {
        method: "PATCH",
        json: { status },
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard-overview"] })
    },
    onSettled: () => setBusyId(null),
  })

  if (items.length === 0 && holdCount === 0) return null

  return (
    <Card className="min-w-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">
          {t("comments.queue_title")} ({formatNumber(holdCount, lng)})
        </CardTitle>
        <Link
          className="text-xs text-primary hover:underline"
          href="/dashboard/users/comments"
        >
          {t("view_all")}
        </Link>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 pt-2">
        {items.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{t("comments.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("comments.col_author")}</TableHead>
                <TableHead>{t("comments.col_excerpt")}</TableHead>
                <TableHead>{t("comments.col_post")}</TableHead>
                <TableHead className="text-end">{t("tables.col_date")}</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm font-medium">{row.author_name}</TableCell>
                  <TableCell className="max-w-[12rem] truncate text-sm">
                    {row.content}
                  </TableCell>
                  <TableCell className="max-w-[8rem] truncate text-sm">
                    {row.post_title}
                  </TableCell>
                  <TableCell className="text-end text-xs text-muted-foreground">
                    {row.date
                      ? formatDate(row.date, lng, { dateStyle: "short" })
                      : ""}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-xs"
                        disabled={busyId === row.id}
                        onClick={() =>
                          void moderate.mutateAsync({ id: row.id, status: "approved" })
                        }
                      >
                        {t("comments.approve")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={busyId === row.id}
                        onClick={() =>
                          void moderate.mutateAsync({ id: row.id, status: "spam" })
                        }
                      >
                        {t("comments.spam")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive"
                        disabled={busyId === row.id}
                        onClick={() => {
                          if (window.confirm(t("comments.confirm_delete"))) {
                            void moderate.mutateAsync({ id: row.id, status: "trash" })
                          }
                        }}
                      >
                        {t("comments.delete")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
