"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { MoneyText } from "@/components/currency/MoneyDisplay"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useLocaleNext } from "@/hooks/use-locale-next"

import { normalizeListPayload } from "@/lib/list-utils"
import apiClient from "@/features/modules/accounting/lib/api-client"

/**
 * هزینه‌ها — rent, electricity, repairs.
 *
 * The most common thing a small shop writes down, and until now it required opening the journal
 * screen and knowing which account to debit. Which is why the ledger was usually empty and the
 * P&L understated every cost except food. The form asks for a category and a payment account;
 * the balanced journal is the server's job.
 */

type Expense = {
  id: number
  title: string
  category: string
  amount_minor: number
  spent_on: string
  reference: string | null
  cash_account_name: string | null
  journal_entry_id: number | null
}

type Category = { key: string; code: string; name: string }

type CashAccount = { id: number; name: string; type: string }

const blank = { title: "", amount_minor: "", spent_on: "", category: "rent", cash_account_id: "", reference: "", notes: "" }

export default function ExpensesPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("accounting_expenses")
  const tCommon = useTranslations("common")
  const { formatNumber } = useLocaleNext()
  const queryClient = useQueryClient()

  const [form, setForm] = useState(blank)

  const categories = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => (await api<{ data: { categories: Category[] } }>("/api/v1/erp-accounting/expense-categories"))?.data?.categories ?? [],
    retry: false,
  })

  const cashAccounts = useQuery({
    queryKey: ["expense-cash-accounts"],
    queryFn: async () => {
      const res = await apiClient.get<unknown>("/v1/erp-accounting/cash-accounts", { params: { per_page: 100 } })
      return normalizeListPayload(res.data) as unknown as CashAccount[]
    },
    retry: false,
  })

  const expenses = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => (await api<{ data: { expenses: Expense[]; total_minor: number } }>("/api/v1/erp-accounting/expenses"))?.data ?? null,
    retry: false,
  })

  const create = useMutation({
    mutationFn: () =>
      api("/api/v1/erp-accounting/expenses", {
        method: "POST",
        json: {
          title: form.title.trim(),
          amount_minor: Number(form.amount_minor),
          spent_on: form.spent_on || null,
          category: form.category,
          cash_account_id: form.cash_account_id ? Number(form.cash_account_id) : null,
          reference: form.reference.trim() || null,
          notes: form.notes.trim() || null,
        },
      }),
    onSuccess: async () => {
      setForm(blank)
      await queryClient.invalidateQueries({ queryKey: ["expenses"] })
      toast.success(t("saved"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const rows = expenses.data?.expenses ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-medium">{t("new_expense")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="ex-title">{t("title_field")}</Label>
            <Input id="ex-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={t("title_placeholder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-amount">{t("amount")}</Label>
            <Input
              id="ex-amount"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.amount_minor}
              onChange={(e) => setForm((f) => ({ ...f, amount_minor: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-date">{t("spent_on")}</Label>
            <Input id="ex-date" type="date" value={form.spent_on} onChange={(e) => setForm((f) => ({ ...f, spent_on: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-category">{t("category")}</Label>
            <select
              id="ex-category"
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {(categories.data ?? []).map((category) => (
                <option key={category.key} value={category.key}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-account">{t("paid_from")}</Label>
            <select
              id="ex-account"
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={form.cash_account_id}
              onChange={(e) => setForm((f) => ({ ...f, cash_account_id: e.target.value }))}
            >
              <option value="">{t("default_cash")}</option>
              {(cashAccounts.data ?? []).map((account) => (
                <option key={account.id} value={String(account.id)}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-ref">{t("reference")}</Label>
            <Input id="ex-ref" value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="ex-notes">{t("notes")}</Label>
            <Textarea id="ex-notes" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <Button
          disabled={create.isPending || form.title.trim() === "" || Number(form.amount_minor) <= 0}
          onClick={() => create.mutate()}
        >
          {create.isPending ? tCommon("saving") : t("save")}
        </Button>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">{t("list_title")}</h2>
          <p className="text-muted-foreground text-sm">
            {t("total")}: <span className="tabular-nums"><MoneyText amount={Math.round(expenses.data?.total_minor ?? 0)} /></span>
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-2 text-start">{t("spent_on")}</th>
                  <th className="p-2 text-start">{t("title_field")}</th>
                  <th className="p-2 text-start">{t("category")}</th>
                  <th className="p-2 text-start">{t("paid_from")}</th>
                  <th className="p-2 text-end">{t("amount")}</th>
                  <th className="p-2 text-start">{t("journal")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2 tabular-nums">{row.spent_on}</td>
                    <td className="p-2">{row.title}</td>
                    <td className="p-2">{t(`cat_${row.category}`) === `cat_${row.category}` ? row.category : t(`cat_${row.category}`)}</td>
                    <td className="p-2">{row.cash_account_name ?? t("default_cash")}</td>
                    <td className="p-2 text-end tabular-nums">
                      <MoneyText amount={Math.round(row.amount_minor)} />
                    </td>
                    <td className="p-2 tabular-nums" dir="ltr">
                      {row.journal_entry_id === null ? "—" : `#${formatNumber(row.journal_entry_id)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
