"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { cn } from "@/lib/utils"

type AccAccount = { id: number; code: string; name: string; type: string }

type CodingPayload = {
  coding: { roles: Record<string, string>; tenders: Record<string, string> }
  defaults: Record<string, { code: string; name: string; type: string }>
  tenders: string[]
  roles: string[]
  accounts: AccAccount[]
}

type Draft = { roles: Record<string, string>; tenders: Record<string, string> }

/**
 * Account coding: which chart-of-accounts code plays which role in the sales journal.
 *
 * This is the screen that makes the ledger configurable. Before it existed the sales journal
 * named 1101/4101/2101 in code and posted every tender — cash included — to receivables, so an
 * accountant could not reconcile the drawer from the ledger at all.
 *
 * Each row is a role the posting code asks for by name. The select lists the tenant's own
 * chart, so a shop that numbers its accounts 110/410/210 maps those instead of adopting ours.
 * The server refuses a save that names a code outside the chart, which is the guard against a
 * journal posting to an account the ledger does not have.
 */
export function AccountCodingPanel({ className }: { className?: string }) {
  const t = useTranslations("settings_hub")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)

  const codingQ = useQuery({
    queryKey: ["accounting", "coding"],
    queryFn: () => api<CodingPayload>("/api/v1/accounting/coding"),
  })

  // Seed the draft once the payload lands; a refetch must not overwrite unsaved edits.
  useEffect(() => {
    if (codingQ.data && draft === null) {
      setDraft({
        roles: { ...codingQ.data.coding.roles },
        tenders: { ...codingQ.data.coding.tenders },
      })
    }
  }, [codingQ.data, draft])

  const accounts = codingQ.data?.accounts ?? []
  const defaults = codingQ.data?.defaults ?? {}

  const dirty = useMemo(() => {
    const saved = codingQ.data?.coding
    if (!saved || !draft) return false
    return (
      JSON.stringify(saved.roles) !== JSON.stringify(draft.roles) ||
      JSON.stringify(saved.tenders) !== JSON.stringify(draft.tenders)
    )
  }, [codingQ.data, draft])

  const save = useMutation({
    mutationFn: (body: Draft) => api("/api/v1/accounting/coding", { method: "PUT", json: body }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["accounting", "coding"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const reset = useMutation({
    mutationFn: (body: { role?: string; tender?: string }) =>
      api("/api/v1/accounting/coding/reset", { method: "POST", json: body }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setDraft(null)
      void qc.invalidateQueries({ queryKey: ["accounting", "coding"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (codingQ.isPending || !draft) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>
  }

  const selectClass =
    "border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-2 py-1 text-sm shadow-xs outline-none focus-visible:ring-2"

  const roleLabel = (role: string): string => {
    // Falls back to the role key so a newly added role renders instead of disappearing.
    const key = `accounting_coding.roles.${role}`
    return t.has(key as never) ? t(key as never) : role
  }

  const tenderLabel = (tender: string): string => {
    const key = `accounting_coding.tenders.${tender}`
    return t.has(key as never) ? t(key as never) : tender
  }

  const accountOptions = (current: string) => {
    const known = accounts.some((a) => a.code === current)
    return (
      <>
        {/* Keep an unmapped/unknown current value selectable so the row never silently
            rewrites to the first account when the form is merely opened. */}
        {!known && current ? <option value={current}>{current}</option> : null}
        {accounts.map((a) => (
          <option key={a.id} value={a.code}>
            {a.code} — {a.name}
          </option>
        ))}
      </>
    )
  }

  const row = (
    key: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    onReset: () => void,
    isDefault: boolean,
  ) => (
    <div key={key} className="grid items-center gap-2 sm:grid-cols-[1fr_18rem_auto]">
      <Label className="text-sm">{label}</Label>
      <select
        className={selectClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        {accountOptions(value)}
      </select>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={isDefault || reset.isPending}
        onClick={onReset}
        title={t("accounting_coding.reset_hint")}
      >
        {t("accounting_coding.reset")}
      </Button>
    </div>
  )

  return (
    <div className={cn("space-y-4", className)}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("accounting_coding.title")}</CardTitle>
          <CardDescription>{t("accounting_coding.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(codingQ.data?.roles ?? []).map((role) =>
            row(
              `role-${role}`,
              roleLabel(role),
              draft.roles[role] ?? "",
              (v) => setDraft({ ...draft, roles: { ...draft.roles, [role]: v } }),
              () => void reset.mutate({ role }),
              (draft.roles[role] ?? "") === (defaults[role]?.code ?? ""),
            ),
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("accounting_coding.tenders_title")}</CardTitle>
          <CardDescription>{t("accounting_coding.tenders_description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(codingQ.data?.tenders ?? []).map((tender) =>
            row(
              `tender-${tender}`,
              tenderLabel(tender),
              draft.tenders[tender] ?? "",
              (v) => setDraft({ ...draft, tenders: { ...draft.tenders, [tender]: v } }),
              () => void reset.mutate({ tender }),
              false,
            ),
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={() => draft && void save.mutateAsync(draft)}
        >
          {tCommon("save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || save.isPending}
          onClick={() => setDraft(null)}
        >
          {tCommon("cancel")}
        </Button>
      </div>
    </div>
  )
}
