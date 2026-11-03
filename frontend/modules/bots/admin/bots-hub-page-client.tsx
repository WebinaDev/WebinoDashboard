"use client"

import { useQueries } from "@tanstack/react-query"
import Link from "next/link"
import { useTranslations } from "next-intl"

import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { dashboardPath } from "@/kernel/paths"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"

import { BotSection } from "../lib/bot-admin-ui"
import type { BotSettings } from "../lib/bot-settings"
import { BOT_PLATFORMS, isLiveBotProvider } from "../lib/platforms"

export default function BotsHubPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("bots")

  const live = BOT_PLATFORMS.filter((p) => p.live)
  const queries = useQueries({
    queries: live.map((p) => ({
      queryKey: ["bots", p.id, "settings"],
      queryFn: () => api<BotSettings>(`/api/v1/bots/${p.id}/settings`),
    })),
  })

  return (
    <PageShell title={t("hub.title")} description={t("hub.description")}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {BOT_PLATFORMS.map((p) => {
          const liveIdx = live.findIndex((x) => x.id === p.id)
          const settings = liveIdx >= 0 ? queries[liveIdx]?.data : undefined
          const loading = liveIdx >= 0 && queries[liveIdx]?.isLoading
          return (
            <BotSection
              key={p.id}
              title={t(`platforms.${p.id}`)}
              description={p.live ? t("hub.liveHint") : t("hub.soonHint")}
              badge={p.live ? (settings?.enabled ? t("overview.enabled") : t("overview.disabled")) : t("hub.soon")}
              actions={
                <Button asChild size="sm" variant={p.live ? "default" : "outline"}>
                  <Link href={dashboardPath(`bots/${p.id}`)}>{p.live ? t("hub.open") : t("hub.preview")}</Link>
                </Button>
              }
            >
              {p.live ? (
                <ul className="text-muted-foreground space-y-1 text-xs">
                  <li>
                    {t("settings.token")}:{" "}
                    {loading ? "…" : settings?.has_token ? t("hub.tokenSet") : t("overview.noToken")}
                  </li>
                  <li dir="ltr" className="truncate font-mono">
                    {settings?.meta?.bot_username ? `@${String(settings.meta.bot_username)}` : "—"}
                  </li>
                </ul>
              ) : (
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">{t("hub.scaffold")}</Badge>
                </div>
              )}
            </BotSection>
          )
        })}
      </div>

      <BotSection title={t("hub.parityTitle")} description={t("hub.parityHint")} className="mt-4">
        <p className="text-muted-foreground text-sm">
          {t("hub.parityBody", {
            live: BOT_PLATFORMS.filter((p) => isLiveBotProvider(p.id))
              .map((p) => t(`platforms.${p.id}`))
              .join(" · "),
          })}
        </p>
      </BotSection>
    </PageShell>
  )
}
