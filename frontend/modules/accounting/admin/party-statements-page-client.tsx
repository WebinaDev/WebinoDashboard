"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { MoneyText } from "@/components/currency/MoneyDisplay"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useLocaleNext } from "@/hooks/use-locale-next"

/**
 * کارت حساب اشخاص — what each customer or supplier owes, with a statement of account.
 *
 * The chart of accounts knew that 1,240,000 sat in receivables but not whose it was: journals
 * carry an account, never a person. The balance here is derived from the documents that do name
 * a person, so the statement and the AR aging report cannot disagree.
 */

type Party = {
  id: number
  name: string
  mobile: string | null
  type: string
  credit_limit: number
  is_blocked: boolean
  balance_minor: number
  available_minor: number
  over_limit: boolean
}

type StatementEntry = { date: string; kind: string; reference: string | null; description: string | null; debit: number; credit: number; balance: number }

type Statement = {
  person: { id: number; name: string; credit_limit: number; is_blocked: boolean } | null
  opening_balance: number
  closing_balance: number
  credit_limit: number
  available: number
  entries: StatementEntry[]
}

export default function PartyStatementsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("accounting_parties")
  const tCommon = useTranslations("common")
  const { formatNumber } = useLocaleNext()
  const queryClient = useQueryClient()

  const [selected, setSelected] = useState<number | null>(null)
  const [limitDraft, setLimitDraft] = useState("")

  const parties = useQuery({
    queryKey: ["acc-parties"],
    queryFn: async () => (await api<{ data: { parties: Party[] } }>("/api/v1/erp-accounting/parties"))?.data?.parties ?? [],
    retry: false,
  })

  const statement = useQuery({
    queryKey: ["acc-statement", selected],
    enabled: selected !== null,
    queryFn: async () => (await api<{ data: Statement }>(`/api/v1/erp-accounting/parties/${selected}/statement`))?.data ?? null,
    retry: false,
  })

  const update = useMutation({
    mutationFn: (payload: { credit_limit?: number; is_blocked?: boolean }) =>
      api(`/api/v1/erp-accounting/parties/${selected}`, { method: "PATCH", json: payload }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["acc-parties"] }),
        queryClient.invalidateQueries({ queryKey: ["acc-statement"] }),
      ])
      toast.success(t("updated"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const rows = parties.data ?? []
  const active = rows.find((party) => party.id === selected) ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>

      <section className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-2 text-start">{t("name")}</th>
                  <th className="p-2 text-start">{t("mobile")}</th>
                  <th className="p-2 text-end">{t("balance")}</th>
                  <th className="p-2 text-end">{t("credit_limit")}</th>
                  <th className="p-2 text-end">{t("available")}</th>
                  <th className="p-2 text-start">{t("status")}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2">{row.name}</td>
                    <td className="p-2" dir="ltr">{row.mobile ?? "—"}</td>
                    <td className="p-2 text-end tabular-nums"><MoneyText amount={Math.round(row.balance_minor)} /></td>
                    <td className="p-2 text-end tabular-nums">{formatNumber(row.credit_limit)}</td>
                    <td className="p-2 text-end tabular-nums">{formatNumber(row.available_minor)}</td>
                    <td className="p-2">
                      {row.is_blocked ? (
                        <Badge variant="destructive">{t("blocked")}</Badge>
                      ) : row.over_limit ? (
                        <Badge variant="destructive">{t("over_limit")}</Badge>
                      ) : (
                        <Badge variant="outline">{t("ok")}</Badge>
                      )}
                    </td>
                    <td className="p-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(row.id)
                          setLimitDraft(String(row.credit_limit))
                        }}
                      >
                        {t("statement")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {active ? (
        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">{t("statement_title", { name: active.name })}</h2>
            <p className="text-muted-foreground text-sm">
              {t("closing")}:{" "}
              <span className="tabular-nums">
                <MoneyText amount={Math.round(statement.data?.closing_balance ?? active.balance_minor)} />
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-limit">{t("credit_limit")}</Label>
              <Input
                id="p-limit"
                type="number"
                min={0}
                inputMode="numeric"
                value={limitDraft}
                onChange={(e) => setLimitDraft(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">{t("limit_hint")}</p>
            </div>
            <Button disabled={update.isPending} onClick={() => update.mutate({ credit_limit: Number(limitDraft) })}>
              {update.isPending ? tCommon("saving") : t("save_limit")}
            </Button>
            <Button
              variant="outline"
              disabled={update.isPending}
              onClick={() => update.mutate({ is_blocked: !active.is_blocked })}
            >
              {active.is_blocked ? t("unblock") : t("block")}
            </Button>
          </div>

          {(statement.data?.entries.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">{t("no_entries")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-start">{t("date")}</th>
                    <th className="p-2 text-start">{t("document")}</th>
                    <th className="p-2 text-end">{t("debit")}</th>
                    <th className="p-2 text-end">{t("credit")}</th>
                    <th className="p-2 text-end">{t("balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(statement.data?.entries ?? []).map((entry, index) => (
                    <tr key={`${entry.date}-${entry.reference ?? index}`} className="border-t">
                      <td className="p-2 tabular-nums">{entry.date}</td>
                      <td className="p-2">
                        {t(`kind_${entry.kind}`) === `kind_${entry.kind}` ? entry.kind : t(`kind_${entry.kind}`)}
                        {entry.reference ? <span className="text-muted-foreground ms-2 text-xs" dir="ltr">{entry.reference}</span> : null}
                      </td>
                      <td className="p-2 text-end tabular-nums">
                        {entry.debit > 0 ? <MoneyText amount={Math.round(entry.debit)} /> : "—"}
                      </td>
                      <td className="p-2 text-end tabular-nums">
                        {entry.credit > 0 ? <MoneyText amount={Math.round(entry.credit)} /> : "—"}
                      </td>
                      <td className="p-2 text-end tabular-nums"><MoneyText amount={Math.round(entry.balance)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
