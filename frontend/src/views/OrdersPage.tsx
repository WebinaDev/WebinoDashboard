"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { api } from "@/lib/api"
import { formatInteger } from "@/lib/format"
import { normalizeUiLocale } from "@/lib/locale"

type OrderRow = {
  id: number
  status: string
  total_minor: number
  currency: string
  created_at: string
  items?: { id: number; quantity: number; product?: { name: string } }[]
}

const STATUSES = [
  "pending_payment",
  "paid",
  "payment_failed",
  "processing",
  "shipped",
  "cancelled",
] as const

export default function OrdersPage() {
  const t = useTranslations("orders")
  const locale = useLocale()
  const lng = normalizeUiLocale(locale)
  const [rows, setRows] = useState<OrderRow[]>([])
  const [pick, setPick] = useState<OrderRow | null>(null)
  const [status, setStatus] = useState("")

  function reload() {
    api<{ data: OrderRow[] }>("/api/v1/orders")
      .then((r) => setRows(r.data))
      .catch(() => setRows([]))
  }

  useEffect(() => {
    reload()
  }, [])

  useEffect(() => {
    if (pick) {
      setStatus(pick.status)
    }
  }, [pick])

  async function saveOrder() {
    if (!pick) {
      return
    }
    await api(`/api/v1/orders/${pick.id}`, {
      method: "PATCH",
      json: { status },
    })
    setPick(null)
    reload()
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <div className="rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="p-3 text-start font-medium">{t("col_id")}</th>
              <th className="p-3 text-start font-medium">{t("col_status")}</th>
              <th className="p-3 text-start font-medium">{t("col_total")}</th>
              <th className="p-3 text-start font-medium">{t("col_date")}</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="text-muted-foreground p-6" colSpan={5}>
                  {t("empty")}
                </td>
              </tr>
            ) : (
              rows.map((o) => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="p-3 font-mono">#{o.id}</td>
                  <td className="p-3">{o.status}</td>
                  <td className="p-3">
                    {formatInteger(o.total_minor, lng)} {o.currency}
                  </td>
                  <td className="p-3 text-muted-foreground">{o.created_at}</td>
                  <td className="p-3 text-end">
                    <Button type="button" size="sm" variant="secondary" onClick={() => setPick(o)}>
                      {t("detail")}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={pick !== null} onOpenChange={(o) => !o && setPick(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {t("title")} #{pick?.id}
            </SheetTitle>
          </SheetHeader>
          {pick ? (
            <div className="mt-6 flex flex-col gap-4">
              <div className="grid gap-2">
                <Label>{t("status_label")}</Label>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <ul className="text-muted-foreground text-xs space-y-1">
                {(pick.items ?? []).map((li) => (
                  <li key={li.id}>
                    {li.product?.name ?? "—"} × {li.quantity}
                  </li>
                ))}
              </ul>
              <Button type="button" onClick={() => void saveOrder()}>
                {t("save")}
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
