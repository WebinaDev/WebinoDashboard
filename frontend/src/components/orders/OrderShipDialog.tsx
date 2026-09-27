"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ORDER_SHIP_BRANCHES, orderStatusEnumKey } from "../../../modules/commerce/lib/order-statuses"
import { useEnumLabel } from "@/lib/enum-labels"

export type ShipPayload = {
  tracking_code: string
  tracking_url?: string
  carrier?: string
  status?: string
  notify_sms?: boolean
}

export function OrderShipDialog({
  open,
  onOpenChange,
  initialCode = "",
  initialUrl = "",
  onSubmit,
  pending,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialCode?: string
  initialUrl?: string
  onSubmit: (payload: ShipPayload) => void
  pending?: boolean
}) {
  const t = useTranslations("orders_admin")
  const enumLabel = useEnumLabel()
  const [code, setCode] = useState(initialCode)
  const [url, setUrl] = useState(initialUrl)
  const [carrier, setCarrier] = useState("webino-post")
  const [notifySms, setNotifySms] = useState(true)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("ship_dialog_title")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label>{t("tracking_code")}</Label>
            <Input className="mt-1" value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" />
          </div>
          <div>
            <Label>{t("tracking_url")}</Label>
            <Input className="mt-1" value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" />
          </div>
          <div>
            <Label>{t("carrier")}</Label>
            <select
              className="border-input bg-background mt-1 h-9 w-full rounded-md border px-3 text-sm"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
            >
              {ORDER_SHIP_BRANCHES.map((s) => (
                <option key={s} value={s}>
                  {enumLabel("order_status", orderStatusEnumKey(s))}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={notifySms} onCheckedChange={(v) => setNotifySms(v === true)} />
            {t("notify_sms")}
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={pending || !code.trim()}
            onClick={() =>
              onSubmit({
                tracking_code: code.trim(),
                tracking_url: url.trim() || undefined,
                carrier,
                status: carrier,
                notify_sms: notifySms,
              })
            }
          >
            {t("ship_submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
