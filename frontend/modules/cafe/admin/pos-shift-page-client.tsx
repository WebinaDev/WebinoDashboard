"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatDisplayDateTime } from "@/lib/format-date"
import { toLocaleDigits } from "@/lib/locale"
import { MoneyText } from "@/components/currency/MoneyDisplay"

import { CafeAdminShell, CafeEmptyState, CafeSection, cafeSelectClass } from "./cafe-admin-ui"

type Tender = { tender: string; count: number; amount_minor: number }

type ShiftTotals = {
  orders?: number
  gross_sales_minor?: number
  net_sales_minor?: number
  discounts_minor?: number
  tax_minor?: number
  cash_sales_minor?: number
  non_cash_sales_minor?: number
  by_tender?: Tender[]
  opening_float_minor?: number
  cash_in_minor?: number
  cash_out_minor?: number
  drops_minor?: number
  expected_cash_minor?: number
  counted_cash_minor?: number | null
  variance_minor?: number | null
}

type Shift = {
  id: number
  status: "open" | "closed" | string
  opening_float_minor: number
  counted_cash_minor: number | null
  expected_cash_minor: number | null
  variance_minor: number
  varied: boolean
  note?: string | null
  opened_at?: string | null
  closed_at?: string | null
  totals: ShiftTotals
  cashier?: { id: number; name: string } | null
  /** counted | pending_approval | approved | rejected */
  count_status?: string | null
  counted_by?: number | null
  counted_at?: string | null
  approved_by?: number | null
  approved_at?: string | null
  approval_note?: string | null
  journal_entry_id?: number | null
  day_close_id?: number | null
  /** True when the server withheld the expected figure because the count is blind. */
  blind?: boolean
}

type TillReport = {
  kind: "X" | "Z"
  shift_id: number
  cashier?: string | null
  status: string
  opened_at?: string | null
  closed_at?: string | null
  generated_at?: string | null
  sales: {
    orders: number
    gross_minor: number
    net_minor: number
    discounts_minor: number
    tax_minor: number
    shipping_minor: number
  }
  tenders: { tender: string; count: number; amount_minor: number }[]
  drawer: {
    opening_float_minor: number
    cash_sales_minor: number
    cash_in_minor: number
    cash_out_minor: number
    drops_minor: number
    expected_minor: number | null
    counted_minor: number | null
    variance_minor: number | null
    over_short?: "over" | "short" | null
    blind?: boolean
  }
  movements: Movement[]
  signoff: {
    counted_by?: number | null
    counted_at?: string | null
    approved_by?: number | null
    approved_at?: string | null
    journal_entry_id?: number | null
  }
}

type DayClose = {
  id: number
  business_date?: string | null
  status: string
  shifts: number
  gross_sales_minor: number
  cash_sales_minor: number
  non_cash_sales_minor: number
  discounts_minor: number
  tax_minor: number
  expected_cash_minor: number
  counted_cash_minor: number
  variance_minor: number
  closed_at?: string | null
}

type Movement = {
  id: number
  type: string
  amount_minor: number
  reason?: string | null
  created_at: string
}

const MOVEMENT_TYPES = ["cash_in", "cash_out", "drop", "no_sale", "note"] as const

/** Escape text going into the printed receipt document. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Parse a Persian or Latin digit string into a number, tolerating separators. */
function parseAmount(raw: string): number {
  const latin = raw
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[,٬\s]/g, "")
  const n = Number(latin)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : NaN
}

