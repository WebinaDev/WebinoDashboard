"use client"

import { useQuery } from "@tanstack/react-query"
import { LocaleDatePicker } from "@/components/LocaleDatePicker";
import { useTranslations } from "next-intl"
import { useState } from "react"

import { MoneyText } from "@/components/currency/MoneyDisplay"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { useLocaleNext } from "@/hooks/use-locale-next"

/**
 * خزانه — where the money is, where it went, and what is about to leave.
 *
 * The list of drawers and banks was a phone book, not a balance sheet: it named the accounts
 * and never said what was in them. A balance is a derivation from the ledger, not a column, so
 * it cannot drift from the books.
 *
 * The forecast counts only what is *known* — cheques and supplier bills with dates — and says
 * so on the screen. A projection that invents walk-in sales is a number nobody can act on.
 */

type Account = {
  id: number
  name: string
  type: string
  chart_code: string
  bank_name: string | null
  is_default: boolean
  is_active: boolean
  balance_minor: number
}

type CashFlow = {
  from: string
  to: string
  opening_minor: number
  inflow_minor: number
  outflow_minor: number
  net_minor: number
  closing_minor: number
}

type Bucket = { from: string; to: string; cheques_minor: number; bills_minor: number; total_minor: number }

type Forecast = {
  weeks: Bucket[]
  overdue: { cheques_minor: number; bills_minor: number; total_minor: number }
  total_minor: number
  scope: string
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default function TreasuryPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("accounting_treasury")
  const { locale, formatNumber } = useLocaleNext()

  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return isoDate(d)
  })
  const [to, setTo] = useState(() => isoDate(new Date()))

  const accounts = useQuery({
    queryKey: ["treasury-accounts"],
    queryFn: async () =>
      (await api<{ data: { accounts: Account[]; total_minor: number } }>("/api/v1/erp-accounting/treasury/accounts"))?.data ?? null,
    retry: false,
  })

  const flow = useQuery({
    queryKey: ["treasury-flow", from, to],
    queryFn: async () =>
      (await api<{ data: CashFlow }>(`/api/v1/erp-accounting/treasury/cash-flow?from=${from}&to=${to}`))?.data ?? null,
    retry: false,
  })

  const forecast = useQuery({
    queryKey: ["treasury-forecast"],
    queryFn: async () =>
      (await api<{ data: Forecast }>("/api/v1/erp-accounting/treasury/forecast?weeks=6"))?.data ?? null,
    retry: false,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">{t("accounts_title")}</h2>
          <p className="text-sm">
            {t("total")}:{" "}
            <span className="font-semibold tabular-nums">
              <MoneyText amount={Math.round(accounts.data?.total_minor ?? 0)} />
            </span>
          </p>
        </div>

        {(accounts.data?.accounts.length ?? 0) === 0 ? (
          <p className="text-muted-foreground text-sm">{t("no_accounts")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-2 text-start">{t("account")}</th>
                  <th className="p-2 text-start">{t("type")}</th>
                  <th className="p-2 text-start">{t("chart_code")}</th>
                  <th className="p-2 text-end">{t("balance")}</th>
                </tr>
              </thead>
              <tbody>
                {(accounts.data?.accounts ?? []).map((account) => (
                  <tr key={account.id} className="border-t">
                    <td className="p-2">
                      {account.name}
                      {account.is_default ? <Badge variant="outline" className="ms-2">{t("default")}</Badge> : null}
                      {!account.is_active ? <Badge variant="secondary" className="ms-2">{t("inactive")}</Badge> : null}
                    </td>
                    <td className="p-2">{t.has(`account_type_${account.type}`) ? t(`account_type_${account.type}`) : account.type}</td>
                    <td className="p-2 tabular-nums" dir="ltr">{account.chart_code}</td>
                    <td className="p-2 text-end tabular-nums"><MoneyText amount={Math.round(account.balance_minor)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-medium">{t("flow_title")}</h2>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="tr-from">{t("from")}</Label>
              <LocaleDatePicker locale={locale} id="tr-from" value={from} onChange={(v) => setFrom(v ?? "")} className="w-36" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tr-to">{t("to")}</Label>
              <LocaleDatePicker locale={locale} id="tr-to" value={to} onChange={(v) => setTo(v ?? "")} className="w-36" />
            </div>
          </div>
        </div>

        {flow.data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border p-3">
              <p className="text-muted-foreground text-xs">{t("opening")}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums"><MoneyText amount={Math.round(flow.data.opening_minor)} /></p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-muted-foreground text-xs">{t("inflow")}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-600"><MoneyText amount={Math.round(flow.data.inflow_minor)} /></p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-muted-foreground text-xs">{t("outflow")}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-rose-600"><MoneyText amount={Math.round(flow.data.outflow_minor)} /></p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-muted-foreground text-xs">{t("closing")}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums"><MoneyText amount={Math.round(flow.data.closing_minor)} /></p>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">{t("forecast_title")}</h2>
        <p className="text-muted-foreground text-sm">{t("forecast_hint")}</p>

        {forecast.data ? (
          <>
            {forecast.data.overdue.total_minor > 0 ? (
              <p className="text-destructive text-sm">
                {t("overdue", { amount: formatNumber(Math.round(forecast.data.overdue.total_minor)) })}
              </p>
            ) : null}

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-start">{t("week")}</th>
                    <th className="p-2 text-end">{t("cheques")}</th>
                    <th className="p-2 text-end">{t("bills")}</th>
                    <th className="p-2 text-end">{t("total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.data.weeks.map((week) => (
                    <tr key={week.from} className="border-t">
                      <td className="p-2 tabular-nums" dir="ltr">{week.from} → {week.to}</td>
                      <td className="p-2 text-end tabular-nums"><MoneyText amount={Math.round(week.cheques_minor)} /></td>
                      <td className="p-2 text-end tabular-nums"><MoneyText amount={Math.round(week.bills_minor)} /></td>
                      <td className="p-2 text-end tabular-nums font-medium"><MoneyText amount={Math.round(week.total_minor)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        )}
      </section>
    </div>
  )
}
