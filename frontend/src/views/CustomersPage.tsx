"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { unwrapApiResponse } from "@webina/ui"
import { Pencil, Plus, Search } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { ListFiltersCollapsible } from "@/components/ListFiltersCollapsible"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { MobileListCard, MobileListField } from "@/components/MobileListCard"
import { PageShell } from "@/components/PageShell"
import { PostsPagination } from "@/components/PostsPagination"
import { QueryErrorState } from "@/components/QueryErrorState"
import { ScrollTable } from "@/components/ScrollTable"
import { TableListSkeleton } from "@/components/TableListSkeleton"
import { ApiError, api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Customer = {
  id: number
  name: string
  email: string
  wallet_balance_minor?: number
  bank_sheba?: string | null
  is_active?: boolean
}

type PageMeta = { current_page: number; last_page: number; per_page?: number; total: number }

async function listCustomers(path: string): Promise<{ items: Customer[]; meta?: PageMeta }> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  const res = await fetch(`${base}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
  })
  const text = await res.text()
  let raw: unknown = null
  try {
    raw = text ? JSON.parse(text) : null
  } catch {
    raw = null
  }
  if (!res.ok) {
    throw new ApiError(getApiErrorMessage(new ApiError(`HTTP ${res.status}`, res.status, raw), raw as never), res.status, raw)
  }
  const { data, meta } = unwrapApiResponse<Customer[]>(raw)
  return { items: Array.isArray(data) ? data : [], meta: meta as PageMeta | undefined }
}

const emptyForm = { name: "", email: "", password: "", bank_sheba: "", is_active: true }

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export default function CustomersPage() {
  const t = useTranslations("customers_admin")
  const tNav = useTranslations("nav")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [status, setStatus] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [noteBody, setNoteBody] = useState("")
  const [notes, setNotes] = useState<Array<{ id: number; body: string; subject?: string | null }>>([])
  const [notesMsg, setNotesMsg] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-customers", appliedSearch, status, page, perPage],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
      if (appliedSearch) params.set("search", appliedSearch)
      if (status) params.set("status", status)
      return listCustomers(`/api/v1/customers?${params}`)
    },
  })

  useEffect(() => {
    if (!editing?.id) {
      setNotes([])
      return
    }
    api<{ notes: Array<{ id: number; body: string; subject?: string | null }>; erp_unavailable?: boolean }>(
      `/api/v1/customers/${editing.id}/notes`
    )
      .then((r) => {
        setNotes(Array.isArray(r?.notes) ? r.notes : [])
        if (r?.erp_unavailable) setNotesMsg(t("notes_erp_unavailable"))
      })
      .catch(() => setNotes([]))
  }, [editing?.id, t])


  const rows = data?.items ?? []
  const meta = data?.meta

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        return api(`/api/v1/customers/${editing.id}`, {
          method: "PATCH",
          json: {
            name: form.name,
            email: form.email,
            bank_sheba: form.bank_sheba || null,
            is_active: form.is_active,
            ...(form.password ? { password: form.password } : {}),
          },
        })
      }
      return api("/api/v1/customers", {
        method: "POST",
        json: {
          name: form.name,
          email: form.email,
          password: form.password || undefined,
          bank_sheba: form.bank_sheba || null,
          is_active: form.is_active,
        },
      })
    },
    onSuccess: async () => {
      setShowForm(false)
      setEditing(null)
      setForm(emptyForm)
      await queryClient.invalidateQueries({ queryKey: ["admin-customers"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const statItems = useMemo(
    () => [
      { id: "total", label: tNav("customers"), value: meta?.total ?? rows.length },
      { id: "active", label: t("stat_active_page"), value: rows.filter((r) => r.is_active !== false).length },
    ],
    [meta?.total, rows, t, tNav],
  )

  function applySearch() {
    setAppliedSearch(search.trim())
    setPage(1)
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(c: Customer) {
    setEditing(c)
    setForm({
      name: c.name,
      email: c.email,
      password: "",
      bank_sheba: c.bank_sheba ?? "",
      is_active: c.is_active !== false,
    })
    setShowForm(true)
  }

  function statusBadge(c: Customer) {
    const active = c.is_active !== false
    return <Badge variant={active ? "default" : "secondary"}>{active ? t("status_active") : t("status_inactive")}</Badge>
  }

  function editButton(c: Customer, withLabel = false) {
    return (
      <Button size={withLabel ? "sm" : "icon"} variant="outline" title={t("edit")} onClick={() => openEdit(c)}>
        <Pencil className="size-4" />
        {withLabel ? t("edit") : null}
      </Button>
    )
  }

  return (
    <PageShell
      title={tNav("customers")}
      actions={
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          {t("new")}
        </Button>
      }
    >
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <ListStatsStrip items={statItems} />

      <div className="relative">
        <Search className="text-muted-foreground absolute start-2 top-2.5 size-4" />
        <Input
          className="ps-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applySearch()
          }}
          placeholder={t("search_ph")}
        />
      </div>

      <ListFiltersCollapsible activeCount={status ? 1 : 0}>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>{t("col_status")}</Label>
            <select
              className={`${selectClass} mt-1`}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
            >
              <option value="">{tCommon("all")}</option>
              <option value="active">{t("status_active")}</option>
              <option value="inactive">{t("status_inactive")}</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button variant="secondary" onClick={applySearch}>
              {t("apply")}
            </Button>
          </div>
        </div>
      </ListFiltersCollapsible>

      {showForm ? (
        <div className="grid gap-3 rounded-lg border border-border bg-card/40 p-4 md:grid-cols-2">
          <div>
            <Label>{t("col_name")}</Label>
            <Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label>{t("col_email")}</Label>
            <Input
              className="mt-1"
              dir="ltr"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <Label>{editing ? t("password_optional") : t("password")}</Label>
            <Input
              className="mt-1"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          <div>
            <Label>{t("sheba")}</Label>
            <Input
              className="mt-1"
              dir="ltr"
              value={form.bank_sheba}
              onChange={(e) => setForm((f) => ({ ...f, bank_sheba: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v === true }))} />
            {t("status_active")}
          </label>
          
          {editing ? (
            <div className="space-y-2 border-t pt-4">
              <Label>{t("notes_title")}</Label>
              {notesMsg ? <p className="text-muted-foreground text-xs">{notesMsg}</p> : null}
              <ul className="max-h-40 space-y-1 overflow-auto text-sm">
                {notes.map((n) => (
                  <li key={n.id} className="rounded border p-2">
                    {n.subject ? <div className="font-medium">{n.subject}</div> : null}
                    <div className="whitespace-pre-wrap">{n.body}</div>
                  </li>
                ))}
              </ul>
              <Textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={3} />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!noteBody.trim()}
                onClick={() => {
                  void api(`/api/v1/customers/${editing.id}/notes`, {
                    method: "POST",
                    json: { body: noteBody, sync_erp: true },
                  })
                    .then(() => {
                      setNoteBody("")
                      return api<{ notes: Array<{ id: number; body: string; subject?: string | null }> }>(
                        `/api/v1/customers/${editing.id}/notes`
                      )
                    })
                    .then((r) => setNotes(Array.isArray(r?.notes) ? r.notes : []))
                    .catch((e) => setError(getApiErrorMessage(e)))
                }}
              >
                {t("notes_add")}
              </Button>
            </div>
          ) : null}
<div className="flex gap-2 md:col-span-2">
            <Button disabled={!form.name || !form.email || save.isPending} onClick={() => save.mutate()}>
              {tCommon("save")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false)
                setEditing(null)
              }}
            >
              {tCommon("cancel")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-card/40">
        <div className="p-2 sm:p-4">
          {isError ? (
            <QueryErrorState onRetry={() => refetch()} />
          ) : isLoading ? (
            <TableListSkeleton rows={6} columns={5} />
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty")}</p>
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {rows.map((c) => (
                  <MobileListCard
                    key={c.id}
                    media={
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{c.name}</span>
                        {statusBadge(c)}
                      </div>
                    }
                    actions={editButton(c, true)}
                  >
                    <MobileListField label={t("col_email")}>
                      <span className="font-mono text-xs" dir="ltr">
                        {c.email}
                      </span>
                    </MobileListField>
                    <MobileListField label={t("col_wallet")}>
                      <MoneyDisplay amount={c.wallet_balance_minor ?? 0} />
                    </MobileListField>
                  </MobileListCard>
                ))}
              </div>
              <ScrollTable className="hidden md:block">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b text-start text-muted-foreground">
                      <th className="p-2 text-start font-medium">{t("col_name")}</th>
                      <th className="p-2 text-start font-medium">{t("col_email")}</th>
                      <th className="p-2 text-start font-medium">{t("col_wallet")}</th>
                      <th className="p-2 text-start font-medium">{t("col_status")}</th>
                      <th className="p-2 text-start font-medium">{t("col_actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="p-2 font-medium">{c.name}</td>
                        <td className="p-2 font-mono text-xs" dir="ltr">
                          {c.email}
                        </td>
                        <td className="p-2">
                          <MoneyDisplay amount={c.wallet_balance_minor ?? 0} />
                        </td>
                        <td className="p-2">{statusBadge(c)}</td>
                        <td className="p-2">{editButton(c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
            </>
          )}
          {meta ? (
            <PostsPagination
              className="mt-4"
              page={meta.current_page}
              perPage={meta.per_page || perPage}
              found={meta.total}
              onPageChange={setPage}
              onPerPageChange={(n) => {
                setPerPage(n)
                setPage(1)
              }}
            />
          ) : null}
        </div>
      </div>
    </PageShell>
  )
}
