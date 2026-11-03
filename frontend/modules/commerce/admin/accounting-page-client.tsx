"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { useEnumLabel } from "@/lib/enum-labels"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { formatDate } from "@/lib/locale/format-date"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { AccountingTaxPanel } from "@/views/settings/panels/AccountingSettingsPanels"

type AccOverview = {
  journals_count: number
  persons_count: number
  accounts_count: number
  draft_journals: number
  invoices_count?: number
  synced_orders_count?: number
  pending_moadian?: number
  moadian_accepted?: number
}

type AccJournal = {
  id: number
  number: string
  date: string
  description?: string | null
  status: string
  total_debit_minor: number
  order_id?: number | null
  source?: string
}

type AccPerson = { id: number; name: string; type: string; phone?: string | null }
type AccAccount = { id: number; code: string; name: string; type: string }

type AccInvoice = {
  id: number
  number: string
  status: string
  issue_date: string
  total_minor: number
  tax_minor?: number
  moadian_status?: string | null
  moadian_reference?: string | null
  order_id?: number | null
  order?: { id: number; number?: string | null; status?: string } | null
  person?: { id: number; name: string } | null
}

type MoadianSettings = {
  enabled?: boolean
  economic_code?: string
  national_id?: string
  fiscal_id?: string
  api_key?: string
  client_id?: string
  client_secret?: string
  private_key?: string
  base_url?: string
  hook_url?: string
  sandbox?: boolean
  sandbox_base_url?: string
  auto_send_on_sync?: boolean
  has_api_key?: boolean
  has_client_secret?: boolean
  has_private_key?: boolean
  configured?: boolean
}

type MoadianJob = {
  id: number
  action: string
  status: string
  attempts: number
  last_error?: string | null
  reference_number?: string | null
  invoice?: { id: number; number: string; order_id?: number | null } | null
}

type IntegrationRow = {
  id: string
  label_fa: string
  label_en: string
  status: string
  coming_soon: boolean
  enabled: boolean
  configured: boolean
  settings: Record<string, unknown>
  marketplace_path?: string
}

type OrdersSyncPayload = {
  rows: Array<{
    order: { id: number; number?: string | null; status: string; total_minor: number; customer_name?: string | null }
    synced: boolean
    invoice?: AccInvoice | null
  }>
  unsynced_count: number
  synced_count: number
}

type LedgerPayload = {
  lines: Array<Record<string, unknown>>
  source?: string
  erp_unavailable?: boolean
  message?: string
  totals?: { debit_minor?: number; credit_minor?: number }
}

type ReportsPayload = {
  sales_total_minor: number
  tax_total_minor: number
  invoice_count: number
  eligible_orders: number
  synced_orders: number
  unsynced_orders: number
  moadian_breakdown: Record<string, number>
  recent_invoices: AccInvoice[]
}

const LIVE_SECTIONS = new Set([
  "overview",
  "journals",
  "persons",
  "chart",
  "invoices",
  "orders-sync",
  "moadian",
  "integrations",
  "hesabfa",
  "ledger",
  "tax",
  "tax-setup",
  "reports",
])

function sectionFromRoute(route: ResolvedAdminRoute): string {
  if (route.path === "accounting") return "overview"
  const prefix = "accounting/"
  if (route.path.startsWith(prefix)) return route.path.slice(prefix.length)
  return "overview"
}

