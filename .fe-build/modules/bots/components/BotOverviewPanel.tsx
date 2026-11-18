"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Cable, Megaphone, Radio, ScrollText, Settings2 } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { ListStatsStrip } from "@/components/ListStatsStrip"
import { FormSettingsSkeleton } from "@/components/TableListSkeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { dashboardPath } from "@/kernel/paths"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"

import { BotSection, BotTwoColumn } from "../lib/bot-admin-ui"
import type { BotDashboardStats, BotSettings } from "../lib/bot-settings"
import { settingsPath } from "../lib/bot-settings"
import type { LiveBotProvider } from "../lib/platforms"
import { botSectionHref } from "../lib/sections"

export function BotOverviewPanel({ provider }: { provider: LiveBotProvider }) {
  const t = useTranslations("bots")
  const tCommon = useTranslations("common")
  const locale = normalizeUiLocale(useLocale())
  const qc = useQueryClient()

  const settingsQ = useQuery({
    queryKey: ["bots", provider, "settings"],
    queryFn: () => api<BotSettings>(settingsPath(provider)),
  })

  const statsQ = useQuery({
    queryKey: ["bots", provider, "dashboard-stats"],
    queryFn: () => api<BotDashboardStats>(`/api/v1/bots/${provider}/dashboard-stats`),
  })

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api(settingsPath(provider), {
        method: "PUT",
        json: { enabled, meta: settingsQ.data?.meta ?? {} },
      }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["bots", provider, "settings"] }),
        qc.invalidateQueries({ queryKey: ["bots", provider, "dashboard-stats"] }),
      ])
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (settingsQ.isLoading || statsQ.isLoading) return <FormSettingsSkeleton cards={2} fieldsPerCard={4} />

  const s = settingsQ.data
  const d = statsQ.data
  const username = d?.bot_username || (s?.meta?.bot_username as string | undefined)

  const links = [
    { section: "connection" as const, icon: Cable, label: t("sections.connection") },
    { section: "features" as const, icon: Settings2, label: t("sections.features") },
    { section: "broadcast" as const, icon: Megaphone, label: t("sections.broadcast") },
    { section: "campaigns" as const, icon: Radio, label: t("sections.campaigns") },
    { section: "logs" as const, icon: ScrollText, label: t("sections.logs") },
  ]

  return (
    <div className="space-y-4">
      <BotSection title={t("overview.statusTitle")} description={t("overview.statusHint")}>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={Boolean(s?.enabled)}
              disabled={toggle.isPending}
              onCheckedChange={(v) => toggle.mutate(Boolean(v))}
            />
            <Label className="cursor-pointer font-normal">{t("settings.enabled")}</Label>
          </label>
          <Badge variant={s?.enabled ? "default" : "secondary"}>
            {s?.enabled ? t("overview.enabled") : t("overview.disabled")}
          </Badge>
          {username ? (
            <span className="text-muted-foreground font-mono text-xs" dir="ltr">
              @{username}
            </span>
          ) : null}
          {!s?.has_token ? <Badge variant="destructive">{t("overview.noToken")}</Badge> : null}
        </div>
      </BotSection>

      <ListStatsStrip
        items={[
          { id: "sessions", label: t("overview.stats.sessions"), value: d?.sessions_total ?? 0 },
          { id: "s24", label: t("overview.stats.sessions24h"), value: d?.sessions_24h ?? 0 },
          { id: "logs", label: t("overview.stats.logs24h"), value: d?.logs_24h ?? 0 },
          { id: "failed", label: t("overview.stats.failed24h"), value: d?.logs_failed_24h ?? 0 },
          { id: "outbox", label: t("overview.stats.outboxDead"), value: d?.outbox_dead ?? 0 },
          { id: "posts", label: t("overview.stats.channelPosts"), value: d?.channel_posts ?? 0 },
        ]}
      />

      <BotTwoColumn>
        <BotSection title={t("overview.quickLinks")}>
          <div className="flex flex-wrap gap-2">
            {links.map(({ section, icon: Icon, label }) => (
              <Button key={section} asChild size="sm" variant="outline">
                <Link href={dashboardPath(botSectionHref(provider, section))}>
                  <Icon className="size-4" />
                  {label}
                </Link>
              </Button>
            ))}
          </div>
        </BotSection>
        <BotSection title={t("overview.activityTitle")} description={t("overview.activityHint")}>
          <ul className="text-muted-foreground space-y-1.5 text-sm">
            <li>
              {t("overview.broadcast")}:{" "}
              {d?.broadcast_active ? t("overview.broadcastActive") : t("overview.broadcastIdle")}
            </li>
            <li>
              {t("overview.campaignsRunning")}: {formatNumber(d?.campaigns_running ?? 0, locale)}
            </li>
          </ul>
        </BotSection>
      </BotTwoColumn>
    </div>
  )
}
