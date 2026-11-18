"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { ScrollTable } from "@/components/ScrollTable"
import { FormSettingsSkeleton } from "@/components/TableListSkeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, type ApiListPayload } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatDisplayDateTime } from "@/lib/format-date"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"

import { BotSection, textareaClass } from "../lib/bot-admin-ui"
import type { BotDashboardStats } from "../lib/bot-settings"
import type { LiveBotProvider } from "../lib/platforms"
import { BotLogsPanel } from "./BotLogsPanel"

type SessionRow = { id: number; chat_id: string; user_id?: number | null; last_seen_at?: string | null }
type ChannelPost = {
  id: number
  text: string | null
  status: string
  source: string
  last_error: string | null
}

export function BotReportsPanel({ provider }: { provider: LiveBotProvider }) {
  const t = useTranslations("bots")
  const locale = normalizeUiLocale(useLocale())
  const qc = useQueryClient()
  const [postText, setPostText] = useState("")
  const [productId, setProductId] = useState("")
  const [blogPostId, setBlogPostId] = useState("")

  const statsQ = useQuery({
    queryKey: ["bots", provider, "dashboard-stats"],
    queryFn: () => api<BotDashboardStats>(`/api/v1/bots/${provider}/dashboard-stats`),
  })

  const sessionsQ = useQuery({
    queryKey: ["bots", provider, "sessions"],
    queryFn: () => api<ApiListPayload<SessionRow[]>>(`/api/v1/bots/${provider}/sessions?per_page=20`),
  })

  const postsQ = useQuery({
    queryKey: ["bots", provider, "channel-posts"],
    queryFn: () => api<ApiListPayload<ChannelPost[]>>(`/api/v1/bots/${provider}/channel-posts`),
  })

  const createPost = useMutation({
    mutationFn: () =>
      api(`/api/v1/bots/${provider}/channel-posts`, {
        method: "POST",
        json: {
          text: postText || null,
          product_id: productId ? Number(productId) : null,
          blog_post_id: blogPostId ? Number(blogPostId) : null,
          publish_now: true,
        },
      }),
    onSuccess: async () => {
      setPostText("")
      setProductId("")
      setBlogPostId("")
      toast.success(t("engine.publishNow"))
      await qc.invalidateQueries({ queryKey: ["bots", provider, "channel-posts"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const act = useMutation({
    mutationFn: ({ id, op }: { id: number; op: "publish" | "delete" }) =>
      op === "delete"
        ? api(`/api/v1/bots/${provider}/channel-posts/${id}`, { method: "DELETE" })
        : api(`/api/v1/bots/${provider}/channel-posts/${id}/publish`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bots", provider, "channel-posts"] }),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const d = statsQ.data
  const sessions = sessionsQ.data?.data ?? []
  const posts = postsQ.data?.data ?? []

  return (
    <div className="space-y-4">
      <BotSection title={t("reports.summaryTitle")} description={t("reports.summaryHint")}>
        {statsQ.isLoading ? (
          <FormSettingsSkeleton cards={1} fieldsPerCard={3} />
        ) : (
          <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <li>
              {t("overview.stats.sessions")}: {formatNumber(d?.sessions_total ?? 0, locale)}
            </li>
            <li>
              {t("overview.stats.sessions24h")}: {formatNumber(d?.sessions_24h ?? 0, locale)}
            </li>
            <li>
              {t("overview.stats.logs24h")}: {formatNumber(d?.logs_24h ?? 0, locale)}
            </li>
            <li>
              {t("overview.stats.failed24h")}: {formatNumber(d?.logs_failed_24h ?? 0, locale)}
            </li>
            <li>
              {t("overview.stats.outboxDead")}: {formatNumber(d?.outbox_dead ?? 0, locale)}
            </li>
            <li>
              {t("overview.stats.channelPosts")}: {formatNumber(d?.channel_posts ?? 0, locale)}
            </li>
          </ul>
        )}
      </BotSection>

      <BotSection title={t("reports.sessionsTitle")} description={t("reports.sessionsHint")}>
        <ScrollTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-xs">
                <th className="p-2 text-start">{t("logs.colChat")}</th>
                <th className="p-2 text-start">{t("logs.colTime")}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={2} className="text-muted-foreground p-3">
                    {t("reports.sessionsEmpty")}
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-2 font-mono text-xs" dir="ltr">
                      {s.chat_id}
                    </td>
                    <td className="p-2 text-xs">
                      {s.last_seen_at ? formatDisplayDateTime(s.last_seen_at, locale) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ScrollTable>
      </BotSection>

      <BotSection title={t("engine.posts")} description={t("reports.postsHint")}>
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <textarea className={textareaClass} value={postText} onChange={(e) => setPostText(e.target.value)} placeholder={t("engine.postText")} />
          <div className="space-y-2">
            <Input dir="ltr" value={productId} onChange={(e) => setProductId(e.target.value)} placeholder={t("engine.productId")} />
            <Input
              dir="ltr"
              value={blogPostId}
              onChange={(e) => setBlogPostId(e.target.value)}
              placeholder={t("engine.blogPostId")}
            />
            <Button
              disabled={createPost.isPending || (!postText && !productId && !blogPostId)}
              onClick={() => createPost.mutate()}
            >
              {t("engine.publishNow")}
            </Button>
          </div>
        </div>
        <ul className="divide-y text-sm">
          {posts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 flex-1 truncate">
                {p.text ?? "—"}{" "}
                <span className="text-muted-foreground text-xs">
                  ({t.has(`engine.status.${p.status}`) ? t(`engine.status.${p.status}`) : p.status})
                </span>
              </span>
              <span className="flex gap-1">
                {p.status !== "published" ? (
                  <Button size="sm" variant="outline" onClick={() => act.mutate({ id: p.id, op: "publish" })}>
                    {t("engine.publishNow")}
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: p.id, op: "delete" })}>
                  {t("engine.delete")}
                </Button>
              </span>
            </li>
          ))}
          {!posts.length ? <li className="text-muted-foreground py-2">{t("engine.empty")}</li> : null}
        </ul>
      </BotSection>

      <BotSection title={t("logs.title")}>
        <BotLogsPanel provider={provider} />
      </BotSection>
    </div>
  )
}
