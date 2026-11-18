"use client"

import { useMutation } from "@tanstack/react-query"
import { MessageSquare } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

export type SendMessageUser = {
  id: number
  name?: string | null
  phone?: string | null
  email?: string | null
  bot_providers?: string[] | null
}

type Channel = "sms" | "email" | "bale" | "telegram"

export function SendUserMessageDialog({
  user,
  open,
  onOpenChange,
}: {
  user: SendMessageUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("users_admin")
  const tCommon = useTranslations("common")
  const [channel, setChannel] = useState<Channel>("sms")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")

  const channels = useMemo(() => {
    if (!user) return [] as { id: Channel; label: string; disabled: boolean }[]
    const bots = new Set((user.bot_providers ?? []).map(String))
    return [
      { id: "sms" as const, label: t("message_channel_sms"), disabled: !user.phone },
      { id: "email" as const, label: t("message_channel_email"), disabled: !user.email },
      { id: "bale" as const, label: t("message_channel_bale"), disabled: !bots.has("bale") },
      { id: "telegram" as const, label: t("message_channel_telegram"), disabled: !bots.has("telegram") },
    ]
  }, [user, t])

  const send = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; message?: string | null }>(`/api/v1/users/${user!.id}/send-message`, {
        method: "POST",
        json: {
          channel,
          subject: channel === "email" ? subject : undefined,
          body,
        },
      }),
    onSuccess: (res) => {
      if (res?.ok) {
        toast.success(t("message_sent"))
        setBody("")
        setSubject("")
        onOpenChange(false)
      } else {
        toast.error(res?.message || t("message_failed"))
      }
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e) || t("message_failed")),
  })

  if (!open || !user) return null

  const active = channels.find((c) => c.id === channel)
  const canSend = Boolean(body.trim()) && !active?.disabled

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="bg-background w-full max-w-md rounded-xl border p-4 shadow-lg">
        <div className="mb-3 flex items-center gap-2">
          <MessageSquare className="size-4" />
          <h2 className="font-semibold">{t("message_title")}</h2>
        </div>
        <p className="text-muted-foreground mb-3 text-sm">{user.name || `#${user.id}`}</p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("message_channel")}</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id} disabled={c.disabled}>
                  {c.label}
                  {c.disabled ? ` (${t("message_unavailable")})` : ""}
                </option>
              ))}
            </select>
          </div>
          {channel === "email" ? (
            <div className="space-y-1">
              <Label>{t("message_subject")}</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          ) : null}
          <div className="space-y-1">
            <Label>{t("message_body")}</Label>
            <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("message_body_ph")} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="button" disabled={!canSend || send.isPending} onClick={() => send.mutate()}>
              {t("message_send")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SendUserMessageButton({
  user,
  size = "sm",
  variant = "outline",
}: {
  user: SendMessageUser
  size?: "sm" | "icon" | "default"
  variant?: "outline" | "ghost" | "secondary" | "default"
}) {
  const t = useTranslations("users_admin")
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" size={size} variant={variant} title={t("message_title")} onClick={() => setOpen(true)}>
        {size === "icon" ? <MessageSquare className="size-4" /> : t("message_action")}
      </Button>
      <SendUserMessageDialog user={user} open={open} onOpenChange={setOpen} />
    </>
  )
}
