"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { unwrapApiResponse } from "@webina/ui"
import { Pencil, Plus, Search } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { MobileListCard, MobileListField } from "@/components/MobileListCard"
import { PostsPagination } from "@/components/PostsPagination"
import { QueryErrorState } from "@/components/QueryErrorState"
import { TableListSkeleton } from "@/components/TableListSkeleton"
import { PageShell } from "@/components/PageShell"
import { ApiError, api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useEnumLabel } from "@/lib/enum-labels"
import { ScrollTable } from "@/components/ScrollTable"

type Staff = {
  id: number
  name: string
  email: string
  role?: string | null
  is_active?: boolean
}

type PageMeta = { current_page: number; last_page: number; total: number }

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

async function listStaff(path: string): Promise<{ items: Staff[]; meta?: PageMeta }> {
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
  const { data, meta } = unwrapApiResponse<Staff[]>(raw)
  return { items: Array.isArray(data) ? data : [], meta: meta as PageMeta | undefined }
}

const emptyForm = { name: "", email: "", password: "", role: "staff", is_active: true }

export default function StaffPage() {
  const t = useTranslations("staff_admin")
  const tCommon = useTranslations("common")
  const enumLabel = useEnumLabel()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-staff", search, page, perPage],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
      if (search.trim()) params.set("search", search.trim())
      return listStaff(`/api/v1/staff?${params}`)
    },
  })

  const rows = data?.items ?? []
  const meta = data?.meta

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        return api(`/api/v1/staff/${editing.id}`, {
          method: "PATCH",
          json: {
            name: form.name,
            email: form.email,
            role: form.role,
            is_active: form.is_active,
            ...(form.password ? { password: form.password } : {}),
          },
        })
      }
      return api("/api/v1/staff", {
        method: "POST",
        json: {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          is_active: form.is_active,
        },
      })
    },
    onSuccess: async () => {
      setShowForm(false)
      setEditing(null)
      setForm(emptyForm)
      await queryClient.invalidateQueries({ queryKey: ["admin-staff"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const statItems = useMemo(
    () => [
      { id: "total", label: t("total"), value: meta?.total ?? rows.length },
      { id: "admins", label: t("admins"), value: rows.filter((r) => r.role === "admin").length },
    ],
    [meta?.total, rows, t],
  )

  const statusBadge = (s: Staff) => (
    <Badge variant={s.is_active === false ? "secondary" : "default"}>
      {s.is_active === false ? t("inactive") : t("active")}
    </Badge>
  )

  const editButton = (s: Staff) => (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        setEditing(s)
        setForm({
          name: s.name,
          email: s.email,
          password: "",
          role: s.role === "admin" ? "admin" : "staff",
          is_active: s.is_active !== false,
        })
        setShowForm(true)
      }}
    >
      <Pencil className="size-4" />
      {t("edit")}
    </Button>
  )

  return (
    <PageShell
      title={t("title")}
      actions={
        <Button
          onClick={() => {
            setEditing(null)
            setForm(emptyForm)
            setShowForm(true)
          }}
        >
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
            if (e.key === "Enter") setPage(1)
          }}
          placeholder={t("search_ph")}
        />
      </div>

      {showForm ? (
        <div className="grid gap-3 rounded-lg border border-border bg-card/40 p-4 md:grid-cols-2">
          <div>
            <Label>{t("name")}</Label>
            <Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label>{t("email")}</Label>
            <Input className="mt-1" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
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
            <Label>{t("role")}</Label>
            <select className={`${selectClass} mt-1`} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="staff">{enumLabel("role", "staff")}</option>
              <option value="admin">{enumLabel("role", "admin")}</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v === true }))} />
            {t("active")}
          </label>
          <div className="flex gap-2 md:col-span-2">
            <Button
              disabled={!form.name || !form.email || (!editing && !form.password) || save.isPending}
              onClick={() => save.mutate()}
            >
              {tCommon("save")}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>
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
                {rows.map((s) => (
                  <MobileListCard
                    key={s.id}
                    media={
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{s.name}</span>
                        {statusBadge(s)}
                      </div>
                    }
                    actions={editButton(s)}
                  >
                    <MobileListField label={t("email")}>
                      <span className="font-mono text-xs" dir="ltr">{s.email}</span>
                    </MobileListField>
                    <MobileListField label={t("role")}>{enumLabel("role", s.role)}</MobileListField>
                  </MobileListCard>
                ))}
              </div>
              <ScrollTable className="hidden md:block">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b text-start text-muted-foreground">
                      <th className="p-2 text-start font-medium">{t("name")}</th>
                      <th className="p-2 text-start font-medium">{t("email")}</th>
                      <th className="p-2 text-start font-medium">{t("role")}</th>
                      <th className="p-2 text-start font-medium">{t("status")}</th>
                      <th className="p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="p-2 font-medium">{s.name}</td>
                        <td className="p-2 font-mono text-xs" dir="ltr">{s.email}</td>
                        <td className="p-2">
                          <Badge variant="outline">{enumLabel("role", s.role)}</Badge>
                        </td>
                        <td className="p-2">{statusBadge(s)}</td>
                        <td className="p-2 text-end">{editButton(s)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
            </>
          )}
          {!isLoading && !isError ? (
            <PostsPagination
              className="mt-3"
              page={page}
              perPage={perPage}
              found={meta?.total ?? rows.length}
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
