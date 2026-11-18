"use client"

import { useTranslations } from "next-intl"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { LIVE_BOT_PROVIDERS, type LiveBotProvider } from "../lib/platforms"

export type BotProvider = LiveBotProvider

export function BotProviderSwitcher({
  provider,
  onChange,
}: {
  provider: BotProvider
  onChange: (p: BotProvider) => void
}) {
  const t = useTranslations("bots")
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Label>{t("provider")}</Label>
      <div className="w-48">
        <Select value={provider} onValueChange={(v) => onChange(v as BotProvider)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LIVE_BOT_PROVIDERS.map((id) => (
              <SelectItem key={id} value={id}>
                {t(`platforms.${id}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
