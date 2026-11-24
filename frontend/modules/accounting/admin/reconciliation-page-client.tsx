"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { normalizeListPayload } from "@/lib/list-utils"
import { useLocaleNext } from "@/hooks/use-locale-next"

import apiClient from "@/features/modules/accounting/lib/api-client"
import { getAxiosMessage } from "@/features/modules/accounting/lib/api-helpers"

/**
 * تطبیق بانکی — matching a bank statement against the book.
 *
 * The matching engine existed for months with no caller: no route, no screen, so nobody could
 * perform the one reconciliation any accountant asks for on the first of the month. This screen
 * is the caller. It shows what matched, what only the bank has, what only the book has, and the
 * single number that decides whether the month is closed: the net difference.
 */

type CashAccount = {
  id: number
  name: string
  type: string
  chart_code?: string | null
}

type Movement = {
  id: string | number
  date: string
  amount: number
  type: "credit" | "debit"
  reference_no?: string | null
  description?: string | null
}

type Match = {
  bank_row: Movement
  ledger_row: Movement
  match_type: string
  matched_amount: number
}

type Recon = {
  summary: {
    total_bank_records: number
    total_ledger_records: number
    matched_count: number
    unmatched_bank_count: number
    unmatched_ledger_count: number
    reconciliation_rate_percent: number
    total_matched_amount: number
  }
  matched: Match[]
  unmatched_bank_records: Movement[]
  unmatched_ledger_records: Movement[]
  gaps: {
    statement_net: number
    book_net: number
    net_difference: number
    closing_balance: number
  }
  opening_balance: number
  columns: Record<string, number>
  skipped_rows: { line: number; reason: string }[]
  from: string
  to: string
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default function ReconciliationPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("accounting_reconciliation")
  const { formatNumber } = useLocaleNext()

  const [accounts, setAccounts] = useState<CashAccount[]>([])
  const [accountId, setAccountId] = useState("")
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return isoDate(d)
  })
  const [to, setTo] = useState(() => isoDate(new Date()))
  const [content, setContent] = useState("")
  const [result, setResult] = useState<Recon | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const res = await apiClient.get<unknown>("/v1/erp-accounting/cash-accounts", {
          params: { per_page: 100, active_only: true },
        })
        if (cancelled) return
        const rows = normalizeListPayload(res.data) as unknown as CashAccount[]
        setAccounts(rows)
        // First account preselected: the screen should be usable the moment it opens.
        if (rows.length > 0) setAccountId((current) => current || String(rows[0].id))
      } catch (e) {
        if (!cancelled) setError(getAxiosMessage(e))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const chosen = useMemo(
    () => accounts.find((account) => String(account.id) === accountId) ?? null,
    [accounts, accountId],
  )

  const readFile = useCallback(async (file: File | undefined) => {
    if (!file) return
    setContent(await file.text())
  }, [])

  const run = async () => {
    setBusy(true)
    setError(null)
    setResult(null)

    try {
      const res = await apiClient.post<Recon>("/v1/erp-accounting/cash-accounts/reconcile", {
        cash_account_id: Number(accountId),
        from,
        to,
        content,
      })
      setResult(res.data)
    } catch (e) {
      setError(getAxiosMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const money = (value: number) => formatNumber(value)

  const rowTable = (rows: Movement[], empty: string) =>
    rows.length === 0 ? (
      <p className="text-muted-foreground text-sm">{empty}</p>
    ) : (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="p-2 text-start">{t("date")}</th>
              <th className="p-2 text-start">{t("direction")}</th>
              <th className="p-2 text-end">{t("amount")}</th>
              <th className="p-2 text-start">{t("reference")}</th>
              <th className="p-2 text-start">{t("description")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)} className="border-t">
                <td className="p-2 tabular-nums">{row.date}</td>
                <td className="p-2">
                  <Badge variant={row.type === "credit" ? "default" : "secondary"}>
                    {row.type === "credit" ? t("in") : t("out")}
                  </Badge>
                </td>
                <td className="p-2 text-end tabular-nums">{money(row.amount)}</td>
                <td className="p-2" dir="ltr">
                  {row.reference_no ?? "—"}
                </td>
                <td className="p-2">{row.description ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>

      <section className="space-y-3 rounded-xl border p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="rec-account">{t("account")}</Label>
            <select
              id="rec-account"
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">{t("choose_account")}</option>
              {accounts.map((account) => (
                <option key={account.id} value={String(account.id)}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-from">{t("from")}</Label>
            <Input id="rec-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-to">{t("to")}</Label>
            <Input id="rec-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {/* Without a chart account the ledger cannot be consulted, and an empty result would
            look like a clean reconciliation. Say it before the run, not after. */}
        {chosen && !chosen.chart_code ? (
          <p className="text-destructive text-xs" role="alert">
            {t("no_chart_code")}
          </p>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="rec-file">{t("statement")}</Label>
          <Input
            id="rec-file"
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={(e) => void readFile(e.target.files?.[0])}
          />
          <p className="text-muted-foreground text-xs">{t("statement_hint")}</p>
          <Textarea
            rows={6}
            dir="ltr"
            className="font-mono text-xs"
            placeholder={t("statement_placeholder")}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy || content.trim() === "" || accountId === ""} onClick={() => void run()}>
            {busy ? t("running") : t("run")}
          </Button>
          {result ? (
            <span className="text-muted-foreground text-xs">
              {t("range_note", { from: result.from, to: result.to })}
            </span>
          ) : null}
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {result ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("matched_count")} value={formatNumber(result.summary.matched_count)} />
            <Stat label={t("rate")} value={`${formatNumber(result.summary.reconciliation_rate_percent)}٪`} />
            <Stat label={t("unmatched_bank")} value={formatNumber(result.summary.unmatched_bank_count)} />
            <Stat label={t("unmatched_book")} value={formatNumber(result.summary.unmatched_ledger_count)} />
          </section>

          <section className="rounded-xl border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-muted-foreground text-xs">{t("net_difference")}</p>
                <p
                  className={
                    result.gaps.net_difference === 0
                      ? "text-lg font-semibold tabular-nums"
                      : "text-destructive text-lg font-semibold tabular-nums"
                  }
                  dir="ltr"
                >
                  {money(result.gaps.net_difference)}
                </p>
              </div>
              <div className="text-muted-foreground text-xs">
                {t("statement_net")}: <span className="tabular-nums">{money(result.gaps.statement_net)}</span> ·{" "}
                {t("book_net")}: <span className="tabular-nums">{money(result.gaps.book_net)}</span> ·{" "}
                {t("closing")}: <span className="tabular-nums">{money(result.gaps.closing_balance)}</span>
              </div>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">{t("net_difference_hint")}</p>
          </section>

          {result.skipped_rows.length > 0 ? (
            <section className="rounded-xl border p-4">
              <h2 className="font-medium">{t("skipped_title")}</h2>
              <p className="text-muted-foreground mt-1 text-xs">{t("skipped_hint")}</p>
              <ul className="mt-2 space-y-1 text-xs">
                {result.skipped_rows.slice(0, 20).map((row) => (
                  <li key={row.line}>
                    {t("line")} {formatNumber(row.line)} — {row.reason === "date" ? t("skip_date") : t("skip_amount")}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-2">
            <h2 className="font-medium">{t("only_in_book")}</h2>
            <p className="text-muted-foreground text-xs">{t("only_in_book_hint")}</p>
            {rowTable(result.unmatched_ledger_records, t("none"))}
          </section>

          <section className="space-y-2">
            <h2 className="font-medium">{t("only_on_statement")}</h2>
            <p className="text-muted-foreground text-xs">{t("only_on_statement_hint")}</p>
            {rowTable(result.unmatched_bank_records, t("none"))}
          </section>

          <section className="space-y-2">
            <h2 className="font-medium">{t("matched_title")}</h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-start">{t("date")}</th>
                    <th className="p-2 text-end">{t("amount")}</th>
                    <th className="p-2 text-start">{t("matched_by")}</th>
                    <th className="p-2 text-start">{t("description")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matched.map((row) => (
                    <tr key={`${row.bank_row.id}-${row.ledger_row.id}`} className="border-t">
                      <td className="p-2 tabular-nums">{row.bank_row.date}</td>
                      <td className="p-2 text-end tabular-nums">{money(row.matched_amount)}</td>
                      <td className="p-2">
                        <Badge variant="outline">
                          {row.match_type === "EXACT_REFERENCE" ? t("by_reference") : t("by_date_amount")}
                        </Badge>
                      </td>
                      <td className="p-2">{row.bank_row.description ?? row.ledger_row.description ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t("none")}</p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}
