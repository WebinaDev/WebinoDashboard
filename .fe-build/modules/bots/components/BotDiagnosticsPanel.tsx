"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { FormSettingsSkeleton } from "@/components/TableListSkeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { BotSection } from "../lib/bot-admin-ui"
import type { BotConnectionStatus } from "../lib/bot-settings"
import type { LiveBotProvider } from "../lib/platforms"

type OutboxRow = { id: number; chat_id: string; method: string; status: string; attempts: number; last_error: string | null }

export function BotDiagnosticsPanel({ provider }: { provider: LiveBotProvider }) {
  const t = useTranslations("bots")
  const qc = useQueryClient()
  const [chatId, setChatId] = useState("")
  const [testText, setTestText] = useState(() => t("settings.testTextDefault"))

  const healthQ = useQuery({
    queryKey: ["bots", provider, "connection-status"],
    queryFn: () => api<BotConnectionStatus>(`/api/v1/bots/${provider}/connection-status`),
    retry: false,
  })

  const outboxQ = useQuery({
    queryKey: ["bots", provider, "outbox"],
    queryFn: () => api<{ data: OutboxRow[]; meta?: Record<string, unknown> }>(`/api/v1/bots/${provider}/outbox?status=dead`),
  })

  const send = useMutation({
    mutationFn: () =>
      api(`/api/v1/bots/${provider}/send`, {
        method: "POST",
        json: { chat_id: chatId, type: "text", text: testText },
      }),
    onSuccess: () => toast.success(t("diagnostics.sendOk")),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const retry = useMutation({
    mutationFn: (id: number) => api(`/api/v1/bots/${provider}/outbox/${id}/retry`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bots", provider, "outbox"] }),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const health = healthQ.data
  const rows = outboxQ.data?.data ?? []

  return (
    <div className="space-y-4">
      <BotSection title={t("diagnostics.healthTitle")} description={t("diagnostics.healthHint")}>
        {healthQ.isLoading ? (
          <FormSettingsSkeleton cards={1} fieldsPerCard={2} />
        ) : health ? (
          <div className="space-y-1 text-sm">
            <p>
              {health.ok
                ? t("connection.healthOk", { user: health.bot?.username ?? "—" })
                : t("connection.healthFail", { error: health.error ?? "—" })}
            </p>
            <p className="text-muted-foreground break-all text-xs" dir="ltr">
              {t("connection.currentUrl")}: {health.webhook?.url || t("connection.notSet")}
            </p>
            <Button size="sm" variant="outline" onClick={() => void healthQ.refetch()}>
              {t("connection.refresh")}
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{t("connection.healthUnavailable")}</p>
        )}
      </BotSection>

      <BotSection title={t("settings.testSend")} description={t("diagnostics.testHint")}>
        <div className="grid max-w-xl gap-3">
          <div className="space-y-1">
            <Label>{t("settings.chatId")}</Label>
            <Input dir="ltr" value={chatId} onChange={(e) => setChatId(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("broadcast.text")}</Label>
            <Input value={testText} onChange={(e) => setTestText(e.target.value)} />
          </div>
          <Button disabled={send.isPending || !chatId} onClick={() => send.mutate()}>
            {t("settings.testSend")}
          </Button>
        </div>
      </BotSection>

      <BotSection title={t("engine.outbox")} description={t("engine.outboxHint")}>
        {rows.length ? (
          rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border-b py-1 text-sm">
              <span dir="ltr" className="truncate text-xs">
                {r.chat_id} · {r.method} · {r.attempts}× · {r.last_error ?? ""}
              </span>
              <Button size="sm" variant="outline" onClick={() => retry.mutate(r.id)}>
                {t("engine.retry")}
              </Button>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground text-sm">{t("engine.outboxEmpty")}</p>
        )}
      </BotSection>
    </div>
  )
}
