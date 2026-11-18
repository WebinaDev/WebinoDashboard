"use client"

import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"

import { BotSection } from "../lib/bot-admin-ui"

const PLANNED = [
  "connection",
  "tokens",
  "admins",
  "features",
  "texts",
  "broadcast",
  "campaigns",
  "notifications",
  "referral",
  "page-builder",
  "reports",
] as const

export function BotScaffoldPanel({ platform }: { platform: string }) {
  const t = useTranslations("bots")

  return (
    <div className="space-y-4">
      <BotSection
        title={t("scaffold.title", { platform: t(`platforms.${platform}`) })}
        description={t("scaffold.hint")}
        badge={t("hub.soon")}
      >
        <p className="text-muted-foreground text-sm">{t("scaffold.body")}</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PLANNED.map((id) => (
            <li
              key={id}
              className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border/80 px-3 py-2 text-sm"
            >
              <span>{t(`sections.${id}`)}</span>
              <Badge variant="secondary">{t("hub.soon")}</Badge>
            </li>
          ))}
        </ul>
      </BotSection>
    </div>
  )
}
