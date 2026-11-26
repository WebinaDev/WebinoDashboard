"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LocaleDatePicker } from "@/components/LocaleDatePicker";
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { MoneyText } from "@/components/currency/MoneyDisplay"
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
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/format-date"
import { asArray } from "@/lib/list-utils"
import { toLocaleDigits } from "@/lib/locale"

import { CafeAdminShell, CafeEmptyState, CafeSection, cafeSelectClass } from "./cafe-admin-ui"

type Shift = {
  id: number
  user_id: number
  name: string
  work_date: string
  starts_at: string
  ends_at: string
  role?: string | null
  status: string
  hours: number
}

type Week = {
  week_start: string
  week_end: string
  days: { date: string; shifts: Shift[] }[]
  leave: { id: number; user_id: number; name: string; type: string; starts_on: string; ends_on: string }[]
  total_hours: number
}

type LeaveRow = {
  id: number
  user_id: number
  name: string
  type: string
  starts_on: string
  ends_on: string
  reason?: string | null
  status: string
}

type Run = {
  id: number
  period_start: string
  period_end: string
  status: string
  gross_total_minor: number
  net_total_minor: number
  journal_entry_id?: number | null
}

type RunLine = {
  user_id: number
  name: string
  hours: number
  overtime_hours: number
  gross_minor: number
  employee_insurance_minor: number
  employer_insurance_minor: number
  tax_minor: number
  net_minor: number
}

type Contract = {
  id: number
  user_id: number
  name: string
  pay_type: string
  base_rate_minor: number
  weekly_hours: number
  is_active: boolean
}

type Tab = "rota" | "leave" | "payroll" | "contracts"

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Saturday, because that is the start of the working week here. */
function startOfWeek(d: Date): Date {
  const copy = new Date(d)
  const day = copy.getDay() // 0 = Sunday … 6 = Saturday
  const diff = (day + 1) % 7
  copy.setDate(copy.getDate() - diff)
  return copy
}