export default function AccountingPageClient({ route }: { route: ResolvedAdminRoute }) {
  const enumLabel = useEnumLabel()
  const tNav = useTranslations("nav")
  const tMod = useTranslations("modules")
  const tAcc = useTranslations("accounting_portal")
  const tCommon = useTranslations("common")
  const locale = normalizeUiLocale(useLocale())
  const section = useMemo(() => sectionFromRoute(route), [route.path])
  const qc = useQueryClient()
  const isSoon = !LIVE_SECTIONS.has(section)

  const statusQ = useQuery({
    queryKey: ["accounting", "status"],
    queryFn: () => api<{ licensed: boolean; bundle_present: boolean; source_configured: boolean }>("/api/v1/accounting/status"),
  })

  const overviewQ = useQuery({
    queryKey: ["accounting", "overview"],
    queryFn: () => api<AccOverview>("/api/v1/accounting/overview"),
    enabled: section === "overview",
  })

  const journalsQ = useQuery({
    queryKey: ["accounting", "journals"],
    queryFn: () => api<AccJournal[]>("/api/v1/accounting/journals"),
    enabled: section === "journals",
  })

  const personsQ = useQuery({
    queryKey: ["accounting", "persons"],
    queryFn: () => api<AccPerson[]>("/api/v1/accounting/persons"),
    enabled: section === "persons",
  })

  const accountsQ = useQuery({
    queryKey: ["accounting", "accounts"],
    queryFn: () => api<AccAccount[]>("/api/v1/accounting/accounts"),
    enabled: section === "chart",
  })

  const ledgerQ = useQuery({
    queryKey: ["accounting", "ledger"],
    queryFn: () => api<LedgerPayload>("/api/v1/accounting/ledger"),
    enabled: section === "overview" || section === "ledger" || section === "journals" || section === "reports",
  })

  const reportsQ = useQuery({
    queryKey: ["accounting", "reports"],
    queryFn: () => api<ReportsPayload>("/api/v1/accounting/reports"),
    enabled: section === "reports" || section === "overview",
  })

  const invoicesQ = useQuery({
    queryKey: ["accounting", "invoices"],
    queryFn: () => api<AccInvoice[]>("/api/v1/accounting/invoices"),
    enabled: section === "invoices" || section === "overview" || section === "reports",
  })

  const ordersSyncQ = useQuery({
    queryKey: ["accounting", "orders-sync"],
    queryFn: () => api<OrdersSyncPayload>("/api/v1/accounting/orders-sync"),
    enabled: section === "orders-sync" || section === "overview",
  })

  const moadianSettingsQ = useQuery({
    queryKey: ["accounting", "moadian", "settings"],
    queryFn: () => api<MoadianSettings>("/api/v1/accounting/moadian/settings"),
    enabled: section === "moadian",
  })

  const moadianJobsQ = useQuery({
    queryKey: ["accounting", "moadian", "jobs"],
    queryFn: () => api<MoadianJob[]>("/api/v1/accounting/moadian/jobs"),
    enabled: section === "moadian",
  })

  const integrationsQ = useQuery({
    queryKey: ["accounting", "integrations"],
    queryFn: () => api<{ platforms: IntegrationRow[] }>("/api/v1/accounting/integrations"),
    enabled: section === "integrations" || section === "hesabfa",
  })

  const [journalForm, setJournalForm] = useState({
    number: "",
    date: new Date().toISOString().slice(0, 10),
    description: "",
    debitCode: "101",
    debitName: tAcc("defaults.cash"),
    debitMinor: "10000",
    creditCode: "201",
    creditName: tAcc("defaults.equity"),
    creditMinor: "10000",
  })

  const [personForm, setPersonForm] = useState({ name: "", type: "customer", phone: "" })
  const [accountForm, setAccountForm] = useState({ code: "", name: "", type: "asset" })
  const [moadianDraft, setMoadianDraft] = useState<MoadianSettings | null>(null)
  const [hesabfaDraft, setHesabfaDraft] = useState({
    api_key: "",
    login_token: "",
    user_id: "",
    password: "",
    enabled: false,
    auto_sync_orders: true,
    hydrated: false,
  })

  const createJournal = useMutation({
    mutationFn: () =>
      api("/api/v1/accounting/journals", {
        method: "POST",
        json: {
          number: journalForm.number,
          date: journalForm.date,
          description: journalForm.description || null,
          lines: [
            {
              account_code: journalForm.debitCode,
              account_name: journalForm.debitName,
              debit_minor: Number(journalForm.debitMinor) || 0,
              credit_minor: 0,
            },
            {
              account_code: journalForm.creditCode,
              account_name: journalForm.creditName,
              debit_minor: 0,
              credit_minor: Number(journalForm.creditMinor) || 0,
            },
          ],
        },
      }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["accounting"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const createPerson = useMutation({
    mutationFn: () =>
      api("/api/v1/accounting/persons", {
        method: "POST",
        json: { name: personForm.name, type: personForm.type, phone: personForm.phone || null },
      }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setPersonForm({ name: "", type: "customer", phone: "" })
      void qc.invalidateQueries({ queryKey: ["accounting", "persons"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const createAccount = useMutation({
    mutationFn: () =>
      api("/api/v1/accounting/accounts", {
        method: "POST",
        json: accountForm,
      }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setAccountForm({ code: "", name: "", type: "asset" })
      void qc.invalidateQueries({ queryKey: ["accounting", "accounts"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const syncBulk = useMutation({
    mutationFn: () => api("/api/v1/accounting/sync/orders", { method: "POST", json: { limit: 50 } }),
    onSuccess: () => {
      toast.success(tAcc("sync_done"))
      void qc.invalidateQueries({ queryKey: ["accounting"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const syncOne = useMutation({
    mutationFn: (orderId: number) => api(`/api/v1/accounting/sync/order/${orderId}`, { method: "POST" }),
    onSuccess: () => {
      toast.success(tAcc("sync_done"))
      void qc.invalidateQueries({ queryKey: ["accounting"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const sendMoadianInvoice = useMutation({
    mutationFn: (invoiceId: number) => api(`/api/v1/accounting/moadian/invoices/${invoiceId}/send`, { method: "POST" }),
    onSuccess: () => {
      toast.success(tAcc("moadian_sent"))
      void qc.invalidateQueries({ queryKey: ["accounting"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const saveMoadian = useMutation({
    mutationFn: () =>
      api("/api/v1/accounting/moadian/settings", {
        method: "PUT",
        json: moadianDraft ?? {},
      }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["accounting", "moadian"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const processMoadian = useMutation({
    mutationFn: () => api("/api/v1/accounting/moadian/process", { method: "POST", json: { limit: 20 } }),
    onSuccess: () => {
      toast.success(tAcc("moadian_processed"))
      void qc.invalidateQueries({ queryKey: ["accounting", "moadian"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const retryMoadian = useMutation({
    mutationFn: (jobId: number) => api(`/api/v1/accounting/moadian/jobs/${jobId}/retry`, { method: "POST" }),
    onSuccess: () => {
      toast.success(tAcc("moadian_retried"))
      void qc.invalidateQueries({ queryKey: ["accounting", "moadian"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const saveHesabfa = useMutation({
    mutationFn: () => {
      const { hydrated: _hydrated, ...payload } = hesabfaDraft
      return api("/api/v1/accounting/integrations/hesabfa", {
        method: "PUT",
        json: payload,
      })
    },
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["accounting", "integrations"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const testHesabfa = useMutation({
    mutationFn: () => api("/api/v1/accounting/integrations/hesabfa/test", { method: "POST" }),
    onSuccess: (res: { ok?: boolean; message?: string }) => {
      if (res?.ok) toast.success(tAcc("integration_ok"))
      else toast.error(res?.message || tAcc("integration_fail"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const toggleIntegration = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api(`/api/v1/accounting/integrations/${id}`, { method: "PUT", json: { enabled } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["accounting", "integrations"] }),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const pushHesabfa = useMutation({
    mutationFn: (invoiceId: number) =>
      api(`/api/v1/accounting/integrations/hesabfa/invoices/${invoiceId}/push`, { method: "POST" }),
    onSuccess: (res: { ok?: boolean; message?: string }) => {
      if (res?.ok === false) toast.error(res.message || tAcc("integration_fail"))
      else toast.success(tAcc("push_hesabfa"))
      void qc.invalidateQueries({ queryKey: ["accounting"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  useEffect(() => {
    if (section === "moadian" && moadianSettingsQ.data && moadianDraft === null) {
      setMoadianDraft(moadianSettingsQ.data)
    }
  }, [section, moadianSettingsQ.data, moadianDraft])

  useEffect(() => {
    if (!(section === "integrations" || section === "hesabfa") || hesabfaDraft.hydrated) return
    const row = integrationsQ.data?.platforms?.find((p) => p.id === "hesabfa")
    if (!row) return
    setHesabfaDraft({
      api_key: "",
      login_token: "",
      user_id: String(row.settings?.user_id ?? ""),
      password: "",
      enabled: Boolean(row.enabled),
      auto_sync_orders: row.settings?.auto_sync_orders !== false,
      hydrated: true,
    })
  }, [section, integrationsQ.data, hesabfaDraft.hydrated])

  const titleKey =
    section === "chart"
      ? "accounting_chart"
      : section === "overview"
        ? "accounting_overview"
        : section === "orders-sync"
          ? "accounting_orders_sync"
          : section === "integrations" || section === "hesabfa"
            ? "accounting_integrations"
            : section === "tax-setup"
              ? "accounting_tax_setup"
              : `accounting_${section.replace(/-/g, "_")}`
  const title = tNav.has(titleKey as never) ? tNav(titleKey as never) : section

  const subnav = [
    { path: "overview", label: tNav("accounting_overview") },
    { path: "invoices", label: tNav("accounting_invoices") },
    { path: "orders-sync", label: tNav("accounting_orders_sync") },
    { path: "moadian", label: tNav("accounting_moadian") },
    { path: "integrations", label: tNav("accounting_integrations") },
    { path: "tax", label: tNav("accounting_tax") },
    { path: "reports", label: tNav("accounting_reports") },
    { path: "journals", label: tNav("accounting_journals") },
    { path: "persons", label: tNav("accounting_persons") },
    { path: "chart", label: tNav("accounting_chart") },
    { path: "ledger", label: tAcc("ledger_title") },
  ]

  let body: ReactNode = null

  if (isSoon) {
    body = (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{title}</CardTitle>
            <Badge variant="secondary">{tAcc("coming_soon")}</Badge>
          </div>
          <CardDescription>{tAcc("placeholder_section")}</CardDescription>
        </CardHeader>
      </Card>
    )
  } else if (section === "overview") {
    body = (
      <>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">{tAcc("overview_hint")}</p>
        {statusQ.data ? (
          <ul className="text-muted-foreground mb-6 list-inside list-disc text-sm">
            <li>
              {tMod("accounting_row_license")}: {statusQ.data.licensed ? tCommon("yes") : tCommon("no")}
            </li>
            <li>
              {tAcc("ledger_title")}: {ledgerQ.data?.source === "erp" ? tAcc("ledger_erp") : tAcc("ledger_local")}
            </li>
          </ul>
        ) : null}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["invoices_count", overviewQ.data?.invoices_count],
            ["synced_orders_count", overviewQ.data?.synced_orders_count],
            ["moadian_accepted", overviewQ.data?.moadian_accepted],
            ["pending_moadian", overviewQ.data?.pending_moadian],
            ["journals_count", overviewQ.data?.journals_count],
            ["persons_count", overviewQ.data?.persons_count],
            ["accounts_count", overviewQ.data?.accounts_count],
            ["draft_journals", overviewQ.data?.draft_journals],
          ].map(([key, val]) => (
            <Card key={key as string}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{tAcc(key as never)}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {typeof val === "number" ? formatNumber(val, locale) : "—"}
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{tAcc("orders_sync")}</CardTitle>
              <Button size="sm" disabled={syncBulk.isPending} onClick={() => void syncBulk.mutateAsync()}>
                {tAcc("sync_unsynced")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {tAcc("unsynced_count", { count: ordersSyncQ.data?.unsynced_count ?? 0 })}
              </p>
              {(ordersSyncQ.data?.rows ?? [])
                .filter((r) => !r.synced)
                .slice(0, 5)
                .map((r) => (
                  <div key={r.order.id} className="flex items-center justify-between gap-2 border-b py-2">
                    <Link className="hover:underline" href={`/dashboard/orders/${r.order.id}`}>
                      {r.order.number || `#${r.order.id}`}
                    </Link>
                    <Button size="sm" variant="outline" disabled={syncOne.isPending} onClick={() => void syncOne.mutateAsync(r.order.id)}>
                      {tAcc("sync_one")}
                    </Button>
                  </div>
                ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tAcc("recent_invoices")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(invoicesQ.data ?? []).slice(0, 6).map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
                  <div>
                    <div className="font-medium">{inv.number}</div>
                    <div className="text-muted-foreground text-xs">
                      {inv.order?.number ? (
                        <Link className="hover:underline" href={`/dashboard/orders/${inv.order_id}`}>
                          {inv.order.number}
                        </Link>
                      ) : (
                        "—"
                      )}{" "}
                      · {inv.moadian_status || tAcc("moadian_not_sent")}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={sendMoadianInvoice.isPending || inv.moadian_status === "accepted"}
                    onClick={() => void sendMoadianInvoice.mutateAsync(inv.id)}
                  >
                    {tAcc("send_moadian")}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </>
    )
  } else if (section === "invoices") {
    body = (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tAcc("invoice_list")}</CardTitle>
          <CardDescription>{tAcc("invoice_list_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(invoicesQ.data ?? []).map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3">
              <div className="min-w-0 space-y-1">
                <div className="font-medium">
                  {inv.number}{" "}
                  <Badge variant="outline">{inv.status}</Badge>{" "}
                  {inv.moadian_status ? <Badge variant="secondary">{inv.moadian_status}</Badge> : null}
                </div>
                <div className="text-muted-foreground text-xs">
                  {inv.issue_date ? formatDate(inv.issue_date, { locale }) : "—"} ·{" "}
                  {formatNumber(inv.total_minor, locale)} · {inv.person?.name || "—"}
                  {inv.order_id ? (
                    <>
                      {" · "}
                      <Link className="hover:underline" href={`/dashboard/orders/${inv.order_id}`}>
                        {inv.order?.number || `#${inv.order_id}`}
                      </Link>
                    </>
                  ) : null}
                  {inv.moadian_reference ? <> · ref {inv.moadian_reference}</> : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={sendMoadianInvoice.isPending || inv.moadian_status === "accepted"}
                  onClick={() => void sendMoadianInvoice.mutateAsync(inv.id)}
                >
                  {tAcc("send_moadian")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pushHesabfa.isPending}
                  onClick={() => void pushHesabfa.mutateAsync(inv.id)}
                >
                  {tAcc("push_hesabfa")}
                </Button>
              </div>
            </div>
          ))}
          {!invoicesQ.data?.length && !invoicesQ.isLoading ? (
            <p className="text-muted-foreground">{tAcc("empty_invoices")}</p>
          ) : null}
        </CardContent>
      </Card>
    )
  } else if (section === "orders-sync") {
    body = (
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{tAcc("orders_sync")}</CardTitle>
            <CardDescription>{tAcc("orders_sync_hint")}</CardDescription>
          </div>
          <Button disabled={syncBulk.isPending} onClick={() => void syncBulk.mutateAsync()}>
            {tAcc("sync_unsynced")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(ordersSyncQ.data?.rows ?? []).map((r) => (
            <div key={r.order.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
              <div>
                <Link className="font-medium hover:underline" href={`/dashboard/orders/${r.order.id}`}>
                  {r.order.number || `#${r.order.id}`}
                </Link>
                <div className="text-muted-foreground text-xs">
                  {enumLabel("order_status", r.order.status)} · {r.order.customer_name || "—"} ·{" "}
                  {formatNumber(r.order.total_minor, locale)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {r.synced ? (
                  <Badge variant="secondary">{tAcc("synced")}</Badge>
                ) : (
                  <Badge variant="outline">{tAcc("not_synced")}</Badge>
                )}
                {!r.synced ? (
                  <Button size="sm" variant="outline" disabled={syncOne.isPending} onClick={() => void syncOne.mutateAsync(r.order.id)}>
                    {tAcc("sync_one")}
                  </Button>
                ) : r.invoice ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={sendMoadianInvoice.isPending || r.invoice.moadian_status === "accepted"}
                    onClick={() => void sendMoadianInvoice.mutateAsync(r.invoice!.id)}
                  >
                    {tAcc("send_moadian")}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    )
  } else if (section === "moadian") {
    const draft = moadianDraft ?? moadianSettingsQ.data ?? {}
    body = (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{tAcc("moadian_settings")}</CardTitle>
              <Badge variant={draft.configured || draft.enabled ? "secondary" : "outline"}>
                {draft.configured || draft.enabled
                  ? tAcc("moadian_status_configured")
                  : tAcc("moadian_status_not_configured")}
              </Badge>
            </div>
            <CardDescription>{tAcc("moadian_settings_hint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label>{tAcc("moadian_enabled")}</Label>
              <Switch
                checked={Boolean(draft.enabled)}
                onCheckedChange={(v) => setMoadianDraft({ ...draft, enabled: v })}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label>{tAcc("moadian_sandbox")}</Label>
              <Switch
                checked={draft.sandbox !== false}
                onCheckedChange={(v) => setMoadianDraft({ ...draft, sandbox: v })}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label>{tAcc("moadian_auto_send")}</Label>
              <Switch
                checked={Boolean(draft.auto_send_on_sync)}
                onCheckedChange={(v) => setMoadianDraft({ ...draft, auto_send_on_sync: v })}
              />
            </div>
            {(
              [
                ["economic_code", tAcc("moadian_economic_code")],
                ["national_id", tAcc("moadian_national_id")],
                ["fiscal_id", tAcc("moadian_fiscal_id")],
                ["client_id", tAcc("moadian_client_id")],
                ["base_url", tAcc("moadian_base_url")],
                ["hook_url", tAcc("moadian_hook_url")],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="grid gap-1.5">
                <Label>{label}</Label>
                <Input
                  dir="ltr"
                  value={String(draft[key] ?? "")}
                  onChange={(e) => setMoadianDraft({ ...draft, [key]: e.target.value })}
                />
              </div>
            ))}
            <div className="grid gap-1.5">
              <Label>
                {tAcc("moadian_api_key")}
                {draft.has_api_key ? ` (${tAcc("secret_set")})` : ""}
              </Label>
              <Input
                type="password"
                dir="ltr"
                value={draft.api_key ?? ""}
                onChange={(e) => setMoadianDraft({ ...draft, api_key: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>
                {tAcc("moadian_client_secret")}
                {draft.has_client_secret ? ` (${tAcc("secret_set")})` : ""}
              </Label>
              <Input
                type="password"
                dir="ltr"
                value={draft.client_secret ?? ""}
                onChange={(e) => setMoadianDraft({ ...draft, client_secret: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>
                {tAcc("moadian_private_key")}
                {draft.has_private_key ? ` (${tAcc("secret_set")})` : ""}
              </Label>
              <Input
                type="password"
                dir="ltr"
                value={draft.private_key ?? ""}
                onChange={(e) => setMoadianDraft({ ...draft, private_key: e.target.value })}
              />
            </div>
            <Button disabled={saveMoadian.isPending} onClick={() => void saveMoadian.mutateAsync()}>
              {tCommon("save")}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">{tAcc("moadian_jobs")}</CardTitle>
              <CardDescription>{tAcc("moadian_jobs_hint")}</CardDescription>
            </div>
            <Button size="sm" variant="outline" disabled={processMoadian.isPending} onClick={() => void processMoadian.mutateAsync()}>
              {tAcc("moadian_process")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(moadianJobsQ.data ?? []).map((job) => (
              <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
                <div>
                  <div className="font-medium">
                    #{job.id} · {job.invoice?.number || "—"} · <Badge variant="outline">{job.status}</Badge>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {job.action} · attempts {job.attempts}
                    {job.reference_number ? ` · ${job.reference_number}` : ""}
                    {job.last_error ? ` · ${job.last_error}` : ""}
                  </div>
                </div>
                {job.status === "failed" || job.status === "retry" ? (
                  <Button size="sm" variant="secondary" disabled={retryMoadian.isPending} onClick={() => void retryMoadian.mutateAsync(job.id)}>
                    {tAcc("moadian_retry")}
                  </Button>
                ) : null}
              </div>
            ))}
            {!moadianJobsQ.data?.length && !moadianJobsQ.isLoading ? (
              <p className="text-muted-foreground">{tAcc("moadian_jobs_empty")}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    )
  } else if (section === "tax" || section === "tax-setup") {
    body = (
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">{tAcc("tax_section_hint")}</p>
        <AccountingTaxPanel />
      </div>
    )
  } else if (section === "reports") {
    const breakdown = reportsQ.data?.moadian_breakdown ?? {}
    body = (
      <div className="space-y-6">
        <p className="text-muted-foreground text-sm">{tAcc("reports_hint")}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["sales_total", reportsQ.data?.sales_total_minor],
            ["tax_total", reportsQ.data?.tax_total_minor],
            ["invoices_count", reportsQ.data?.invoice_count],
            ["synced_orders_count", reportsQ.data?.synced_orders],
            ["eligible_orders", reportsQ.data?.eligible_orders],
            ["unsynced_orders", reportsQ.data?.unsynced_orders],
          ].map(([key, val]) => (
            <Card key={key as string}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{tAcc(key as never)}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {typeof val === "number" ? formatNumber(val, locale) : "—"}
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tAcc("moadian_breakdown")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.keys(breakdown).length === 0 ? (
                <p className="text-muted-foreground">{tAcc("empty_invoices")}</p>
              ) : (
                Object.entries(breakdown).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between border-b py-2">
                    <Badge variant="outline">{status}</Badge>
                    <span>{formatNumber(Number(count), locale)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tAcc("recent_invoices")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(reportsQ.data?.recent_invoices ?? []).map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
                  <div>
                    <div className="font-medium">{inv.number}</div>
                    <div className="text-muted-foreground text-xs">
                      {formatNumber(inv.total_minor, locale)} · {inv.moadian_status || tAcc("moadian_not_sent")}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={sendMoadianInvoice.isPending || inv.moadian_status === "accepted"}
                    onClick={() => void sendMoadianInvoice.mutateAsync(inv.id)}
                  >
                    {tAcc("send_moadian")}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  } else if (section === "ledger") {
    const lines = Array.isArray(ledgerQ.data?.lines) ? ledgerQ.data.lines : []
    body = (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tAcc("ledger_title")}</CardTitle>
          <CardDescription>
            {tAcc("ledger_hint")} ·{" "}
            {ledgerQ.data?.source === "erp" ? tAcc("ledger_erp") : tAcc("ledger_local")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {lines.map((line, idx) => (
            <div key={String(line.id ?? idx)} className="flex flex-wrap justify-between gap-2 border-b py-2 font-mono text-xs">
              <span>
                {String(line.account_code ?? "")} — {String(line.account_name ?? "")}
                {line.document_no ? ` · ${String(line.document_no)}` : ""}
              </span>
              <span>
                D {formatNumber(Number(line.debit_minor ?? line.debit ?? 0), locale)} / C{" "}
                {formatNumber(Number(line.credit_minor ?? line.credit ?? 0), locale)}
              </span>
            </div>
          ))}
          {!lines.length && !ledgerQ.isLoading ? (
            <p className="text-muted-foreground">{tAcc("placeholder_section")}</p>
          ) : null}
        </CardContent>
      </Card>
    )
  } else if (section === "integrations" || section === "hesabfa") {
    const platforms = integrationsQ.data?.platforms ?? []
    const hesabfa = platforms.find((p) => p.id === "hesabfa")
    const liveCount = platforms.filter((p) => !p.coming_soon).length
    body = (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tAcc("marketplace_title")}</CardTitle>
            <CardDescription>
              {tAcc("integrations_hint")} ({liveCount}/{platforms.length} {tAcc("live_badge")})
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {platforms.map((p) => (
                <Card key={p.id} className={p.coming_soon ? "border-dashed opacity-90" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{locale === "en" ? p.label_en : p.label_fa}</CardTitle>
                      {p.coming_soon ? (
                        <Badge variant="secondary">{tAcc("soon_badge")}</Badge>
                      ) : (
                        <Badge variant={p.configured ? "secondary" : "outline"}>
                          {p.configured ? tAcc("configured") : tAcc("live_badge")}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs">{tAcc("enabled")}</Label>
                      <Switch
                        checked={p.enabled}
                        disabled={p.coming_soon || toggleIntegration.isPending}
                        onCheckedChange={(v) => {
                          if (p.coming_soon) {
                            toast.message(tAcc("coming_soon"))
                            return
                          }
                          toggleIntegration.mutate({ id: p.id, enabled: v })
                        }}
                      />
                    </div>
                    {p.id === "hesabfa" ? (
                      <Button asChild size="sm" variant="outline">
                        <a href="#hesabfa-config">{tAcc("configure")}</a>
                      </Button>
                    ) : (
                      <p className="text-muted-foreground text-xs">{tAcc("marketplace_soon")}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {hesabfa ? (
          <Card id="hesabfa-config">
            <CardHeader>
              <CardTitle className="text-base">{tAcc("hesabfa_settings")}</CardTitle>
              <CardDescription>{tAcc("hesabfa_settings_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid max-w-lg gap-3">
              <div className="flex items-center justify-between gap-3">
                <Label>{tAcc("enabled")}</Label>
                <Switch
                  checked={hesabfaDraft.enabled}
                  onCheckedChange={(v) => setHesabfaDraft((s) => ({ ...s, enabled: v }))}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label>{tAcc("hesabfa_auto_sync")}</Label>
                <Switch
                  checked={hesabfaDraft.auto_sync_orders}
                  onCheckedChange={(v) => setHesabfaDraft((s) => ({ ...s, auto_sync_orders: v }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{tAcc("hesabfa_api_key")}</Label>
                <Input
                  type="password"
                  dir="ltr"
                  value={hesabfaDraft.api_key}
                  onChange={(e) => setHesabfaDraft((s) => ({ ...s, api_key: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{tAcc("hesabfa_login_token")}</Label>
                <Input
                  type="password"
                  dir="ltr"
                  value={hesabfaDraft.login_token}
                  onChange={(e) => setHesabfaDraft((s) => ({ ...s, login_token: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{tAcc("hesabfa_user_id")}</Label>
                <Input
                  dir="ltr"
                  value={hesabfaDraft.user_id}
                  onChange={(e) => setHesabfaDraft((s) => ({ ...s, user_id: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{tAcc("hesabfa_password")}</Label>
                <Input
                  type="password"
                  dir="ltr"
                  value={hesabfaDraft.password}
                  onChange={(e) => setHesabfaDraft((s) => ({ ...s, password: e.target.value }))}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={saveHesabfa.isPending} onClick={() => void saveHesabfa.mutateAsync()}>
                  {tCommon("save")}
                </Button>
                <Button variant="outline" disabled={testHesabfa.isPending} onClick={() => void testHesabfa.mutateAsync()}>
                  {tAcc("test_connection")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    )
  } else if (section === "journals") {
    body = (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tAcc("new_journal")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>{tAcc("journal_number")}</Label>
              <Input value={journalForm.number} onChange={(e) => setJournalForm((s) => ({ ...s, number: e.target.value }))} />
            </div>
            <div>
              <Label>{tAcc("journal_date")}</Label>
              <LocaleDatePicker
                locale={locale}
                value={journalForm.date}
                onChange={(value) => setJournalForm((s) => ({ ...s, date: value ?? "" }))}
                aria-label={tAcc("journal_date")}
              />
            </div>
            <Button type="button" disabled={createJournal.isPending || !journalForm.number} onClick={() => void createJournal.mutateAsync()}>
              {tCommon("save")}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tAcc("journal_list")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(journalsQ.data ?? []).map((j) => (
              <div key={j.id} className="flex justify-between border-b py-2">
                <span>
                  {j.number} · {j.date ? formatDate(j.date, { locale }) : "—"}
                  {j.order_id ? (
                    <>
                      {" · "}
                      <Link className="hover:underline" href={`/dashboard/orders/${j.order_id}`}>
                        #{j.order_id}
                      </Link>
                    </>
                  ) : null}
                </span>
                <span className="text-muted-foreground">{enumLabel("job_status", j.status)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  } else if (section === "persons") {
    body = (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tAcc("new_person")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder={tAcc("person_name")} value={personForm.name} onChange={(e) => setPersonForm((s) => ({ ...s, name: e.target.value }))} />
            <Input placeholder={tAcc("person_phone")} value={personForm.phone} onChange={(e) => setPersonForm((s) => ({ ...s, phone: e.target.value }))} />
            <Button type="button" disabled={!personForm.name || createPerson.isPending} onClick={() => void createPerson.mutateAsync()}>
              {tCommon("save")}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="divide-y pt-6 text-sm">
            {(personsQ.data ?? []).map((p) => (
              <div key={p.id} className="py-2">
                {p.name} <span className="text-muted-foreground">({p.type})</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  } else if (section === "chart") {
    body = (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tAcc("new_account")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder={tAcc("account_code")} value={accountForm.code} onChange={(e) => setAccountForm((s) => ({ ...s, code: e.target.value }))} />
            <Input placeholder={tAcc("account_name")} value={accountForm.name} onChange={(e) => setAccountForm((s) => ({ ...s, name: e.target.value }))} />
            <Button type="button" disabled={!accountForm.code || !accountForm.name || createAccount.isPending} onClick={() => void createAccount.mutateAsync()}>
              {tCommon("save")}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="divide-y pt-6 font-mono text-sm">
            {(accountsQ.data ?? []).map((a) => (
              <div key={a.id} className="py-2">
                {a.code} — {a.name}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  } else {
    body = (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">{tAcc("placeholder_section")}</CardContent>
      </Card>
    )
  }

  return (
    <PageShell title={title} description={tAcc("module_description")}>
      <nav className="mb-4 flex flex-wrap gap-2">
        {subnav.map((item) => {
          const active = section === item.path || (section === "hesabfa" && item.path === "integrations")
          return (
            <Button key={item.path} asChild size="sm" variant={active ? "default" : "outline"}>
              <Link href={item.path === "overview" ? "/dashboard/accounting" : `/dashboard/accounting/${item.path}`}>
                {item.label}
              </Link>
            </Button>
          )
        })}
      </nav>
      {body}
    </PageShell>
  )
}
