"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Megaphone } from "lucide-react"
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
import { formatDate, formatNumber, normalizeUiLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"

export type ErpAnnouncement = {
  id: number | string
  title: string
  body: string
  created_at: string
  audience: string
  read: boolean
}

type AnnouncementsPayload = {
  items: ErpAnnouncement[]
  total: number
  unread: number
}

const AUDIENCE_KEYS = {
  all: "audience_all",
  staff: "audience_staff",
  admins: "audience_admins",
} as const

export function AnnouncementInbox() {
  const t = useTranslations("erp_announcements")
  const locale = normalizeUiLocale(useLocale())
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ["account", "erp-announcements"],
    queryFn: () => api<AnnouncementsPayload>("/api/v1/account/announcements"),
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  })

  const markOne = useMutation({
    mutationFn: (id: number | string) =>
      api(`/api/v1/account/announcements/${encodeURIComponent(String(id))}/read`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["account", "erp-announcements"] })
    },
  })

  const markAll = useMutation({
    mutationFn: () => api("/api/v1/account/announcements/read", { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["account", "erp-announcements"] })
    },
  })

  const items = q.isError ? [] : (q.data?.items ?? []).slice(0, 8)
  const unread = q.isError ? 0 : (q.data?.unread ?? 0)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative"
          aria-label={t("bell_label")}
          data-testid="erp-announcements-bell"
        >
          <Megaphone className="size-4" />
          {unread > 0 ? (
            <span className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {unread > 99 ? formatNumber(99, locale) + "+" : formatNumber(unread, locale)}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>{t("bell_title")}</span>
          {unread > 0 ? (
            <button
              type="button"
              className="text-xs font-normal text-primary"
              onClick={() => void markAll.mutateAsync()}
            >
              {t("mark_all_read")}
            </button>
          ) : null}
        </DropdownMenuLabel>
        {unread > 0 ? (
          <p className="px-2 pb-1 text-xs text-muted-foreground">
            {t("unread_count", { count: formatNumber(unread, locale) })}
          </p>
        ) : null}
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          items.map((row) => {
            const audienceKey = AUDIENCE_KEYS[row.audience as keyof typeof AUDIENCE_KEYS]
            return (
              <DropdownMenuItem
                key={String(row.id)}
                className={cn(
                  "flex cursor-pointer flex-col items-stretch gap-0.5 py-2",
                  !row.read && "bg-muted/40",
                )}
                onSelect={(event) => {
                  event.preventDefault()
                  if (!row.read) void markOne.mutateAsync(row.id)
                }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{row.title}</span>
                  {audienceKey ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground">{t(audienceKey)}</span>
                  ) : null}
                </span>
                {row.body ? (
                  <span className="line-clamp-2 text-xs text-muted-foreground">{row.body}</span>
                ) : null}
                <span className="text-[10px] text-muted-foreground">
                  {formatDate(row.created_at, locale, { dateStyle: "short", timeStyle: "short" })}
                </span>
              </DropdownMenuItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
