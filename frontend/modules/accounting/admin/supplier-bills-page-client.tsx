"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LocaleDatePicker } from "@/components/LocaleDatePicker";
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { MoneyText } from "@/components/currency/MoneyDisplay"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { normalizeListPayload } from "@/lib/list-utils"
import { useLocaleNext } from "@/hooks/use-locale-next"

import apiClient from "@/features/modules/accounting/lib/api-client"

/**
 * فاکتورهای خرید — what the shop owes its suppliers, and when it is due.
 *
 * The bill in between goods-in and money-out had nowhere to live, so payables were whatever
 * the receipts implied and "what do we owe, and when" had no answer. The list leads with the
 * overdue count, because that is the part a manager has to act on today.
 */

type Bill = {
  id: number
  number: string | null
  supplier_reference: string | null
  issued_on: string | null
  due_on: string | null
  status: "open" | "paid" | "cancelled"
  total_minor: number
  paid_minor: number
  remaining_minor: number
  supplier_name: string | null
  overdue: boolean
}

type Supplier = { id: number; name: string }

const blank = { supplier_id: "", number: "", supplier_reference: "", issued_on: "", due_on: "", total_minor: "", notes: "" }

export default function SupplierBillsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("accounting_supplier_bills")
  const tCommon = useTranslations("common")
  const { locale, formatNumber } = useLocaleNext()
  const queryClient = useQueryClient()

  const [form, setForm] = useState(blank)
  const [paying, setPaying] = useState<{ bill: Bill; amount: string } | null>(null)

  const bills = useQuery({
    queryKey: ["supplier-bills"],
    queryFn: async () =>
      (await api<{ data: { bills: Bill[]; outstanding_minor: number } }>("/api/v1/erp-accounting/supplier-bills"))?.data ?? null,
    retry: false,
  })

  const persons = useQuery({
    queryKey: ["acc-persons"],
    queryFn: async () => {
      const res = await apiClient.get<unknown>("/v1/erp-accounting/persons", { params: { per_page: 200 } })
      return normalizeListPayload(res.data) as unknown as Supplier[]
    },
    retry: false,
  })

  const create = useMutation({
    mutationFn: () =>
      api("/api/v1/erp-accounting/supplier-bills", {
        method: "POST",
        json: {
          supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
          number: form.number.trim() || null,
          supplier_reference: form.supplier_reference.trim() || null,
          issued_on: form.issued_on || null,
          due_on: form.due_on || null,
          total_minor: Number(form.total_minor),
          notes: form.notes.trim() || null,
        },
      }),
    onSuccess: async () => {
      setForm(blank)
      await queryClient.invalidateQueries({ queryKey: ["supplier-bills"] })
      toast.success(t("saved"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const pay = useMutation({
    mutationFn: () =>
      api(`/api/v1/erp-accounting/supplier-bills/${paying?.bill.id}/pay`, {
        method: "POST",
        json: { amount_minor: Number(paying?.amount ?? 0) },
      }),
    onSuccess: async () => {
      setPaying(null)
      await queryClient.invalidateQueries({ queryKey: ["supplier-bills"] })
      toast.success(t("paid"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const rows = bills.data?.bills ?? []
  const overdue = rows.filter((row) => row.overdue)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs">{t("outstanding")}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            <MoneyText amount={Math.round(bills.data?.outstanding_minor ?? 0)} />
          </p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs">{t("overdue_count")}</p>
          <p className={overdue.length > 0 ? "text-destructive mt-1 text-lg font-semibold tabular-nums" : "mt-1 text-lg font-semibold tabular-nums"}>
            {formatNumber(overdue.length)}
          </p>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-medium">{t("new_bill")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="b-supplier">{t("supplier")}</Label>
            <select
              id="b-supplier"
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={form.supplier_id}
              onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}
            >
              <option value="">{t("no_supplier")}</option>
              {(persons.data ?? []).map((person) => (
                <option key={person.id} value={String(person.id)}>
                  {person.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-ref">{t("supplier_reference")}</Label>
            <Input id="b-ref" dir="ltr" value={form.supplier_reference} onChange={(e) => setForm((f) => ({ ...f, supplier_reference: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-total">{t("total")}</Label>
            <Input
              id="b-total"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.total_minor}
              onChange={(e) => setForm((f) => ({ ...f, total_minor: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-issued">{t("issued_on")}</Label>
            <LocaleDatePicker
              locale={locale}
              id="b-issued"
              value={form.issued_on}
              onChange={(v) => setForm((f) => ({ ...f, issued_on: v ?? "" }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-due">{t("due_on")}</Label>
            <LocaleDatePicker
              locale={locale}
              id="b-due"
              value={form.due_on}
              onChange={(v) => setForm((f) => ({ ...f, due_on: v ?? "" }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-number">{t("number")}</Label>
            <Input id="b-number" value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="b-notes">{t("notes")}</Label>
            <Textarea id="b-notes" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <Button disabled={create.isPending || Number(form.total_minor) <= 0} onClick={() => create.mutate()}>
          {create.isPending ? tCommon("saving") : t("save")}
        </Button>
      </section>

      {paying ? (
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="font-medium">{t("pay_title", { reference: paying.bill.supplier_reference ?? paying.bill.number ?? "" })}</h2>
          <p className="text-muted-foreground text-sm">
            {t("remaining")}: <MoneyText amount={Math.round(paying.bill.remaining_minor)} />
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">{t("pay_amount")}</Label>
              <Input
                id="pay-amount"
                type="number"
                min={0}
                inputMode="numeric"
                value={paying.amount}
                onChange={(e) => setPaying((p) => (p ? { ...p, amount: e.target.value } : p))}
              />
            </div>
            <Button disabled={pay.isPending || Number(paying.amount) <= 0} onClick={() => pay.mutate()}>
              {pay.isPending ? tCommon("saving") : t("pay")}
            </Button>
            <Button variant="ghost" onClick={() => setPaying(null)}>
              {tCommon("cancel")}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-2 text-start">{t("supplier")}</th>
                  <th className="p-2 text-start">{t("supplier_reference")}</th>
                  <th className="p-2 text-start">{t("due_on")}</th>
                  <th className="p-2 text-end">{t("total")}</th>
                  <th className="p-2 text-end">{t("remaining")}</th>
                  <th className="p-2 text-start">{t("status")}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2">{row.supplier_name ?? "—"}</td>
                    <td className="p-2" dir="ltr">{row.supplier_reference ?? row.number ?? "—"}</td>
                    <td className="p-2 tabular-nums">{row.due_on ?? "—"}</td>
                    <td className="p-2 text-end tabular-nums"><MoneyText amount={Math.round(row.total_minor)} /></td>
                    <td className="p-2 text-end tabular-nums"><MoneyText amount={Math.round(row.remaining_minor)} /></td>
                    <td className="p-2">
                      {row.status === "paid" ? (
                        <Badge variant="outline">{t("status_paid")}</Badge>
                      ) : row.overdue ? (
                        <Badge variant="destructive">{t("status_overdue")}</Badge>
                      ) : (
                        <Badge variant="secondary">{t("status_open")}</Badge>
                      )}
                    </td>
                    <td className="p-2">
                      {row.status === "open" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPaying({ bill: row, amount: String(row.remaining_minor) })}
                        >
                          {t("pay")}
                        </Button>
                      ) : null}
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
