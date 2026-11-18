"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { dashboardPath } from "@/kernel/paths"
import { cn } from "@/lib/utils"

import { BOT_PLATFORMS, isLiveBotProvider, type BotPlatformId } from "../lib/platforms"
import { BOT_SECTION_GROUPS, BOT_SECTIONS, botSectionHref, type BotSectionId } from "../lib/sections"

export function BotWorkspaceShell({
  platform,
  section,
  title,
  description,
  actions,
  children,
}: {
  platform: BotPlatformId | string
  section: BotSectionId
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const t = useTranslations("bots")
  const pathname = usePathname()
  const live = isLiveBotProvider(platform)

  return (
    <PageShell title={title} description={description ?? t("description")} actions={actions}>
      <div className="mb-5 space-y-3 rounded-xl border border-border/70 bg-card/60 p-3 shadow-soft">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={dashboardPath("bots")}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
              pathname === dashboardPath("bots")
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/80 text-muted-foreground hover:text-foreground",
            )}
          >
            {t("hub.title")}
          </Link>
          {BOT_PLATFORMS.map((p) => {
            const href = dashboardPath(`bots/${p.id}`)
            const active = platform === p.id
            return (
              <Link
                key={p.id}
                href={href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/80 text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`platforms.${p.id}`)}
                {!p.live ? (
                  <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                    {t("hub.soon")}
                  </Badge>
                ) : null}
              </Link>
            )
          })}
        </div>

        {live ? (
          <div className="space-y-2.5 border-t border-border/60 pt-2.5">
            {BOT_SECTION_GROUPS.map((group) => (
              <div key={group.id} className="space-y-1.5">
                <p className="text-muted-foreground px-0.5 text-[11px] font-medium tracking-wide uppercase">
                  {t(group.labelKey)}
                </p>
                <nav className="flex flex-wrap gap-1.5">
                  {BOT_SECTIONS.filter((s) => s.group === group.id).map(({ id, icon: Icon }) => {
                    const href = dashboardPath(botSectionHref(platform, id))
                    const active = section === id
                    return (
                      <Link
                        key={id}
                        href={href}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/80 bg-card text-muted-foreground hover:border-border hover:text-foreground",
                        )}
                      >
                        <Icon className="size-3.5 shrink-0 opacity-80" />
                        {t(`sections.${id}`)}
                      </Link>
                    )
                  })}
                </nav>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-4">{children}</div>
    </PageShell>
  )
}
