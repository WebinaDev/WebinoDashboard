"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api } from "@/lib/api"
import { formatDate, normalizeUiLocale } from "@/lib/locale"
import { isStaffRole, toNotificationNavPath } from "@/lib/notification-links"
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

type NotificationsPayload = {
  items: NotificationRow[]
  total: number
  unread: number
}

type AuthUser = {
  id: number
  role?: string
}

export function NotificationBell() {
  const t = useTranslations("notifications_hub")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const lng = normalizeUiLocale(locale)
  const router = useRouter()
  const qc = useQueryClient()

  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: () => api<AuthUser>("/api/v1/auth/user"),
    staleTime: 60_000,
  })

  const isAdmin = isStaffRole(user?.role)
  const inboxPath = isAdmin
    ? "/dashboard/notifications"
    : "/dashboard/account/notifications"

  const q = useQuery({
    queryKey: ["account", "notifications", "header"],
    queryFn: () =>
      api<NotificationsPayload>("/api/v1/account/notifications?page=1"),
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  })

  const markOne = useMutation({
    mutationFn: (id: number) =>
      api(`/api/v1/account/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["account", "notifications"] })
    },
  })

  const items = (q.data?.items ?? []).slice(0, 8)
  const unread = q.data?.unread ?? 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative"
          aria-label={t("bell_label")}
        >
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>{t("bell_title")}</span>
          {unread > 0 ? (
            <span className="text-xs text-muted-foreground">
              {t("unread_count", { count: unread })}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          items.map((row) => (
            <DropdownMenuItem
              key={row.id}
              className={cn(
                "flex cursor-pointer flex-col items-stretch gap-0.5 py-2",
                !row.read && "bg-muted/40",
              )}
              onSelect={(e) => {
                e.preventDefault()
                if (!row.read) void markOne.mutateAsync(row.id)
                const target = toNotificationNavPath(row.link, user?.role)
                if (target.startsWith("/")) {
                  router.push(target)
                  return
                }
                if (target) window.location.assign(target)
              }}
            >
              <span className="truncate text-sm font-medium">{row.title}</span>
              {row.body ? (
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {row.body}
                </span>
              ) : null}
              <span className="text-[10px] text-muted-foreground">
                {row.created_at
                  ? formatDate(row.created_at, lng, { dateStyle: "short", timeStyle: "short" })
                  : tCommon("em_dash")}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={inboxPath}>{t("view_all")}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
