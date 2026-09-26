"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { fmtDate, selectClass } from "@/views/settings/panels/marketplace/MarketplaceShared"

type BasalamOrderInfo = {
  invoice_id: number
  remote_status: string | null
  status_key: string | null
  tracking_code: string | null
  shipping_method_id: number | null
  items: Record<string, unknown>[]
  customer: Record<string, unknown> | null
  cancel_reasons: Record<string, string>
  shipping_methods: Record<string, string>
  last_sync_at: string | null
}

type Panel = "cancel" | "cancel_request" | "delay" | "tracking" | null

/** Basalam order actions: confirm, cancel, cancel request, delay, tracking code and resync. */
export function BasalamOrderActions({ orderId }: { orderId: number }) {
  const t = useTranslations("marketplace_admin.basalam")
  const locale = useLocale()
  const qc = useQueryClient()
  const [panel, setPanel] = useState<Panel>(null)
  const [reasonId, setReasonId] = useState("3481")
  const [description, setDescription] = useState("")
  const [days, setDays] = useState("3")
  const [tracking, setTracking] = useState("")
  const [phone, setPhone] = useState("")
  const [method, setMethod] = useState("3197")

  const q = useQuery({
    queryKey: ["basalam-order", orderId],
    queryFn: () => api<BasalamOrderInfo>(`/api/v1/marketplace/basalam/orders/${orderId}`),
    retry: false,
  })
  useEffect(() => {
    const d = q.data
    if (!d) return
    setTracking(d.tracking_code ?? "")
    if (d.shipping_method_id) setMethod(String(d.shipping_method_id))
    const c = d.customer ?? {}
    const mobile = c.mobile ?? c.phone ?? c.phone_number
    if (typeof mobile === "string") setPhone(mobile)
  }, [q.data])

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: Record<string, unknown> }) =>
      api(`/api/v1/marketplace/basalam/orders/${orderId}/${path}`, { method: "POST", json: body ?? {} }),
    onSuccess: () => {
      toast.success(t("done"))
      setPanel(null)
      setDescription("")
      void qc.invalidateQueries({ queryKey: ["basalam-order", orderId] })
      void qc.invalidateQueries({ queryKey: ["order", orderId] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (q.isLoading) return <p className="text-muted-foreground text-xs">{t("loading")}</p>
  if (q.error) return <p className="text-destructive text-xs">{getApiErrorMessage(q.error)}</p>
  const d = q.data
  if (!d) return null
  const toggle = (p: Panel) => setPanel(panel === p ? null : p)

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span>
          {t("invoice")}: <code dir="ltr">{d.invoice_id}</code>
        </span>
        {d.status_key ? <Badge variant="secondary">{t.has(`status_keys.${d.status_key}`) ? t(`status_keys.${d.status_key}`) : d.status_key}</Badge> : null}
        {d.tracking_code ? (
          <span>
            {t("tracking")}: <code dir="ltr">{d.tracking_code}</code>
          </span>
        ) : null}
        <span className="text-muted-foreground">{fmtDate(d.last_sync_at, locale)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ path: "confirm" })}>
          {t("order_confirm")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => toggle("tracking")}>
          {t("order_tracking")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => toggle("delay")}>
          {t("order_delay")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => toggle("cancel_request")}>
          {t("order_cancel_request")}
        </Button>
        <Button size="sm" variant="outline" className="text-destructive" onClick={() => toggle("cancel")}>
          {t("order_cancel")}
        </Button>
        <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ path: "resync" })}>
          {t("order_resync")}
        </Button>
      </div>

      {panel === "tracking" ? (
        <div className="grid max-w-xl gap-2 rounded-md border p-3 sm:grid-cols-3">
          <div className="grid gap-1">
            <Label className="text-xs">{t("tracking_code")}</Label>
            <Input dir="ltr" value={tracking} onChange={(e) => setTracking(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">{t("phone")}</Label>
            <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">{t("shipping_method")}</Label>
            <select className={selectClass} value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(d.shipping_methods).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            className="sm:col-span-3 sm:justify-self-start"
            disabled={act.isPending || !tracking.trim() || !phone.trim()}
            onClick={() => act.mutate({ path: "tracking", body: { tracking_code: tracking.trim(), phone: phone.trim(), shipping_method: Number(method) } })}
          >
            {t("submit")}
          </Button>
        </div>
      ) : null}

      {panel === "delay" ? (
        <div className="grid max-w-xl gap-2 rounded-md border p-3">
          <Label className="text-xs">{t("postpone_days")}</Label>
          <Input className="w-32" type="number" min={1} max={60} dir="ltr" value={days} onChange={(e) => setDays(e.target.value)} />
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("description")} />
          <Button size="sm" className="justify-self-start" disabled={act.isPending || !(Number(days) > 0)} onClick={() => act.mutate({ path: "delay", body: { postpone_days: Number(days), description } })}>
            {t("submit")}
          </Button>
        </div>
      ) : null}

      {panel === "cancel_request" ? (
        <div className="grid max-w-xl gap-2 rounded-md border p-3">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("description")} />
          <Button size="sm" className="justify-self-start" disabled={act.isPending} onClick={() => act.mutate({ path: "cancel-request", body: { description } })}>
            {t("submit")}
          </Button>
        </div>
      ) : null}

      {panel === "cancel" ? (
        <div className="grid max-w-xl gap-2 rounded-md border p-3">
          <Label className="text-xs">{t("cancel_reason")}</Label>
          <select className={selectClass} value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
            {Object.entries(d.cancel_reasons).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("description")} />
          <Button
            size="sm"
            variant="destructive"
            className="justify-self-start"
            disabled={act.isPending}
            onClick={() => {
              if (window.confirm(t("confirm_cancel_order"))) act.mutate({ path: "cancel", body: { reason_id: Number(reasonId), description } })
            }}
          >
            {t("order_cancel")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
