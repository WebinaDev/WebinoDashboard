"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { FormSettingsSkeleton } from "@/components/TableListSkeleton"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { BotSection, textareaClass } from "../lib/bot-admin-ui"
import type { BotSettings } from "../lib/bot-settings"
import { settingsPath } from "../lib/bot-settings"
import type { LiveBotProvider } from "../lib/platforms"

const MENU_KEYS = ["store", "search", "cart", "orders", "account", "loyalty", "faq", "support", "wishlist", "sale"] as const

export function BotPageBuilderPanel({ provider }: { provider: LiveBotProvider }) {
  const t = useTranslations("bots")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [menu, setMenu] = useState<Record<string, boolean>>({})
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [homeBlocks, setHomeBlocks] = useState("")

  const q = useQuery({
    queryKey: ["bots", provider, "settings"],
    queryFn: () => api<BotSettings>(settingsPath(provider)),
  })

  useEffect(() => {
    if (!q.data) return
    const pb = (q.data.meta?.page_builder ?? {}) as Record<string, unknown>
    const m = (pb.menu ?? {}) as Record<string, boolean>
    const next: Record<string, boolean> = {}
    for (const k of MENU_KEYS) next[k] = m[k] !== false
    setMenu(next)
    setLabels({ ...((pb.labels as Record<string, string>) ?? {}) })
    setHomeBlocks(String(pb.home_blocks ?? ""))
  }, [q.data])

  const save = useMutation({
    mutationFn: () =>
      api(settingsPath(provider), {
        method: "PUT",
        json: {
          meta: {
            ...(q.data?.meta ?? {}),
            page_builder: {
              menu,
              labels,
              home_blocks: homeBlocks,
            },
          },
        },
      }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await qc.invalidateQueries({ queryKey: ["bots", provider, "settings"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (q.isLoading) return <FormSettingsSkeleton cards={2} fieldsPerCard={4} />

  return (
    <div className="space-y-4">
      <BotSection title={t("pageBuilder.title")} description={t("pageBuilder.hint")} badge={t("hub.uiOnly")}>
        <div className="grid gap-2 sm:grid-cols-2">
          {MENU_KEYS.map((k) => (
            <div key={k} className="rounded-lg border border-border/70 p-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={menu[k] !== false}
                  onCheckedChange={(v) => setMenu((prev) => ({ ...prev, [k]: Boolean(v) }))}
                />
                {t(`pageBuilder.menu.${k}`)}
              </label>
              <Input
                className="mt-2"
                placeholder={t("pageBuilder.customLabel")}
                value={labels[k] ?? ""}
                onChange={(e) => setLabels((prev) => ({ ...prev, [k]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </BotSection>

      <BotSection title={t("pageBuilder.homeTitle")} description={t("pageBuilder.homeHint")} badge={t("hub.uiOnly")}>
        <div className="space-y-1">
          <Label>{t("pageBuilder.homeBlocks")}</Label>
          <textarea
            className={textareaClass}
            value={homeBlocks}
            onChange={(e) => setHomeBlocks(e.target.value)}
            placeholder={t("pageBuilder.homeBlocksPh")}
          />
        </div>
      </BotSection>

      <Button disabled={save.isPending} onClick={() => save.mutate()}>
        {tCommon("save")}
      </Button>
    </div>
  )
}
