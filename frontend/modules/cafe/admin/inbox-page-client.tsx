"use client"

import { useQuery } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"

import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { formatDisplayDateTime } from "@/lib/format-date"
import { toLocaleDigits } from "@/lib/locale"

import { CafeAdminShell, CafeEmptyState, CafeSection } from "./cafe-admin-ui"

type Feedback = {
  id: number
  product_name?: string | null
  rating: number
  comment?: string | null
  guest_phone?: string | null
  created_at: string
}
type Like = { product_id: number; product_name?: string | null; likes_count: number }

export default function InboxPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.inbox")
  const locale = useLocale()
  const { data: feedback = [] } = useQuery({
    queryKey: ["cafe-feedback"],
    queryFn: () => api<Feedback[]>("/api/v1/cafe/feedback"),
  })
  const { data: likes = [] } = useQuery({
    queryKey: ["cafe-likes"],
    queryFn: () => api<Like[]>("/api/v1/cafe/likes"),
  })

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      <div className="grid gap-5 lg:grid-cols-2">
        <CafeSection title={t("feedback_heading")}>
          {feedback.length === 0 ? (
            <CafeEmptyState message={t("empty_feedback")} />
          ) : (
            <div className="space-y-2">
              {feedback.map((row) => (
                <div key={row.id} className="rounded-lg border px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{row.product_name || "—"}</p>
                    <span className="text-muted-foreground text-xs" dir="ltr">
                      {toLocaleDigits(String(row.rating), locale)}/5
                    </span>
                  </div>
                  {row.comment ? <p className="mt-1 leading-relaxed">{row.comment}</p> : null}
                  <p className="text-muted-foreground mt-1 text-xs">
                    {row.guest_phone ? <span dir="ltr">{toLocaleDigits(row.guest_phone, locale)}</span> : null}
                    {row.guest_phone ? " · " : null}
                    {formatDisplayDateTime(row.created_at, locale)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CafeSection>

        <CafeSection title={t("likes_heading")}>
          {likes.length === 0 ? (
            <CafeEmptyState message={t("empty_likes")} />
          ) : (
            <div className="space-y-2">
              {likes.map((row) => (
                <div key={row.product_id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate font-medium">{row.product_name || "—"}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums" dir="ltr">
                    {toLocaleDigits(String(row.likes_count), locale)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CafeSection>
      </div>
    </CafeAdminShell>
  )
}
