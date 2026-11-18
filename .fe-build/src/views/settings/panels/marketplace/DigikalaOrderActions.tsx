"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { normalizeUiLocale, toLocaleDigits } from "@/lib/locale"

type DigikalaOrderInfo = {
  remote_order_id: string | null
  fulfillment: string
  native_status: string | null
  shipment_id: string | null
  items: { id?: number; order_item_id?: number; product_variant_title?: string; title?: string; quantity?: number; count?: number }[]
  sbs_actions: string[]
}

/** Digikala order actions: SBS status push with verification code, and item cancellation. */
export function DigikalaOrderActions({ orderId }: { orderId: number }) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const t = useTranslations("marketplace_admin.digikala")
  const locale = normalizeUiLocale(useLocale())
  const qc = useQueryClient()
  const [code, setCode] = useState("")
  const [itemId, setItemId] = useState("")
  const [reason, setReason] = useState("")

  const q = useQuery({
    queryKey: ["digikala-order", orderId],
    queryFn: () => api<DigikalaOrderInfo>(`/api/v1/marketplace/digikala/orders/${orderId}`),
    retry: false,
  })
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["digikala-order", orderId] })
    void qc.invalidateQueries({ queryKey: ["order", orderId] })
  }
  const sbs = useMutation({
    mutationFn: (action: string) =>
      api(`/api/v1/marketplace/digikala/orders/${orderId}/sbs-status`, { method: "POST", json: { action, verification_code: code || null } }),
    onSuccess: () => {
      toast.success(t("status_queued"))
      done()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const cancel = useMutation({
    mutationFn: () =>
      api(`/api/v1/marketplace/digikala/orders/${orderId}/cancel`, {
        method: "POST",
        json: { item_id: itemId ? Number(itemId) : null, cancellation_reason_id: reason ? Number(reason) : null },
      }),
    onSuccess: () => {
      toast.success(t("cancel_queued"))
      done()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const info = q.data
  if (!info) return null
  const isSbs = info.fulfillment === "seller"
  const status = info.native_status ?? ""

  return (
    <div className="mt-4 space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{t("order_actions")}</span>
        <Badge variant="outline">{t(`fulfillment.${isSbs ? "seller" : "digikala"}`)}</Badge>
        {status ? <Badge variant="secondary">{t.has(`native_status.${status}`) ? t(`native_status.${status}`) : status}</Badge> : null}
        {info.shipment_id ? (
          <span className="text-muted-foreground text-xs">
            {t("shipment")}: <code dir="ltr">{info.shipment_id}</code>
          </span>
        ) : null}
      </div>

      {isSbs ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label className="text-xs">{t("verification_code")}</Label>
            <Input dir="ltr" inputMode="numeric" className="w-32" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </div>
          {info.sbs_actions.map((a) => (
            <Button key={a} size="sm" variant={a === "full_delivered_to_customer" ? "default" : "secondary"} disabled={sbs.isPending} onClick={() => sbs.mutate(a)}>
              {t(`sbs.${a}`)}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">{t("warehouse_hint")}</p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        {info.items.length > 1 ? (
          <div className="grid gap-1">
            <Label className="text-xs">{t("cancel_item")}</Label>
            <select className="border-input bg-background h-9 rounded-md border px-2 text-sm" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">{isSbs ? t("first_item") : t("all_items")}</option>
              {info.items.map((it) => {
                const id = it.id ?? it.order_item_id
                return id ? (
                  <option key={id} value={id}>
                    {(it.product_variant_title || it.title || `#${toLocaleDigits(id, locale)}`) + ` × ${toLocaleDigits(it.quantity ?? it.count ?? 1, locale)}`}
                  </option>
                ) : null
              })}
            </select>
          </div>
        ) : null}
        <div className="grid gap-1">
          <Label className="text-xs">{t("cancel_reason_id")}</Label>
          <Input dir="ltr" inputMode="numeric" className="w-24" value={reason} onChange={(e) => setReason(e.target.value.replace(/[^\d-]/g, ""))} />
        </div>
        <Button
          size="sm"
          variant="destructive"
          disabled={cancel.isPending}
          onClick={() => {
            confirm({ intent: "action", description: t("confirm_cancel"), onConfirm: () => cancel.mutateAsync() })
          }}
        >
          {t("cancel_on_digikala")}
        </Button>
      </div>
      {confirmDialog}
    </div>
  )
}
