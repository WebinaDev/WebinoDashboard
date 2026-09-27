"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { PostsPagination } from "@/components/PostsPagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatDate, normalizeUiLocale } from "@/lib/locale"

type ReviewRow = {
  id: number
  rating: number
  body?: string | null
  admin_reply?: string | null
  author_name?: string | null
  status: string
  verified_buyer?: boolean
  created_at?: string
  product?: { id: number; name: string; slug?: string | null } | null
}

type ReviewsPayload = {
  data: ReviewRow[]
  meta?: {
    current_page: number
    last_page: number
    per_page: number
    total: number
    counts?: Record<string, number>
  }
}

const TABS = ["all", "pending", "approved", "spam", "trash"] as const

export default function CommentsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("product_reviews_admin")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const lng = normalizeUiLocale(locale)
  const qc = useQueryClient()
  const [status, setStatus] = useState<(typeof TABS)[number]>("pending")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [replyDraft, setReplyDraft] = useState<Record<number, string>>({})

  const q = useQuery({
    queryKey: ["product-reviews", "admin", status, search, page],
    queryFn: () => {
      const p = new URLSearchParams({
        status,
        page: String(page),
        per_page: "20",
      })
      if (search.trim()) p.set("search", search.trim())
      return api<ReviewsPayload>(`/api/v1/product-reviews?${p.toString()}`)
    },
  })

  const counts = q.data?.meta?.counts ?? {}
  const rows = q.data?.data ?? []
  const meta = q.data?.meta

  const moderate = useMutation({
    mutationFn: (payload: { id: number; status?: string; admin_reply?: string }) =>
      api(`/api/v1/product-reviews/${payload.id}`, {
        method: "PATCH",
        json: {
          ...(payload.status ? { status: payload.status } : {}),
          ...(payload.admin_reply !== undefined ? { admin_reply: payload.admin_reply } : {}),
        },
      }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["product-reviews"] })
      void qc.invalidateQueries({ queryKey: ["dashboard-overview"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const tabLabel = useMemo(
    () =>
      ({
        all: t("tab_all"),
        pending: t("tab_pending"),
        approved: t("tab_approved"),
        spam: t("tab_spam"),
        trash: t("tab_trash"),
      }) as Record<(typeof TABS)[number], string>,
    [t],
  )

  return (
    <PageShell title={t("title")} description={t("subtitle")}>
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const countKey = tab === "pending" ? "pending" : tab
          const n = counts[countKey] ?? counts[tab === "pending" ? "hold" : tab]
          return (
            <Button
              key={tab}
              type="button"
              size="sm"
              variant={status === tab ? "default" : "outline"}
              onClick={() => {
                setStatus(tab)
                setPage(1)
              }}
            >
              {tabLabel[tab]}
              {typeof n === "number" ? ` (${n})` : ""}
            </Button>
          )
        })}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="max-w-sm"
          placeholder={t("search_ph")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
      </div>

      <div className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          rows.map((row) => (
            <Card key={row.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {row.author_name || t("anonymous")} · {row.rating}/5
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {row.product?.name ? (
                        <Link
                          href={`/dashboard/products/${row.product.id}`}
                          className="text-primary hover:underline"
                        >
                          {row.product.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {row.created_at
                        ? ` · ${formatDate(row.created_at, lng, { dateStyle: "short", timeStyle: "short" })}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {row.verified_buyer ? (
                      <Badge variant="secondary">{t("verified_buyer")}</Badge>
                    ) : null}
                    <Badge variant="outline">{row.status}</Badge>
                  </div>
                </div>
                {row.body ? <p className="text-sm whitespace-pre-wrap">{row.body}</p> : null}
                <div className="space-y-2">
                  <Textarea
                    rows={2}
                    placeholder={t("reply_ph")}
                    value={replyDraft[row.id] ?? row.admin_reply ?? ""}
                    onChange={(e) =>
                      setReplyDraft((prev) => ({ ...prev, [row.id]: e.target.value }))
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={moderate.isPending}
                      onClick={() =>
                        void moderate.mutateAsync({
                          id: row.id,
                          admin_reply: replyDraft[row.id] ?? row.admin_reply ?? "",
                        })
                      }
                    >
                      {t("save_reply")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={moderate.isPending}
                      onClick={() => void moderate.mutateAsync({ id: row.id, status: "approved" })}
                    >
                      {t("approve")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={moderate.isPending}
                      onClick={() => void moderate.mutateAsync({ id: row.id, status: "spam" })}
                    >
                      {t("spam")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={moderate.isPending}
                      onClick={() => void moderate.mutateAsync({ id: row.id, status: "trash" })}
                    >
                      {t("trash")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {meta && meta.total > 0 ? (
        <PostsPagination
          className="mt-4"
          page={meta.current_page}
          perPage={meta.per_page || 20}
          found={meta.total}
          onPageChange={setPage}
          showPerPageSelector={false}
        />
      ) : null}
    </PageShell>
  )
}
