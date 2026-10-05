"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatDisplayDateTime } from "@/lib/format-date"
import { toLocaleDigits } from "@/lib/locale"

type Mode = "cash" | "installment"

type Bill = {
  id: string
  kind?: string
  title?: string
  amount_minor: number
  currency?: string
  status?: string
}

type Gateway = {
  id: string
  label: string
  enabled: boolean
  modes: string[]
  fee_percent: number
}

type PaymentRow = {
  id: number
  bill_title?: string | null
  bill_kind?: string | null
  gateway: string
  mode: string
  base_minor: number
  fee_percent: number
  fee_minor: number
  total_minor: number
  currency?: string
  status: string
  created_at?: string | null
}

type Outstanding = {
  source?: string
  bills: Bill[]
  gateways: Gateway[]
  payments: PaymentRow[]
}

const KINDS = ["sms", "invoice", "marketplace", "other"] as const

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("platform_billing")
  const locale = useLocale()
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Record<string, { mode: Mode; gateway: string }>>({})

  const q = useQuery({
    queryKey: ["platform-billing"],
    queryFn: () => api<Outstanding>("/api/v1/billing/outstanding"),
  })

  const pay = useMutation({
    mutationFn: (body: { bill_id: string; mode: Mode; gateway: string }) =>
      api<{ payment: { redirect_url?: string | null } }>("/api/v1/billing/payments", {
        method: "POST",
        json: body,
      }),
    onSuccess: (res) => {
      const url = res.payment?.redirect_url
      if (url?.startsWith("http")) {
        window.location.assign(url)
      }
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const gateways = q.data?.gateways ?? []
  const bills = q.data?.bills ?? []
  const grouped = useMemo(() => {
    const buckets: Record<string, Bill[]> = { sms: [], invoice: [], marketplace: [], other: [] }
    for (const bill of bills) {
      const kind = bill.kind && buckets[bill.kind] ? bill.kind : "other"
      buckets[kind].push(bill)
    }
    return buckets
  }, [bills])

  function selection(bill: Bill): { mode: Mode; gateway: string } {
    const current = picked[bill.id]
    if (current) return current
    const cash = gateways.find((g) => g.modes.includes("cash"))
    const installment = gateways.find((g) => g.modes.includes("installment"))
    return {
      mode: cash ? "cash" : "installment",
      gateway: (cash ?? installment)?.id ?? "",
    }
  }

  function quote(bill: Bill, gatewayId: string) {
    const gateway = gateways.find((g) => g.id === gatewayId)
    const percent = gateway?.fee_percent ?? 0
    const fee = Math.round((bill.amount_minor * percent) / 100)
    return { percent, fee, total: bill.amount_minor + fee }
  }

  return (
    <PageShell title={t("title")} description={t("hint")}>
      {q.data?.source === "stub" ? <p className="text-muted-foreground text-sm">{t("source_stub")}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {q.isError ? <p className="text-destructive text-sm">{getApiErrorMessage(q.error)}</p> : null}

      <h2 className="text-base font-medium">{t("outstanding")}</h2>
      {KINDS.map((kind) => (
        <section key={kind} className="space-y-3">
          <h3 className="text-sm font-medium">{t(`kind_${kind}` as "kind_sms")}</h3>
          {grouped[kind].length === 0 ? <p className="text-muted-foreground text-sm">{t("empty")}</p> : null}
          {grouped[kind].map((bill) => {
            const sel = selection(bill)
            const modeGateways = gateways.filter((g) => g.modes.includes(sel.mode))
            const activeGateway = modeGateways.some((g) => g.id === sel.gateway) ? sel.gateway : (modeGateways[0]?.id ?? "")
            const amounts = quote(bill, activeGateway)
            return (
              <Card key={bill.id}>
                <CardHeader>
                  <CardTitle className="text-base">{bill.title || t("empty")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>{t("base")}</span>
                      <MoneyDisplay amount={bill.amount_minor} currency={bill.currency ?? "IRT"} />
                    </div>
                    <div className="flex justify-between">
                      <span>
                        {t("fee")} {toLocaleDigits(amounts.percent, locale)}
                        {locale === "fa" ? "٪" : "%"}
                      </span>
                      <MoneyDisplay amount={amounts.fee} currency={bill.currency ?? "IRT"} />
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>{t("total")}</span>
                      <MoneyDisplay amount={amounts.total} currency={bill.currency ?? "IRT"} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={sel.mode === "cash" ? "default" : "outline"}
                      onClick={() =>
                        setPicked((prev) => ({
                          ...prev,
                          [bill.id]: { mode: "cash", gateway: gateways.find((g) => g.modes.includes("cash"))?.id ?? "" },
                        }))
                      }
                    >
                      {t("cash")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={sel.mode === "installment" ? "default" : "outline"}
                      onClick={() =>
                        setPicked((prev) => ({
                          ...prev,
                          [bill.id]: {
                            mode: "installment",
                            gateway: gateways.find((g) => g.modes.includes("installment"))?.id ?? "",
                          },
                        }))
                      }
                    >
                      {t("installment")}
                    </Button>
                  </div>
                  {modeGateways.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t("no_gateway")}</p>
                  ) : (
                    <label className="block text-sm">
                      <span className="text-muted-foreground mb-1 block">{t("gateway")}</span>
                      <select
                        className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                        value={activeGateway}
                        onChange={(e) =>
                          setPicked((prev) => ({ ...prev, [bill.id]: { mode: sel.mode, gateway: e.target.value } }))
                        }
                      >
                        {modeGateways.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <Button
                    type="button"
                    disabled={!activeGateway || pay.isPending}
                    onClick={() => {
                      setError(null)
                      pay.mutate({ bill_id: bill.id, mode: sel.mode, gateway: activeGateway })
                    }}
                  >
                    {t("pay")}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </section>
      ))}

      <h2 className="text-base font-medium">{t("history")}</h2>
      {(q.data?.payments ?? []).length === 0 ? <p className="text-muted-foreground text-sm">{t("empty")}</p> : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-start">
              <th className="p-2 text-start font-medium">{t("col_title")}</th>
              <th className="p-2 text-start font-medium">{t("col_kind")}</th>
              <th className="p-2 text-start font-medium">{t("col_status")}</th>
              <th className="p-2 text-start font-medium">{t("total")}</th>
              <th className="p-2 text-start font-medium">{t("col_when")}</th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.payments ?? []).map((row) => (
              <tr key={row.id} className="border-b">
                <td className="p-2">{row.bill_title || t("empty")}</td>
                <td className="p-2">{t(`kind_${row.bill_kind && ["sms", "invoice", "marketplace"].includes(row.bill_kind) ? row.bill_kind : "other"}` as "kind_other")}</td>
                <td className="p-2">{t(`status_${row.status}` as "status_pending")}</td>
                <td className="p-2">
                  <MoneyDisplay amount={row.total_minor} currency={row.currency ?? "IRT"} />
                </td>
                <td className="p-2">
                  {row.created_at ? formatDisplayDateTime(row.created_at, locale, t("empty")) : t("empty")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </PageShell>
  )
}
