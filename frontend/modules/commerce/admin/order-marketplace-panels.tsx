"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { isMarketplaceChannel, marketplaceLabel } from "@/lib/marketplace"
import { OrderPlatformActions } from "@/views/settings/panels/marketplace/OrderPlatformActions"

type OrderLike = {
  id: number
  sales_channel?: string | null
  meta?: Record<string, unknown> | null
}

type TorobInfo = {
  torob_clid: string | null
  torob_status: string
  fields: Record<string, string>
  explanation: string
}

const TOROB_FIELDS: { key: string; wide?: boolean; ltr?: boolean }[] = [
  { key: "tracking_code", ltr: true },
  { key: "carrier" },
  { key: "shipping_date" },
  { key: "tracking_url", ltr: true, wide: true },
  { key: "processing_stage" },
  { key: "estimated_shipping_date" },
  { key: "review_stage", wide: true },
  { key: "payment_deadline", wide: true },
  { key: "cancel_reason", wide: true },
  { key: "payment_note", wide: true },
  { key: "refund_status" },
  { key: "status_explanation", wide: true },
  { key: "custom_explanation", wide: true },
]

function Section({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card/40">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">{title}</h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function OrderMarketplacePanels({ order }: { order: OrderLike }) {
  const channel = order.sales_channel ?? ""
  return (
    <>
      {isMarketplaceChannel(channel) ? <MarketplaceOrderInfo order={order} /> : null}
      <TorobOrderPanel orderId={order.id} />
    </>
  )
}

function MarketplaceOrderInfo({ order }: { order: OrderLike }) {
  const t = useTranslations("marketplace_admin")
  const locale = useLocale()
  const mk = (order.meta?.marketplace ?? {}) as { platform?: string; remote_order_id?: string; remote_status?: string }
  const platform = mk.platform || order.sales_channel || ""
  return (
    <Section title={t("order.title", { platform: marketplaceLabel(platform, locale) })}>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground text-xs">{t("order.platform")}</dt>
          <dd>
            <Badge variant="secondary">{marketplaceLabel(platform, locale)}</Badge>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{t("remote_order")}</dt>
          <dd className="font-mono" dir="ltr">{mk.remote_order_id || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{t("order.remote_status")}</dt>
          <dd>{mk.remote_status || "—"}</dd>
        </div>
      </dl>
      <OrderPlatformActions platform={platform} orderId={order.id} remoteOrderId={mk.remote_order_id ?? null} meta={order.meta ?? {}} />
    </Section>
  )
}

function TorobOrderPanel({ orderId }: { orderId: number }) {
  const t = useTranslations("marketplace_admin")
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})

  const q = useQuery({
    queryKey: ["torob-order", orderId],
    queryFn: () => api<TorobInfo>(`/api/v1/marketplace/torob/orders/${orderId}`),
    retry: false,
  })
  useEffect(() => {
    if (q.data) setDraft({ ...q.data.fields })
  }, [q.data])

  const save = useMutation({
    mutationFn: () => api<TorobInfo>(`/api/v1/marketplace/torob/orders/${orderId}`, { method: "PUT", json: draft }),
    onSuccess: (data) => {
      qc.setQueryData(["torob-order", orderId], data)
      toast.success(t("torob.order_saved"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (q.error || !q.data) return null
  const info = q.data

  return (
    <Section
      title={t("torob.order_title")}
      actions={
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? t("hide") : t("edit")}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">{info.torob_status}</Badge>
        {info.torob_clid ? (
          <span className="text-muted-foreground text-xs">
            torob_clid: <code dir="ltr">{info.torob_clid}</code>
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">{t("torob.no_clid")}</span>
        )}
      </div>
      <p className="text-muted-foreground mt-2 text-xs">{info.explanation}</p>
      {open ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {TOROB_FIELDS.map((f) => (
              <div key={f.key} className={f.wide ? "grid gap-1 sm:col-span-2" : "grid gap-1"}>
                <Label className="text-xs">{t(`torob.fields.${f.key}`)}</Label>
                <Input dir={f.ltr ? "ltr" : undefined} value={draft[f.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {t("save")}
          </Button>
        </div>
      ) : null}
    </Section>
  )
}
