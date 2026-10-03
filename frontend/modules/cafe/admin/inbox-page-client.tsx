"use client"

import { useQuery } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { formatDisplayDateTime } from "@/lib/format-date"

type Feedback = { id: number; product_name?: string | null; rating: number; comment?: string | null; guest_phone?: string | null; created_at: string }
type Like = { product_id: number; product_name?: string | null; likes_count: number }

export default function InboxPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.inbox")
  const locale = useLocale()
  const { data: feedback = [] } = useQuery({ queryKey: ["cafe-feedback"], queryFn: () => api<Feedback[]>("/api/v1/cafe/feedback") })
  const { data: likes = [] } = useQuery({ queryKey: ["cafe-likes"], queryFn: () => api<Like[]>("/api/v1/cafe/likes") })

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("feedback_heading")}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {feedback.length === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : null}
            {feedback.map((row) => (
              <div key={row.id} className="rounded-lg border p-3">
                <p className="font-medium">{row.product_name} · {row.rating}/5</p>
                {row.comment ? <p>{row.comment}</p> : null}
                <p className="text-muted-foreground text-xs">{row.guest_phone || ""} {formatDisplayDateTime(row.created_at, locale)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("likes_heading")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {likes.length === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : null}
            {likes.map((row) => (
              <div key={row.product_id} className="flex justify-between rounded-lg border p-3">
                <span>{row.product_name}</span>
                <span>{row.likes_count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
