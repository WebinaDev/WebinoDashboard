"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LocaleDatePicker } from "@/components/LocaleDatePicker";
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { MoneyText } from "@/components/currency/MoneyDisplay"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useLocaleNext } from "@/hooks/use-locale-next"

/**
 * دارایی‌های ثابت — the oven, the espresso machine, the fit-out.
 *
 * A café spends more on equipment than on almost anything else, and it used to be invisible: a
 * 400-million machine either vanished as one month's expense or never got recorded. Both answers
 * fall apart the moment an accountant looks at the P&L.
 *
 * Straight-line depreciation, because that is what a small shop's accountant actually files.
 */

type Asset = {
  id: number
  name: string
  category: string | null
  serial_no: string | null
  acquired_on: string
  cost_minor: number
  salvage_minor: number
  useful_life_months: number
  monthly_minor: number
  accumulated_minor: number
  book_value_minor: number
  depreciated_through: string | null
  status: "active" | "fully_depreciated" | "disposed"
  disposed_on: string | null
  disposal_proceeds_minor: number
}

const blank = {
  name: "",
  category: "equipment",
  serial_no: "",
  acquired_on: "",
  cost_minor: "",
  salvage_minor: "",
  useful_life_months: "60",
  on_credit: false,
}

export default function FixedAssetsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("accounting_fixed_assets")
  const tCommon = useTranslations("common")
  const { locale, formatNumber, formatDate } = useLocaleNext()
  const queryClient = useQueryClient()

  const [form, setForm] = useState(blank)
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const [disposing, setDisposing] = useState<{ asset: Asset; proceeds: string } | null>(null)

  const assets = useQuery({
    queryKey: ["fixed-assets"],
    queryFn: async () =>
      (await api<{ data: { assets: Asset[]; cost_minor: number; book_value_minor: number } }>("/api/v1/erp-accounting/fixed-assets"))?.data ?? null,
    retry: false,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["fixed-assets"] })

  const create = useMutation({
    mutationFn: () =>
      api("/api/v1/erp-accounting/fixed-assets", {
        method: "POST",
        json: {
          name: form.name.trim(),
          category: form.category.trim() || null,
          serial_no: form.serial_no.trim() || null,
          acquired_on: form.acquired_on || null,
          cost_minor: Number(form.cost_minor),
          salvage_minor: form.salvage_minor ? Number(form.salvage_minor) : 0,
          useful_life_months: form.useful_life_months ? Number(form.useful_life_months) : 60,
          on_credit: form.on_credit,
        },
      }),
    onSuccess: async () => {
      setForm(blank)
      await invalidate()
      toast.success(t("saved"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const depreciate = useMutation({
    mutationFn: () =>
      api<{ data: { posted: number; skipped: number; total_minor: number } }>("/api/v1/erp-accounting/fixed-assets/depreciate", {
        method: "POST",
        json: { period },
      }),
    onSuccess: async (res) => {
      await invalidate()
      // The count matters: re-running a posted month is a no-op, and saying so is cheaper than
      // an accountant wondering why nothing happened.
      toast.success(t("depreciated", { posted: res?.data?.posted ?? 0, skipped: res?.data?.skipped ?? 0 }))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const dispose = useMutation({
    mutationFn: () =>
      api(`/api/v1/erp-accounting/fixed-assets/${disposing?.asset.id}/dispose`, {
        method: "POST",
        json: { proceeds_minor: Number(disposing?.proceeds ?? 0) },
      }),
    onSuccess: async () => {
      setDisposing(null)
      await invalidate()
      toast.success(t("disposed"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const rows = assets.data?.assets ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs">{t("total_cost")}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums"><MoneyText amount={Math.round(assets.data?.cost_minor ?? 0)} /></p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs">{t("total_book_value")}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums"><MoneyText amount={Math.round(assets.data?.book_value_minor ?? 0)} /></p>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-medium">{t("new_asset")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="fa-name">{t("name")}</Label>
            <Input id="fa-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("name_placeholder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fa-category">{t("category")}</Label>
            <Input id="fa-category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fa-serial">{t("serial_no")}</Label>
            <Input id="fa-serial" dir="ltr" value={form.serial_no} onChange={(e) => setForm((f) => ({ ...f, serial_no: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fa-cost">{t("cost")}</Label>
            <Input
              id="fa-cost"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.cost_minor}
              onChange={(e) => setForm((f) => ({ ...f, cost_minor: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fa-salvage">{t("salvage")}</Label>
            <Input
              id="fa-salvage"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.salvage_minor}
              onChange={(e) => setForm((f) => ({ ...f, salvage_minor: e.target.value }))}
            />
            <p className="text-muted-foreground text-xs">{t("salvage_hint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fa-life">{t("useful_life")}</Label>
            <Input
              id="fa-life"
              type="number"
              min={1}
              inputMode="numeric"
              value={form.useful_life_months}
              onChange={(e) => setForm((f) => ({ ...f, useful_life_months: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fa-date">{t("acquired_on")}</Label>
            <LocaleDatePicker
              locale={locale}
              id="fa-date"
              value={form.acquired_on}
              onChange={(v) => setForm((f) => ({ ...f, acquired_on: v ?? "" }))}
            />
          </div>
          <label className="flex items-center gap-2 self-end text-sm">
            <Checkbox checked={form.on_credit} onCheckedChange={(v) => setForm((f) => ({ ...f, on_credit: Boolean(v) }))} />
            {t("on_credit")}
          </label>
        </div>
        <Button disabled={create.isPending || form.name.trim() === "" || Number(form.cost_minor) <= 0} onClick={() => create.mutate()}>
          {create.isPending ? tCommon("saving") : t("save")}
        </Button>
      </section>

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-medium">{t("depreciation_run")}</h2>
        <p className="text-muted-foreground text-sm">{t("depreciation_hint")}</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="fa-period">{t("period")}</Label>
            <Input id="fa-period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40" />
          </div>
          <Button disabled={depreciate.isPending || period === ""} onClick={() => depreciate.mutate()}>
            {depreciate.isPending ? tCommon("saving") : t("run")}
          </Button>
        </div>
      </section>

      {disposing ? (
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="font-medium">{t("dispose_title", { name: disposing.asset.name })}</h2>
          <p className="text-muted-foreground text-sm">
            {t("book_value")}: <MoneyText amount={Math.round(disposing.asset.book_value_minor)} />
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="fa-proceeds">{t("proceeds")}</Label>
              <Input
                id="fa-proceeds"
                type="number"
                min={0}
                inputMode="numeric"
                value={disposing.proceeds}
                onChange={(e) => setDisposing((d) => (d ? { ...d, proceeds: e.target.value } : d))}
              />
            </div>
            <Button disabled={dispose.isPending} onClick={() => dispose.mutate()}>
              {dispose.isPending ? tCommon("saving") : t("dispose")}
            </Button>
            <Button variant="ghost" onClick={() => setDisposing(null)}>
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
                  <th className="p-2 text-start">{t("name")}</th>
                  <th className="p-2 text-start">{t("acquired_on")}</th>
                  <th className="p-2 text-end">{t("cost")}</th>
                  <th className="p-2 text-end">{t("monthly")}</th>
                  <th className="p-2 text-end">{t("accumulated")}</th>
                  <th className="p-2 text-end">{t("book_value")}</th>
                  <th className="p-2 text-start">{t("status")}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2">{row.name}</td>
                    <td className="p-2 tabular-nums">{formatDate(row.acquired_on)}</td>
                    <td className="p-2 text-end tabular-nums"><MoneyText amount={Math.round(row.cost_minor)} /></td>
                    <td className="p-2 text-end tabular-nums"><MoneyText amount={Math.round(row.monthly_minor)} /></td>
                    <td className="p-2 text-end tabular-nums"><MoneyText amount={Math.round(row.accumulated_minor)} /></td>
                    <td className="p-2 text-end tabular-nums"><MoneyText amount={Math.round(row.book_value_minor)} /></td>
                    <td className="p-2">
                      {row.status === "disposed" ? (
                        <Badge variant="secondary">{t("status_disposed")}</Badge>
                      ) : row.status === "fully_depreciated" ? (
                        <Badge variant="outline">{t("status_fully")}</Badge>
                      ) : (
                        <Badge>{t("status_active")}</Badge>
                      )}
                      {row.depreciated_through ? (
                        <span className="text-muted-foreground ms-1 text-xs tabular-nums">{formatNumber(row.useful_life_months)} {t("months")}</span>
                      ) : null}
                    </td>
                    <td className="p-2">
                      {row.status !== "disposed" ? (
                        <Button size="sm" variant="outline" onClick={() => setDisposing({ asset: row, proceeds: "0" })}>
                          {t("dispose")}
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
