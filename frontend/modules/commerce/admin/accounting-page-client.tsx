"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { useEnumLabel } from "@/lib/enum-labels"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type AccOverview = {
  journals_count: number
  persons_count: number
  accounts_count: number
  draft_journals: number
}

type AccJournal = {
  id: number
  number: string
  date: string
  description?: string | null
  status: string
  total_debit_minor: number
}

type AccPerson = { id: number; name: string; type: string; phone?: string | null }
type AccAccount = { id: number; code: string; name: string; type: string }

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
  const section = useMemo(() => sectionFromRoute(route), [route.path])
  const qc = useQueryClient()

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

  const [journalForm, setJournalForm] = useState({
    number: "",
    date: new Date().toISOString().slice(0, 10),
    description: "",
    debitCode: "101",
    debitName: "Cash",
    debitMinor: "10000",
    creditCode: "201",
    creditName: "Equity",
    creditMinor: "10000",
  })

  const [personForm, setPersonForm] = useState({ name: "", type: "customer", phone: "" })
  const [accountForm, setAccountForm] = useState({ code: "", name: "", type: "asset" })

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

  const titleKey = section === "chart" ? "accounting_chart" : section === "overview" ? "accounting_overview" : `accounting_${section.replace(/-/g, "_")}`
  const title = tNav.has(titleKey as never) ? tNav(titleKey as never) : section

  let body: ReactNode = null

  if (section === "overview") {
    body = (
      <>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">{tMod("accounting_hint")}</p>
        {statusQ.data ? (
          <ul className="text-muted-foreground mb-6 list-inside list-disc text-sm">
            <li>
              {tMod("accounting_row_license")}: {statusQ.data.licensed ? tCommon("yes") : tCommon("no")}
            </li>
            <li>
              {tMod("accounting_row_bundle")}: {statusQ.data.bundle_present ? tCommon("yes") : tCommon("no")}
            </li>
          </ul>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["journals_count", overviewQ.data?.journals_count],
            ["persons_count", overviewQ.data?.persons_count],
            ["accounts_count", overviewQ.data?.accounts_count],
            ["draft_journals", overviewQ.data?.draft_journals],
          ].map(([key, val]) => (
            <Card key={key as string}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{tAcc(key as never)}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{val ?? "—"}</CardContent>
            </Card>
          ))}
        </div>
      </>
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
              <Input type="date" value={journalForm.date} onChange={(e) => setJournalForm((s) => ({ ...s, date: e.target.value }))} />
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
                  {j.number} · {j.date}
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
    <PageShell title={title}>
      {body}
    </PageShell>
  )
}
