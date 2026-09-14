"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { unwrapApiResponse } from "@webina/ui"
import { Plus, Search } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { PageShell } from "@/components/PageShell"
import { ApiError, api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

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
  const t = useTranslations("nav")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["admin-staff", search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), per_page: "20" })
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
      { id: "total", label: t("staff") ?? "Staff", value: meta?.total ?? rows.length },
      { id: "admins", label: "Admins", value: rows.filter((r) => r.role === "admin").length },
    ],
    [meta?.total, rows, t],
  )

  return (
    <PageShell
      title={t("staff") ?? "Staff"}
      actions={
        <Button
          onClick={() => {
            setEditing(null)
            setForm(emptyForm)
            setShowForm(true)
          }}
        >
          <Plus className="size-4" />
          New
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
          placeholder="Search name or email"
        />
      </div>

      {showForm ? (
        <div className="grid gap-3 rounded-lg border border-border bg-card/40 p-4 md:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label>Email</Label>
            <Input className="mt-1" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label>Password {editing ? "(optional)" : ""}</Label>
            <Input
              className="mt-1"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          <div>
            <Label>Role</Label>
            <select className={`${selectClass} mt-1`} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="staff">staff</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v === true }))} />
            Active
          </label>
          <div className="flex gap-2 md:col-span-2">
            <Button
              disabled={!form.name || !form.email || (!editing && !form.password) || save.isPending}
              onClick={() => save.mutate()}
            >
              {tCommon("save")}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-card/40">
        <div className="p-2 sm:p-4">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{tCommon("em_dash")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="p-2 font-medium">Name</th>
                    <th className="p-2 font-medium">Email</th>
                    <th className="p-2 font-medium">Role</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="p-2 font-medium">{s.name}</td>
                      <td className="p-2 font-mono text-xs">{s.email}</td>
                      <td className="p-2">
                        <Badge variant="outline">{s.role || "—"}</Badge>
                      </td>
                      <td className="p-2">
                        <Badge variant={s.is_active === false ? "secondary" : "default"}>
                          {s.is_active === false ? "inactive" : "active"}
                        </Badge>
                      </td>
                      <td className="p-2">
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
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {meta && meta.last_page > 1 ? (
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </Button>
              <Button size="sm" variant="outline" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </PageShell>
  )
}