export default function StaffPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.staff")
  const locale = useLocale()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>("rota")
  const [weekStart, setWeekStart] = useState(() => isoDate(startOfWeek(new Date())))

  const [draft, setDraft] = useState({ user_id: "", work_date: "", starts_at: "09:00", ends_at: "17:00", role: "" })
  const [leaveDraft, setLeaveDraft] = useState({ user_id: "", type: "annual", starts_on: "", ends_on: "", reason: "" })
  const [payPeriod, setPayPeriod] = useState(() => {
    const now = new Date()
    return { start: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
  })
  const [openRun, setOpenRun] = useState<number | null>(null)
  const [contractDraft, setContractDraft] = useState({
    user_id: "",
    pay_type: "monthly",
    base_rate_minor: "",
    weekly_hours: "44",
  })

  const week = useQuery({
    queryKey: ["cafe-staff-week", weekStart],
    queryFn: async () =>
      (await api<{ data: Week }>(`/api/v1/staff/week?week_start=${weekStart}`))?.data ?? null,
    retry: false,
  })

  const onDuty = useQuery({
    queryKey: ["cafe-staff-on-duty"],
    queryFn: async () => asArray<{ id: number; name: string; since: string }>(await api("/api/v1/staff/on-duty")),
    retry: false,
    refetchInterval: 60_000,
  })

  const leave = useQuery({
    queryKey: ["cafe-staff-leave"],
    enabled: tab === "leave",
    queryFn: async () => asArray<LeaveRow>(await api("/api/v1/staff/leave")),
    retry: false,
  })

  const runs = useQuery({
    queryKey: ["cafe-staff-payroll"],
    enabled: tab === "payroll",
    queryFn: async () => asArray<Run>(await api("/api/v1/staff/payroll")),
    retry: false,
  })

  const runDetail = useQuery({
    queryKey: ["cafe-staff-payroll-run", openRun],
    enabled: openRun !== null,
    queryFn: async () =>
      (await api<{ data: { lines: RunLine[]; status: string } }>(`/api/v1/staff/payroll/${openRun}`))?.data ?? null,
    retry: false,
  })

  const contracts = useQuery({
    queryKey: ["cafe-staff-contracts"],
    enabled: tab === "contracts",
    queryFn: async () => asArray<Contract>(await api("/api/v1/staff/contracts")),
    retry: false,
  })

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["cafe-staff-week"] }),
      queryClient.invalidateQueries({ queryKey: ["cafe-staff-on-duty"] }),
      queryClient.invalidateQueries({ queryKey: ["cafe-staff-leave"] }),
      queryClient.invalidateQueries({ queryKey: ["cafe-staff-payroll"] }),
      queryClient.invalidateQueries({ queryKey: ["cafe-staff-payroll-run"] }),
      queryClient.invalidateQueries({ queryKey: ["cafe-staff-contracts"] }),
    ])
  }

  const addShift = useMutation({
    mutationFn: () =>
      api("/api/v1/staff/shifts", {
        method: "POST",
        json: {
          shifts: [
            {
              user_id: Number(draft.user_id),
              work_date: draft.work_date,
              starts_at: draft.starts_at,
              ends_at: draft.ends_at,
              role: draft.role || null,
            },
          ],
        },
      }),
    onSuccess: async () => {
      toast.success(t("shift_saved"))
      setDraft({ ...draft, user_id: "", work_date: "", role: "" })
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const publish = useMutation({
    mutationFn: () => api("/api/v1/staff/week/publish", { method: "POST", json: { week_start: weekStart } }),
    onSuccess: async () => {
      toast.success(t("week_published"))
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const removeShift = useMutation({
    mutationFn: (id: number) => api(`/api/v1/staff/shifts/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const clock = useMutation({
    mutationFn: (direction: "in" | "out") => api("/api/v1/staff/clock", { method: "POST", json: { direction } }),
    onSuccess: async () => {
      toast.success(t("clocked"))
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const askLeave = useMutation({
    mutationFn: () =>
      api("/api/v1/staff/leave", {
        method: "POST",
        json: {
          user_id: leaveDraft.user_id ? Number(leaveDraft.user_id) : undefined,
          type: leaveDraft.type,
          starts_on: leaveDraft.starts_on,
          ends_on: leaveDraft.ends_on,
          reason: leaveDraft.reason || undefined,
        },
      }),
    onSuccess: async () => {
      toast.success(t("leave_requested"))
      setLeaveDraft({ ...leaveDraft, starts_on: "", ends_on: "", reason: "" })
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const decideLeave = useMutation({
    mutationFn: ({ id, approve }: { id: number; approve: boolean }) =>
      api(`/api/v1/staff/leave/${id}/decide`, { method: "POST", json: { approve } }),
    onSuccess: async () => {
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const buildRun = useMutation({
    mutationFn: () =>
      api("/api/v1/staff/payroll", {
        method: "POST",
        json: { period_start: payPeriod.start, period_end: payPeriod.end },
      }),
    onSuccess: async (data) => {
      toast.success(t("run_built"))
      const id = (data as { data?: { id?: number } })?.data?.id
      if (id) setOpenRun(id)
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const postRun = useMutation({
    mutationFn: (id: number) => api(`/api/v1/staff/payroll/${id}/post`, { method: "POST" }),
    onSuccess: async () => {
      toast.success(t("run_posted"))
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const saveContract = useMutation({
    mutationFn: () =>
      api("/api/v1/staff/contracts", {
        method: "POST",
        json: {
          user_id: Number(contractDraft.user_id),
          pay_type: contractDraft.pay_type,
          base_rate_minor: Number(contractDraft.base_rate_minor),
          weekly_hours: Number(contractDraft.weekly_hours),
        },
      }),
    onSuccess: async () => {
      toast.success(t("contract_saved"))
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const shiftWeek = (delta: number) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + delta * 7)
    setWeekStart(isoDate(d))
  }

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      <div className="flex flex-wrap gap-2">
        {(["rota", "leave", "payroll", "contracts"] as Tab[]).map((kind) => (
          <Button key={kind} size="sm" variant={tab === kind ? "default" : "outline"} onClick={() => setTab(kind)}>
            {t(`tab_${kind}`)}
          </Button>
        ))}
      </div>

      <CafeSection title={t("clock_title")} description={t("clock_hint")}>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => clock.mutate("in")} disabled={clock.isPending}>
            {t("clock_in")}
          </Button>
          <Button variant="outline" onClick={() => clock.mutate("out")} disabled={clock.isPending}>
            {t("clock_out")}
          </Button>
          <span className="text-muted-foreground text-xs">
            {t("on_duty")}:{" "}
            {(onDuty.data?.length ?? 0) === 0
              ? t("nobody")
              : onDuty.data!.map((row) => row.name).join(locale === "fa" ? "، " : ", ")}
          </span>
        </div>
      </CafeSection>

      {tab === "rota" ? (
        <CafeSection
          title={`${t("rota_title")} ${weekStart}`}
          description={t("rota_hint")}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => shiftWeek(-1)}>
                {t("prev_week")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => shiftWeek(1)}>
                {t("next_week")}
              </Button>
              <Button size="sm" onClick={() => publish.mutate()} disabled={publish.isPending}>
                {t("publish")}
              </Button>
            </div>
          }
        >
          <div className="grid gap-2 sm:grid-cols-6">
            <div className="space-y-1">
              <Label htmlFor="shift-user">{t("employee_id")}</Label>
              <Input
                id="shift-user"
                value={draft.user_id}
                inputMode="numeric"
                onChange={(e) => setDraft({ ...draft, user_id: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shift-date">{t("work_date")}</Label>
              <LocaleDatePicker
                locale={locale}
                id="shift-date"
                value={draft.work_date}
                onChange={(v) => setDraft({ ...draft, work_date: v ?? "" })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shift-start">{t("starts_at")}</Label>
              <Input
                id="shift-start"
                type="time"
                value={draft.starts_at}
                onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shift-end">{t("ends_at")}</Label>
              <Input
                id="shift-end"
                type="time"
                value={draft.ends_at}
                onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shift-role">{t("role")}</Label>
              <Input
                id="shift-role"
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                placeholder={t("role_ph")}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => addShift.mutate()}
                disabled={addShift.isPending || draft.user_id.trim() === "" || draft.work_date === ""}
              >
                {t("add_shift")}
              </Button>
            </div>
          </div>

          {!week.data || week.data.days.every((day) => day.shifts.length === 0) ? (
            <CafeEmptyState message={t("rota_empty")} />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("work_date")}</TableHead>
                    <TableHead>{t("employee")}</TableHead>
                    <TableHead>{t("hours")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead>{t("role")}</TableHead>
                    <TableHead>{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {week.data.days.flatMap((day) =>
                    day.shifts.map((shift) => (
                      <TableRow key={shift.id}>
                        <TableCell>{formatDisplayDate(shift.work_date, locale)}</TableCell>
                        <TableCell>{shift.name}</TableCell>
                        <TableCell className="tabular-nums">
                          {toLocaleDigits(String(shift.hours), locale)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={shift.status === "published" ? "secondary" : "outline"}>
                            {shift.status === "published" ? t("status_published") : t("status_planned")}
                          </Badge>
                        </TableCell>
                        <TableCell>{shift.role ?? "—"}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => removeShift.mutate(shift.id)}
                          >
                            {t("remove")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )),
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {(week.data?.leave?.length ?? 0) > 0 ? (
            <div className="rounded-lg border p-3">
              <p className="mb-1 text-sm font-medium">{t("leave_this_week")}</p>
              <ul className="text-muted-foreground space-y-0.5 text-xs">
                {week.data!.leave.map((row) => (
                  <li key={row.id}>
                    {row.name} — {t(`leave_${row.type}`)} ({formatDisplayDate(row.starts_on, locale)} → {formatDisplayDate(row.ends_on, locale)})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CafeSection>
      ) : null}

      {tab === "leave" ? (
        <CafeSection title={t("leave_title")} description={t("leave_hint")}>
          <div className="grid gap-2 sm:grid-cols-6">
            <div className="space-y-1">
              <Label htmlFor="leave-user">{t("employee_id")}</Label>
              <Input
                id="leave-user"
                value={leaveDraft.user_id}
                inputMode="numeric"
                onChange={(e) => setLeaveDraft({ ...leaveDraft, user_id: e.target.value })}
                placeholder={t("self")}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="leave-type">{t("leave_type")}</Label>
              <select
                id="leave-type"
                className={cafeSelectClass}
                value={leaveDraft.type}
                onChange={(e) => setLeaveDraft({ ...leaveDraft, type: e.target.value })}
              >
                <option value="annual">{t("leave_annual")}</option>
                <option value="sick">{t("leave_sick")}</option>
                <option value="unpaid">{t("leave_unpaid")}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="leave-start">{t("from")}</Label>
              <LocaleDatePicker
                locale={locale}
                id="leave-start"
                value={leaveDraft.starts_on}
                onChange={(v) => setLeaveDraft({ ...leaveDraft, starts_on: v ?? "" })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="leave-end">{t("to")}</Label>
              <LocaleDatePicker
                locale={locale}
                id="leave-end"
                value={leaveDraft.ends_on}
                onChange={(v) => setLeaveDraft({ ...leaveDraft, ends_on: v ?? "" })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="leave-reason">{t("reason")}</Label>
              <Input
                id="leave-reason"
                value={leaveDraft.reason}
                onChange={(e) => setLeaveDraft({ ...leaveDraft, reason: e.target.value })}
              />
            </div>
          </div>
          <Button
            onClick={() => askLeave.mutate()}
            disabled={askLeave.isPending || leaveDraft.starts_on === "" || leaveDraft.ends_on === ""}
          >
            {t("request_leave")}
          </Button>

          {(leave.data?.length ?? 0) === 0 ? (
            <CafeEmptyState message={t("leave_empty")} />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("employee")}</TableHead>
                    <TableHead>{t("leave_type")}</TableHead>
                    <TableHead>{t("from")}</TableHead>
                    <TableHead>{t("to")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead>{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leave.data!.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{t(`leave_${row.type}`)}</TableCell>
                      <TableCell>{formatDisplayDate(row.starts_on, locale)}</TableCell>
                      <TableCell>{formatDisplayDate(row.ends_on, locale)}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "approved" ? "secondary" : row.status === "rejected" ? "destructive" : "outline"}>
                          {t(`leave_status_${row.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.status === "pending" ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              onClick={() => decideLeave.mutate({ id: row.id, approve: true })}
                              disabled={decideLeave.isPending}
                            >
                              {t("approve")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => decideLeave.mutate({ id: row.id, approve: false })}
                              disabled={decideLeave.isPending}
                            >
                              {t("reject")}
                            </Button>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CafeSection>
      ) : null}

      {tab === "payroll" ? (
        <CafeSection title={t("payroll_title")} description={t("payroll_hint")}>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="pay-start">{t("period_start")}</Label>
              <LocaleDatePicker
                locale={locale}
                id="pay-start"
                value={payPeriod.start}
                onChange={(v) => setPayPeriod({ ...payPeriod, start: v ?? "" })}
                className="w-36"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pay-end">{t("period_end")}</Label>
              <LocaleDatePicker
                locale={locale}
                id="pay-end"
                value={payPeriod.end}
                onChange={(v) => setPayPeriod({ ...payPeriod, end: v ?? "" })}
                className="w-36"
              />
            </div>
            <Button onClick={() => buildRun.mutate()} disabled={buildRun.isPending}>
              {t("build_run")}
            </Button>
          </div>

          {(runs.data?.length ?? 0) === 0 ? (
            <CafeEmptyState message={t("payroll_empty")} />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("period")}</TableHead>
                    <TableHead>{t("gross")}</TableHead>
                    <TableHead>{t("net")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead>{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.data!.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        {run.period_start} → {run.period_end}
                      </TableCell>
                      <TableCell>
                        <MoneyText amount={run.gross_total_minor} />
                      </TableCell>
                      <TableCell>
                        <MoneyText amount={run.net_total_minor} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={run.status === "posted" ? "secondary" : "outline"}>
                          {run.status === "posted" ? t("run_posted") : t("run_draft")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => setOpenRun(run.id)}>
                            {t("view")}
                          </Button>
                          {run.status !== "posted" ? (
                            <Button size="sm" onClick={() => postRun.mutate(run.id)} disabled={postRun.isPending}>
                              {t("post_run")}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {runDetail.data ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("employee")}</TableHead>
                    <TableHead>{t("hours")}</TableHead>
                    <TableHead>{t("gross")}</TableHead>
                    <TableHead>{t("employee_insurance")}</TableHead>
                    <TableHead>{t("employer_insurance")}</TableHead>
                    <TableHead>{t("tax")}</TableHead>
                    <TableHead>{t("net")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runDetail.data.lines.map((line) => (
                    <TableRow key={line.user_id}>
                      <TableCell>{line.name}</TableCell>
                      <TableCell className="tabular-nums">
                        {toLocaleDigits(String(line.hours), locale)}
                        {line.overtime_hours > 0 ? (
                          <span className="text-muted-foreground">
                            {" "}
                            +{toLocaleDigits(String(line.overtime_hours), locale)}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <MoneyText amount={line.gross_minor} />
                      </TableCell>
                      <TableCell>
                        <MoneyText amount={line.employee_insurance_minor} />
                      </TableCell>
                      <TableCell>
                        <MoneyText amount={line.employer_insurance_minor} />
                      </TableCell>
                      <TableCell>
                        <MoneyText amount={line.tax_minor} />
                      </TableCell>
                      <TableCell className="font-medium">
                        <MoneyText amount={line.net_minor} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {(onDuty.data?.length ?? 0) > 0 ? (
            <p className="text-muted-foreground text-xs">
              {t("on_duty_since")}:{" "}
              {onDuty.data!.map((row) => `${row.name} (${formatDisplayDateTime(row.since, locale)})`).join(locale === "fa" ? "، " : ", ")}
            </p>
          ) : null}
        </CafeSection>
      ) : null}

      {tab === "contracts" ? (
        <CafeSection title={t("contracts_title")} description={t("contracts_hint")}>
          <div className="grid gap-2 sm:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="contract-user">{t("employee_id")}</Label>
              <Input
                id="contract-user"
                value={contractDraft.user_id}
                inputMode="numeric"
                onChange={(e) => setContractDraft({ ...contractDraft, user_id: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contract-type">{t("pay_type")}</Label>
              <select
                id="contract-type"
                className={cafeSelectClass}
                value={contractDraft.pay_type}
                onChange={(e) => setContractDraft({ ...contractDraft, pay_type: e.target.value })}
              >
                <option value="monthly">{t("pay_monthly")}</option>
                <option value="hourly">{t("pay_hourly")}</option>
                <option value="daily">{t("pay_daily")}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="contract-rate">{t("base_rate")}</Label>
              <Input
                id="contract-rate"
                value={contractDraft.base_rate_minor}
                inputMode="numeric"
                onChange={(e) => setContractDraft({ ...contractDraft, base_rate_minor: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contract-hours">{t("weekly_hours")}</Label>
              <Input
                id="contract-hours"
                value={contractDraft.weekly_hours}
                inputMode="decimal"
                onChange={(e) => setContractDraft({ ...contractDraft, weekly_hours: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => saveContract.mutate()}
                disabled={saveContract.isPending || contractDraft.user_id.trim() === ""}
              >
                {t("save_contract")}
              </Button>
            </div>
          </div>

          {(contracts.data?.length ?? 0) === 0 ? (
            <CafeEmptyState message={t("contracts_empty")} />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("employee")}</TableHead>
                    <TableHead>{t("pay_type")}</TableHead>
                    <TableHead>{t("base_rate")}</TableHead>
                    <TableHead>{t("weekly_hours")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts.data!.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{t(`pay_${row.pay_type}`)}</TableCell>
                      <TableCell>
                        <MoneyText amount={row.base_rate_minor} />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {toLocaleDigits(String(row.weekly_hours), locale)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.is_active ? "secondary" : "outline"}>
                          {row.is_active ? t("active") : t("inactive")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CafeSection>
      ) : null}
    </CafeAdminShell>
  )
}
