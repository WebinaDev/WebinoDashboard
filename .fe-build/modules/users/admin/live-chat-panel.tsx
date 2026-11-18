"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type ChatMessage = {
  id: number
  sender_type: string
  body: string
  created_at?: string | null
}

type ChatSession = {
  id: number
  status: string
  guest_name?: string | null
  guest_email?: string | null
  agent_name?: string | null
  department_name?: string | null
  ticket_id?: number | null
  last_message_at?: string | null
  messages?: ChatMessage[]
}

export function LiveChatPanel() {
  const t = useTranslations("online_support")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [body, setBody] = useState("")
  const [afterId, setAfterId] = useState(0)

  const list = useQuery({
    queryKey: ["support", "chat", "sessions"],
    queryFn: () => api<{ items: ChatSession[]; realtime?: { poll_ms?: number } }>("/api/v1/support/chat/sessions"),
    refetchInterval: 4000,
  })

  const detail = useQuery({
    queryKey: ["support", "chat", "session", selectedId],
    enabled: selectedId != null,
    queryFn: () => api<{ session: ChatSession }>(`/api/v1/support/chat/sessions/${selectedId}`),
  })

  const session = detail.data?.session
  const messages = useMemo(() => {
    const base = session?.messages ?? []
    return base
  }, [session])

  useEffect(() => {
    if (!selectedId) return
    const maxId = Math.max(0, ...(messages.map((m) => m.id) || [0]))
    setAfterId(maxId)
  }, [selectedId, messages])

  useEffect(() => {
    if (!selectedId) return
    const timer = window.setInterval(() => {
      void api<{ messages: ChatMessage[]; session: ChatSession }>(
        `/api/v1/support/chat/sessions/${selectedId}/poll?after_id=${afterId}`,
      ).then((res) => {
        if (res.messages?.length) {
          void qc.invalidateQueries({ queryKey: ["support", "chat", "session", selectedId] })
          void qc.invalidateQueries({ queryKey: ["support", "chat", "sessions"] })
          setAfterId((prev) => Math.max(prev, ...res.messages.map((m) => m.id)))
        }
      })
    }, 2000)
    return () => window.clearInterval(timer)
  }, [selectedId, afterId, qc])

  const accept = useMutation({
    mutationFn: (id: number) => api(`/api/v1/support/chat/sessions/${id}/accept`, { method: "POST", json: {} }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["support", "chat"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const send = useMutation({
    mutationFn: () =>
      api(`/api/v1/support/chat/sessions/${selectedId}/messages`, { method: "POST", json: { body } }),
    onSuccess: () => {
      setBody("")
      void qc.invalidateQueries({ queryKey: ["support", "chat"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const close = useMutation({
    mutationFn: (createTicket: boolean) =>
      api(`/api/v1/support/chat/sessions/${selectedId}/close`, {
        method: "POST",
        json: { create_ticket: createTicket },
      }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["support", "chat"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const items = list.data?.items ?? []

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-2">
        {items.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground p-4 text-sm">{t("live_empty")}</CardContent>
          </Card>
        ) : (
          items.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`w-full rounded-lg border p-3 text-start text-sm transition ${
                selectedId === s.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{s.guest_name || `#${s.id}`}</span>
                <Badge variant={s.status === "waiting" ? "default" : "outline"}>{s.status}</Badge>
              </div>
              <p className="text-muted-foreground mt-1 truncate text-xs">{s.department_name || s.guest_email || "—"}</p>
            </button>
          ))
        )}
      </div>

      <Card className="min-h-[420px]">
        <CardContent className="flex h-full flex-col gap-3 p-4">
          {!selectedId || !session ? (
            <p className="text-muted-foreground text-sm">{t("live_pick")}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div>
                  <p className="font-medium">{session.guest_name || `#${session.id}`}</p>
                  <p className="text-muted-foreground text-xs">
                    {session.agent_name ? `${t("live_agent")}: ${session.agent_name}` : t("live_unassigned")}
                    {session.ticket_id ? ` · ticket #${session.ticket_id}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {session.status === "waiting" ? (
                    <Button type="button" size="sm" onClick={() => void accept.mutateAsync(session.id)}>
                      {t("live_accept")}
                    </Button>
                  ) : null}
                  {session.status !== "closed" ? (
                    <>
                      <Button type="button" size="sm" variant="outline" onClick={() => void close.mutateAsync(false)}>
                        {t("live_close")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void close.mutateAsync(true)}>
                        {t("live_close_ticket")}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      m.sender_type === "agent"
                        ? "ms-auto bg-primary text-primary-foreground"
                        : m.sender_type === "system"
                          ? "mx-auto bg-muted text-muted-foreground text-xs"
                          : "bg-background border"
                    }`}
                  >
                    {m.body}
                  </div>
                ))}
              </div>
              {session.status !== "closed" ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!body.trim()) return
                    void send.mutateAsync()
                  }}
                >
                  <Input
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={t("live_reply_placeholder")}
                  />
                  <Button type="submit" disabled={send.isPending || !body.trim()}>
                    {t("live_send")}
                  </Button>
                </form>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