export default function PosShiftPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.pos_shift")
  const locale = useLocale()
  const queryClient = useQueryClient()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const currency = "IRT"
  const money = (value?: number | null) => (
    <MoneyText amount={value} currency={currency} fallback="-" />
  )

  const [floatInput, setFloatInput] = useState("")
  const [countedInput, setCountedInput] = useState("")
  const [noteInput, setNoteInput] = useState("")
  const [movementType, setMovementType] = useState<string>("cash_in")
  const [movementAmount, setMovementAmount] = useState("")
  const [movementReason, setMovementReason] = useState("")
  const [varianceOnly, setVarianceOnly] = useState(false)
  const [statusFilter, setStatusFilter] = useState("")
  const [approvalNote, setApprovalNote] = useState("")
  const [dayDate, setDayDate] = useState(() => new Date().toISOString().slice(0, 10))

  const current = useQuery({
    queryKey: ["cafe-pos-shift"],
    queryFn: async () => {
      const res = await api<{ data: Shift | null }>("/api/v1/cafe/pos/shift")
      return res?.data ?? null
    },
    refetchInterval: 20_000,
  })

  const shift = current.data ?? null

  const movements = useQuery({
    queryKey: ["cafe-pos-shift-movements", shift?.id],
    enabled: Boolean(shift?.id),
    queryFn: async () => {
      const res = await api<{ data: Movement[] }>(`/api/v1/cafe/pos/shifts/${shift!.id}/movements`)
      return res?.data ?? []
    },
  })

  const history = useQuery({
    queryKey: ["cafe-pos-shifts", varianceOnly, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (varianceOnly) params.set("variance_only", "1")
      if (statusFilter) params.set("status", statusFilter)
      const qs = params.toString()
      const res = await api<{ data: Shift[] }>(`/api/v1/cafe/pos/shifts${qs ? `?${qs}` : ""}`)
      return res?.data ?? []
    },
  })

  // Drawers waiting for a manager. Failing is fine — a cashier's account has no right to this
  // list, and the screen simply hides the panel instead of showing an error for a screen they
  // were never meant to use.
  const pending = useQuery({
    queryKey: ["cafe-pos-counts-pending"],
    queryFn: async () => {
      const res = await api<{ data: Shift[] }>("/api/v1/cafe/pos/counts/pending")
      return res?.data ?? []
    },
    retry: false,
    refetchInterval: 30_000,
  })

  const dayHistory = useQuery({
    queryKey: ["cafe-pos-day-history"],
    queryFn: async () => {
      const res = await api<{ data: DayClose[] }>("/api/v1/cafe/pos/day/history")
      return res?.data ?? []
    },
    retry: false,
  })

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["cafe-pos-shift"] }),
      queryClient.invalidateQueries({ queryKey: ["cafe-pos-shifts"] }),
      queryClient.invalidateQueries({ queryKey: ["cafe-pos-shift-movements"] }),
      queryClient.invalidateQueries({ queryKey: ["cafe-pos-counts-pending"] }),
      queryClient.invalidateQueries({ queryKey: ["cafe-pos-day-history"] }),
    ])
  }

  const openShift = useMutation({
    mutationFn: (openingFloatMinor: number) =>
      api("/api/v1/cafe/pos/shift/open", { method: "POST", json: { opening_float_minor: openingFloatMinor } }),
    onSuccess: async () => {
      toast.success(t("shift_open"))
      setFloatInput("")
      await invalidateAll()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const addMovement = useMutation({
    mutationFn: (payload: { type: string; amount_minor: number; reason?: string }) =>
      api(`/api/v1/cafe/pos/shifts/${shift!.id}/movements`, { method: "POST", json: payload }),
    onSuccess: async () => {
      toast.success(t("movement_saved"))
      setMovementAmount("")
      setMovementReason("")
      await invalidateAll()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const closeShift = useMutation({
    mutationFn: (payload: { counted_cash_minor: number; note?: string }) =>
      api(`/api/v1/cafe/pos/shifts/${shift!.id}/close`, { method: "POST", json: payload }),
    onSuccess: async () => {
      toast.success(t("shift_closed"))
      setCountedInput("")
      setNoteInput("")
      await invalidateAll()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  /** Blind step: record the count, do not close, do not reveal the expected figure. */
  const submitCount = useMutation({
    mutationFn: (payload: { counted_cash_minor: number; note?: string }) =>
      api(`/api/v1/cafe/pos/shifts/${shift!.id}/count`, { method: "POST", json: payload }),
    onSuccess: async () => {
      toast.success(t("count_submitted"))
      setCountedInput("")
      await invalidateAll()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const approveCount = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) =>
      api(`/api/v1/cafe/pos/shifts/${id}/count/approve`, { method: "POST", json: { note } }),
    onSuccess: async () => {
      toast.success(t("count_approved"))
      setApprovalNote("")
      await invalidateAll()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const rejectCount = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api(`/api/v1/cafe/pos/shifts/${id}/count/reject`, { method: "POST", json: { reason } }),
    onSuccess: async () => {
      toast.success(t("count_rejected"))
      setApprovalNote("")
      await invalidateAll()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const closeDay = useMutation({
    mutationFn: (payload: { business_date: string }) =>
      api("/api/v1/cafe/pos/day/close", { method: "POST", json: payload }),
    onSuccess: async () => {
      toast.success(t("day_closed"))
      await invalidateAll()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  /**
   * Print an X or Z report.
   *
   * A report printed from the screen would need the whole app's stylesheet to look right on
   * paper, so this builds a self-contained receipt-width document and prints that.
   */
  async function printReport(kind: "X" | "Z") {
    if (!shift) return
    try {
      const res = await api<{ data: TillReport }>(`/api/v1/cafe/pos/shifts/${shift.id}/${kind.toLowerCase()}-report`)
      const report = res?.data
      if (!report) return

      const row = (label: string, value: string) =>
        `<tr><td>${escapeHtml(label)}</td><td class="v">${escapeHtml(value)}</td></tr>`
      const money = (value?: number | null) =>
        value === null || value === undefined ? "-" : Number(value).toLocaleString("fa-IR")

      const tenders = report.tenders
        .map((tender) => row(tender.tender, `${money(tender.amount_minor)} × ${money(tender.count)}`))
        .join("")

      const html = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8">
<title>${kind === "X" ? "گزارش X" : "گزارش Z"} — شیفت ${report.shift_id}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: Tahoma, sans-serif; font-size: 11px; color: #000; }
  h1 { font-size: 14px; margin: 0 0 2px; text-align: center; }
  .meta { text-align: center; font-size: 10px; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; }
  td.v { text-align: left; font-variant-numeric: tabular-nums; }
  .sep { border-top: 1px dashed #000; margin: 5px 0; }
  .tot td { font-weight: bold; }
</style></head><body>
<h1>${kind === "X" ? "گزارش موقت (X)" : "گزارش بستن (Z)"}</h1>
<div class="meta">شیفت ${report.shift_id}${report.cashier ? " — " + escapeHtml(report.cashier) : ""}</div>
<div class="meta">${escapeHtml(report.generated_at ?? "")}</div>
<div class="sep"></div>
<table>
${row("تعداد سفارش", money(report.sales.orders))}
${row("فروش کل", money(report.sales.gross_minor))}
${row("تخفیف", money(report.sales.discounts_minor))}
${row("مالیات", money(report.sales.tax_minor))}
${row("ارسال", money(report.sales.shipping_minor))}
</table>
<div class="sep"></div>
<table>${tenders}</table>
<div class="sep"></div>
<table>
${row("موجودی اولیه", money(report.drawer.opening_float_minor))}
${row("فروش نقدی", money(report.drawer.cash_sales_minor))}
${row("ورود نقد", money(report.drawer.cash_in_minor))}
${row("خروج نقد", money(report.drawer.cash_out_minor))}
${row("تحویل به گاوصندوق", money(report.drawer.drops_minor))}
<tr class="tot">${row("نقد مورد انتظار", money(report.drawer.expected_minor))}</tr>
<tr class="tot">${row("شمارش‌شده", money(report.drawer.counted_minor))}</tr>
<tr class="tot">${row("اختلاف", money(report.drawer.variance_minor))}</tr>
</table>
<div class="sep"></div>
<div class="meta">امضای صندوق‌دار: ____________</div>
<div class="meta">امضای مدیر: ____________</div>
<script>window.onload = () => { window.focus(); window.print(); }</script>
</body></html>`

      const win = window.open("", "_blank", "width=380,height=640")
      if (!win) {
        toast.error(t("print_blocked"))
        return
      }
      win.document.write(html)
      win.document.close()
    } catch (e) {
      toast.error(getApiErrorMessage(e as Error))
    }
  }

  const totals = shift?.totals ?? {}
  // `blind` comes from the server: while a count is outstanding the expected figure is not
  // sent at all, so a cashier cannot read the answer off the screen and type it back.
  const blind = Boolean(shift?.blind)
  const expected = blind ? null : (totals.expected_cash_minor ?? shift?.expected_cash_minor ?? 0)
  const countedPreview = countedInput.trim() === "" ? null : parseAmount(countedInput)
  const previewVariance =
    countedPreview === null || Number.isNaN(countedPreview) || expected === null
      ? null
      : countedPreview - expected

  const tenderLabel = (tender: string) => {
    // Server sends the raw tender id; reuse existing catalogue keys where they exist.
    const map: Record<string, string> = { cash: "cash", pos_terminal: "card", online: "online", wallet: "wallet" }
    return map[tender] ?? tender
  }

  const varianceTone = useMemo(() => {
    if (previewVariance === null) return ""
    if (previewVariance === 0) return "text-emerald-600"
    return previewVariance < 0 ? "text-rose-600" : "text-amber-600"
  }, [previewVariance])

  function submitOpen() {
    const value = floatInput.trim() === "" ? 0 : parseAmount(floatInput)
    if (Number.isNaN(value)) {
      toast.error(t("amount_invalid"))
      return
    }
    openShift.mutate(value)
  }

  function submitMovement() {
    const needsAmount = movementType !== "no_sale" && movementType !== "note"
    const value = needsAmount ? parseAmount(movementAmount) : 0
    if (needsAmount && (Number.isNaN(value) || value <= 0)) {
      toast.error(t("amount_invalid"))
      return
    }
    addMovement.mutate({ type: movementType, amount_minor: value, reason: movementReason || undefined })
  }

  function submitClose() {
    const value = parseAmount(countedInput)
    if (Number.isNaN(value)) {
      toast.error(t("count_required"))
      return
    }
    confirm({
      title: t("close_confirm_title"),
      description: t("close_confirm_body"),
      confirmLabel: t("close_btn"),
      // A variance is the whole reason this screen exists — make the cashier look at it once more.
      onConfirm: () =>
        closeShift.mutateAsync({
          counted_cash_minor: value,
          note: noteInput.trim() || undefined,
        }),
    })
  }

  const varianceBadge = (variance: number) => {
    if (variance === 0) {
      return <Badge variant="secondary">{t("balanced")}</Badge>
    }
    return (
      <Badge variant={variance < 0 ? "destructive" : "outline"}>
        {variance < 0 ? t("short") : t("over")} {money(Math.abs(variance))}
      </Badge>
    )
  }

  if (current.isError) {
    return (
      <CafeAdminShell title={t("title")} description={t("description")}>
        <CafeEmptyState message={t("no_access")} />
      </CafeAdminShell>
    )
  }

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      {confirmDialog}

      {!shift ? (
        <CafeSection title={t("no_shift_title")} description={t("no_shift_body")}>
          <div className="flex max-w-md flex-col gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="opening-float">{t("opening_float")}</Label>
              <Input
                id="opening-float"
                inputMode="numeric"
                value={floatInput}
                onChange={(e) => setFloatInput(e.target.value)}
                placeholder="0"
              />
              <p className="text-muted-foreground text-xs">{t("opening_float_hint")}</p>
            </div>
            <Button onClick={submitOpen} disabled={openShift.isPending} size="lg">
              {t("open_shift")}
            </Button>
          </div>
        </CafeSection>
      ) : (
        <>
          <CafeSection
            title={t("live_title")}
            description={t("live_hint")}
            actions={<Badge>{t("status_open")}</Badge>}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label={t("orders_count")} value={toLocaleDigits(totals.orders ?? 0, locale)} />
              <Stat label={t("gross_sales")} value={money(totals.gross_sales_minor ?? 0)} />
              <Stat label={t("cash_sales")} value={money(totals.cash_sales_minor ?? 0)} />
              <Stat label={t("non_cash_sales")} value={money(totals.non_cash_sales_minor ?? 0)} />
              <Stat label={t("discounts")} value={money(totals.discounts_minor ?? 0)} />
              <Stat label={t("tax")} value={money(totals.tax_minor ?? 0)} />
              <Stat label={t("opened_at")} value={formatDisplayDateTime(shift.opened_at, locale)} />
              <Stat label={t("opening_float")} value={money(shift.opening_float_minor ?? 0)} />
            </div>

            {(totals.by_tender?.length ?? 0) > 0 ? (
              <div className="pt-2">
                <p className="mb-2 text-sm font-medium">{t("by_tender")}</p>
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("tender")}</TableHead>
                        <TableHead>{t("tender_count")}</TableHead>
                        <TableHead>{t("tender_amount")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {totals.by_tender!.map((row) => (
                        <TableRow key={row.tender}>
                          <TableCell>{tenderLabel(row.tender)}</TableCell>
                          <TableCell>{toLocaleDigits(row.count, locale)}</TableCell>
                          <TableCell>{money(row.amount_minor)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
          </CafeSection>

          <CafeSection
            title={t("drawer_title")}
            description={blind ? t("blind_hint") : undefined}
            actions={
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void printReport("X")}>
                  {t("print_x")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void printReport("Z")}>
                  {t("print_z")}
                </Button>
              </div>
            }
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat
                label={t("expected_cash")}
                value={expected === null ? "—" : money(expected)}
                hint={blind ? t("blind_expected_hidden") : t("expected_cash_hint")}
              />
              <div className="rounded-xl border p-3">
                <p className="text-muted-foreground mb-1.5 text-xs">{t("counted_cash")}</p>
                <Input
                  inputMode="numeric"
                  value={countedInput}
                  onChange={(e) => setCountedInput(e.target.value)}
                  placeholder="0"
                  className="text-lg font-semibold"
                />
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-muted-foreground mb-1.5 text-xs">{t("variance")}</p>
                <p className={`text-lg font-semibold ${varianceTone}`}>
                  {previewVariance === null ? "-" : money(previewVariance)}
                </p>
              </div>
            </div>

            {/* Where the count stands. A difference needs a manager, and saying so here is
                cheaper than a cashier discovering it after typing a number twice. */}
            {shift.count_status && shift.count_status !== "approved" ? (
              <p className="text-muted-foreground text-xs">
                {t(`count_status_${shift.count_status}`)}
              </p>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="close-note">{t("note_label")}</Label>
              <Input
                id="close-note"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder={t("note_ph")}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={submitClose} disabled={closeShift.isPending} size="lg" variant="destructive">
                {t("close_btn")}
              </Button>
              {/* The blind path, for a drawer that will not balance: record the count and let
                  a manager decide, instead of the cashier retyping until the red goes away. */}
              <Button
                onClick={() => {
                  const value = parseAmount(countedInput)
                  if (Number.isNaN(value)) {
                    toast.error(t("count_required"))
                    return
                  }
                  submitCount.mutate({
                    counted_cash_minor: value,
                    note: noteInput.trim() || undefined,
                  })
                }}
                disabled={submitCount.isPending}
                size="lg"
                variant="outline"
              >
                {t("submit_count_btn")}
              </Button>
            </div>
          </CafeSection>

          {(pending.data?.length ?? 0) > 0 ? (
            <CafeSection title={t("approvals_title")} description={t("approvals_hint")}>
              <div className="mb-2 max-w-md space-y-1.5">
                <Label htmlFor="approval-note">{t("approval_note")}</Label>
                <Input
                  id="approval-note"
                  value={approvalNote}
                  onChange={(e) => setApprovalNote(e.target.value)}
                  placeholder={t("approval_note_ph")}
                />
              </div>
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("cashier")}</TableHead>
                      <TableHead>{t("counted_cash")}</TableHead>
                      <TableHead>{t("counted_at")}</TableHead>
                      <TableHead>{t("actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.data!.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.cashier?.name ?? "-"}</TableCell>
                        <TableCell>{money(row.counted_cash_minor)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDisplayDateTime(row.counted_at, locale)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              onClick={() =>
                                approveCount.mutate({ id: row.id, note: approvalNote.trim() || undefined })
                              }
                              disabled={approveCount.isPending}
                            >
                              {t("approve_btn")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                rejectCount.mutate({
                                  id: row.id,
                                  // The reason is what the cashier is told; an empty one is
                                  // useless to them, so refuse it here.
                                  reason: approvalNote.trim() || t("reject_default_reason"),
                                })
                              }
                              disabled={rejectCount.isPending}
                            >
                              {t("reject_btn")}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CafeSection>
          ) : null}

          <CafeSection title={t("movements_title")} description={t("movements_hint")}>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="movement-type">{t("movement_type")}</Label>
                <select
                  id="movement-type"
                  className={cafeSelectClass}
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value)}
                >
                  {MOVEMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`type_${type}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="movement-amount">{t("movement_amount")}</Label>
                <Input
                  id="movement-amount"
                  inputMode="numeric"
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value)}
                  disabled={movementType === "no_sale" || movementType === "note"}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="movement-reason">{t("movement_reason")}</Label>
                <Input
                  id="movement-reason"
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder={t("movement_reason_ph")}
                />
              </div>
            </div>
            <Button onClick={submitMovement} disabled={addMovement.isPending} variant="outline">
              {t("add_movement")}
            </Button>

            {(movements.data?.length ?? 0) === 0 ? (
              <p className="text-muted-foreground text-sm">{t("no_movements")}</p>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("movement_type")}</TableHead>
                      <TableHead>{t("movement_amount")}</TableHead>
                      <TableHead>{t("movement_reason")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.data!.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{t(`type_${m.type}`)}</TableCell>
                        <TableCell>{m.type === "no_sale" || m.type === "note" ? "-" : money(m.amount_minor)}</TableCell>
                        <TableCell className="text-muted-foreground">{m.reason || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CafeSection>
        </>
      )}

      {/* Day close. Sits below the till because it is the manager's end-of-day act, not
          something a cashier does between customers. */}
      <CafeSection
        title={t("day_title")}
        description={t("day_hint")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={dayDate}
              onChange={(e) => setDayDate(e.target.value)}
              className="w-40"
              aria-label={t("day_date")}
            />
            <Button
              size="sm"
              onClick={() => {
                confirm({
                  title: t("day_close_confirm_title"),
                  description: t("day_close_confirm_body"),
                  confirmLabel: t("day_close_btn"),
                  onConfirm: () => closeDay.mutateAsync({ business_date: dayDate }),
                })
              }}
              disabled={closeDay.isPending}
            >
              {t("day_close_btn")}
            </Button>
          </div>
        }
      >
        {(dayHistory.data?.length ?? 0) === 0 ? (
          <CafeEmptyState message={t("day_empty")} />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("day_date")}</TableHead>
                  <TableHead>{t("orders_count")}</TableHead>
                  <TableHead>{t("gross_sales")}</TableHead>
                  <TableHead>{t("cash_sales")}</TableHead>
                  <TableHead>{t("variance")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dayHistory.data!.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.business_date}</TableCell>
                    <TableCell>{toLocaleDigits(row.shifts, locale)}</TableCell>
                    <TableCell>{money(row.gross_sales_minor)}</TableCell>
                    <TableCell>{money(row.cash_sales_minor)}</TableCell>
                    <TableCell>
                      {row.variance_minor === 0 ? (
                        <Badge variant="secondary">{t("balanced")}</Badge>
                      ) : (
                        varianceBadge(row.variance_minor)
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "closed" ? "secondary" : "outline"}>
                        {row.status === "closed" ? t("status_closed") : t("status_open")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CafeSection>

      <CafeSection
        title={t("history_title")}
        description={t("history_hint")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={varianceOnly}
                onChange={(e) => setVarianceOnly(e.target.checked)}
                className="size-4"
              />
              {t("only_variance")}
            </label>
            <select
              className={cafeSelectClass}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={t("filter_status")}
            >
              <option value="">{t("filter_status")}</option>
              <option value="open">{t("status_open")}</option>
              <option value="closed">{t("status_closed")}</option>
            </select>
          </div>
        }
      >
        {(history.data?.length ?? 0) === 0 ? (
          <CafeEmptyState message={t("history_empty")} />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col_cashier")}</TableHead>
                  <TableHead>{t("col_window")}</TableHead>
                  <TableHead>{t("col_expected")}</TableHead>
                  <TableHead>{t("col_counted")}</TableHead>
                  <TableHead>{t("col_variance")}</TableHead>
                  <TableHead>{t("col_status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data!.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.cashier?.name ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDisplayDateTime(row.opened_at, locale)}
                      {row.closed_at ? ` → ${formatDisplayDateTime(row.closed_at, locale)}` : ""}
                    </TableCell>
                    <TableCell>{money(row.expected_cash_minor)}</TableCell>
                    <TableCell>{row.counted_cash_minor === null ? "-" : money(row.counted_cash_minor)}</TableCell>
                    <TableCell>
                      {row.counted_cash_minor === null ? <span className="text-muted-foreground">-</span> : varianceBadge(row.variance_minor)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "open" ? "default" : "secondary"}>
                        {row.status === "open" ? t("status_open") : t("status_closed")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CafeSection>
    </CafeAdminShell>
  )
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">{hint}</p> : null}
    </div>
  )
}
