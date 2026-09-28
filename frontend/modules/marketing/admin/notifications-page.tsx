"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell, Settings } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { PostsPagination } from "@/components/PostsPagination"
import { QueryErrorState } from "@/components/QueryErrorState"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { dashboardPath } from "@/kernel/paths"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatDisplayDateTime } from "@/lib/format-date"
import { toNotificationNavPath } from "@/lib/notification-links"
import { cn } from "@/lib/utils"

type NotificationRow = {
  id: number
  type: string
  title: string
  body: string
  link: string
  read: boolean
  created_at: string
}

export default function NotificationsPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("notifications_hub")
  const tCommon = useTranslations("common")
  const params = useSearchParams()
  const router = useRouter()
  const qc = useQueryClient()
  const locale = useLocale()
  const page = Math.max(1, Number(params.get("page") || 1) || 1)
  const perPage = Math.min(100, Math.max(1, Number(params.get("per_page") || 20) || 20))

  const userQ = useQuery({
    queryKey: ["auth-user"],
    queryFn: () => api<{ id: number; role?: string }>("/api/v1/auth/user"),
    staleTime: 60_000,
  })

  const q = useQuery({
    queryKey: ["account", "notifications", "inbox", page, perPage],
    queryFn: () =>
      api<{ items: NotificationRow[]; total: number; unread: number; page: number; per_page: number }>(
        `/api/v1/account/notifications?page=${page}&per_page=${perPage}`,
      ),
  })

  const markOne = useMutation({
    mutationFn: (id: number) =>
      api(`/api/v1/account/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["account", "notifications"] }),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const markAll = useMutation({
    mutationFn: () => api("/api/v1/account/notifications", { method: "POST" }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["account", "notifications"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const items = q.data?.items ?? []
  const total = q.data?.total ?? 0
  const unread = q.data?.unread ?? 0

  function setPage(next: number, nextPerPage = perPage) {
    const sp = new URLSearchParams(params.toString())
    sp.set("page", String(next))
    sp.set("per_page", String(nextPerPage))
    router.replace(`/dashboard/notifications?${sp.toString()}`)
  }

  const typeLabel = (type: string) => (t.has(`types.${type}`) ? t(`types.${type}`) : null)

  function openNotification(row: NotificationRow) {
    if (!row.read) void markOne.mutateAsync(row.id)
    const target = toNotificationNavPath(row.link, userQ.data?.role ?? "admin")
    if (target) {
      if (target.startsWith("/")) {
        router.push(target)
        return
      }
      window.location.assign(target)
    }
  }

  return (
    <PageShell title={t("title")} description={t("subtitle")}>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" asChild>
          <Link href={dashboardPath("settings/site/notifications")}>
            <Settings className="size-4" />
            {t("settings_link")}
          </Link>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={markAll.isPending || unread === 0}
          onClick={() => void markAll.mutateAsync()}
        >
          {t("mark_all_read")}
        </Button>
      </div>
      {unread > 0 ? (
        <p className="text-muted-foreground mb-4 text-sm">{t("unread_count", { count: unread })}</p>
      ) : null}

      <div className="space-y-4">
        {q.isError ? (
          <QueryErrorState onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
        ) : items.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Bell className="text-muted-foreground size-10 opacity-40" />
              <p className="text-muted-foreground text-sm">{t("empty")}</p>
            </CardContent>
          </Card>
        ) : (
          items.map((row) => (
            <Card
              key={row.id}
              className={cn(
                "cursor-pointer shadow-sm transition-colors hover:border-primary/30",
                !row.read && "border-primary/20 bg-muted/20",
              )}
              onClick={() => openNotification(row)}
            >
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardDescription className="text-xs">
                      {formatDisplayDateTime(row.created_at, locale)}
                      {row.type && typeLabel(row.type) ? (
                        <span className="ms-2 inline-flex">
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {typeLabel(row.type)}
                          </Badge>
                        </span>
                      ) : null}
                    </CardDescription>
                    <CardTitle className="text-lg leading-snug">{row.title}</CardTitle>
                  </div>
                  {!row.read ? (
                    <Badge variant="default" className="shrink-0">
                      {t("unread_badge")}
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              {row.body ? (
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-wrap text-sm leading-relaxed">
                    {row.body}
                  </p>
                  {row.link ? (
                    <p className="text-primary mt-3 text-sm font-medium">{t("open_action")}</p>
                  ) : null}
                </CardContent>
              ) : null}
            </Card>
          ))
        )}
      </div>

      {!q.isLoading && !q.isError ? (
        <PostsPagination
          className="mt-6"
          page={page}
          perPage={perPage}
          found={total}
          onPageChange={(n) => setPage(n)}
          onPerPageChange={(n) => setPage(1, n)}
        />
      ) : null}
    </PageShell>
  )
}
