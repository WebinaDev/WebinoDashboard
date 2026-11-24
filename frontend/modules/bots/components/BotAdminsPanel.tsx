"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useId, useState } from "react"
import { toast } from "sonner"

import { FormSettingsSkeleton } from "@/components/TableListSkeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { BotSection } from "../lib/bot-admin-ui"
import type { BotSettings } from "../lib/bot-settings"
import { asAdminIds, parseAdminIds, settingsPath } from "../lib/bot-settings"
import type { LiveBotProvider } from "../lib/platforms"

export function BotAdminsPanel({ provider }: { provider: LiveBotProvider }) {
  const t = useTranslations("bots")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const inputId = useId()
  const [draft, setDraft] = useState<{ provider: LiveBotProvider; value: string } | null>(null)

  const q = useQuery({
    queryKey: ["bots", provider, "settings"],
    queryFn: () => api<BotSettings>(settingsPath(provider)),
  })

  const admins = draft?.provider === provider ? draft.value : asAdminIds(q.data?.meta?.admin_chat_ids)

  const save = useMutation({
    mutationFn: () =>
      api(settingsPath(provider), {
        method: "PUT",
        json: {
          meta: {
            ...(q.data?.meta ?? {}),
            admin_chat_ids: parseAdminIds(admins),
          },
        },
      }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await qc.invalidateQueries({ queryKey: ["bots", provider, "settings"] })
      setDraft((current) => current?.provider === provider ? null : current)
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (q.isLoading) return <FormSettingsSkeleton cards={1} fieldsPerCard={2} />

  return (
    <BotSection title={t("admins.title")} description={t("admins.hint")}>
      <div className="grid max-w-xl gap-3">
        <div className="space-y-1">
          <Label htmlFor={inputId}>{t("engine.admins")}</Label>
          <Input id={inputId} dir="ltr" value={admins} onChange={(e) => setDraft({ provider, value: e.target.value })} placeholder="10001, 10002" />
          <p className="text-muted-foreground text-xs">{t("engine.adminsHint")}</p>
        </div>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {tCommon("save")}
        </Button>
      </div>
    </BotSection>
  )
}
