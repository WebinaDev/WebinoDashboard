"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { fmtDate } from "@/views/settings/panels/marketplace/MarketplaceShared"

type QueueView = {
  active: boolean
  pending_count: number
  pending: { product_id: number; page_url: string; date_modified: string | null; updated_at?: string }[]
  has_token: boolean
}

export function TorobToolsPanel() {
  const t = useTranslations("marketplace_admin")
  const locale = useLocale()
  const qc = useQueryClient()
  const [format, setFormat] = useState<"v3" | "legacy">("v3")

  const queue = useQuery({
    queryKey: ["torob-queue"],
    queryFn: () => api<QueueView>("/api/v1/marketplace/torob/queue"),
    refetchInterval: 15_000,
  })
  const flush = useMutation({
    mutationFn: () => api<{ sent: number; status: number }>("/api/v1/marketplace/torob/queue/flush", { method: "POST" }),
    onSuccess: (res) => {
      if (res.status === 200 || res.sent > 0) toast.success(t("torob.flushed", { count: res.sent }))
      else toast.error(t("torob.flush_failed", { status: res.status }))
      void qc.invalidateQueries({ queryKey: ["torob-queue"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const reset = useMutation({
    mutationFn: () => api("/api/v1/marketplace/torob/reset-token", { method: "POST" }),
    onSuccess: () => {
      toast.success(t("torob.token_reset"))
      void qc.invalidateQueries({ queryKey: ["torob-queue"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const preview = useMutation({
    mutationFn: (f: "v3" | "legacy") => api<{ format: string; total: number; products: unknown[] }>(`/api/v1/marketplace/torob/preview?format=${f}&limit=5`),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const q = queue.data
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("torob.webhook")}</CardTitle>
          <CardDescription>{t("torob.webhook_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant={q?.active ? "secondary" : "outline"}>{q?.active ? t("torob.webhook_active") : t("torob.webhook_inactive")}</Badge>
            <Badge variant={q?.has_token ? "secondary" : "outline"}>{q?.has_token ? t("torob.token_received") : t("torob.token_missing")}</Badge>
            <Badge variant="outline">{t("torob.pending", { count: q?.pending_count ?? 0 })}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={flush.isPending || !q?.pending_count} onClick={() => flush.mutate()}>
              {t("torob.flush_now")}
            </Button>
            <Button
              variant="ghost"
              disabled={reset.isPending || !q?.has_token}
              onClick={() => {
                if (window.confirm(t("torob.confirm_reset"))) reset.mutate()
              }}
            >
              {t("torob.reset_token")}
            </Button>
          </div>
          {q?.pending?.length ? (
            <ul className="max-h-64 space-y-1 overflow-auto text-xs">
              {q.pending.map((p) => (
                <li key={p.product_id} className="flex flex-wrap gap-2 rounded border px-2 py-1">
                  <span className="font-medium">#{p.product_id}</span>
                  <code dir="ltr" className="min-w-0 flex-1 truncate">{p.page_url}</code>
                  <span className="text-muted-foreground">{fmtDate(p.date_modified, locale)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("torob.preview")}</CardTitle>
          <CardDescription>{t("torob.preview_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["v3", "legacy"] as const).map((f) => (
              <Button key={f} size="sm" variant={format === f ? "default" : "outline"} onClick={() => setFormat(f)}>
                {f === "v3" ? "API v3" : t("torob.legacy")}
              </Button>
            ))}
            <Button size="sm" variant="outline" disabled={preview.isPending} onClick={() => preview.mutate(format)}>
              {t("torob.load_preview")}
            </Button>
          </div>
          {preview.data ? (
            <pre dir="ltr" className="bg-muted max-h-96 overflow-auto rounded p-2 text-xs">
              {JSON.stringify(preview.data, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
