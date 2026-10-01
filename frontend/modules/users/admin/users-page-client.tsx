"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { unwrapApiResponse } from "@webina/ui"
import { KeyRound, MessageSquare, Pencil, Plus, Search, Trash2, UserCog } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useConfirm } from "@/components/ConfirmDialog"
import { ListFiltersCollapsible } from "@/components/ListFiltersCollapsible"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { MobileListCard, MobileListField } from "@/components/MobileListCard"
import { PageShell } from "@/components/PageShell"
import { PostsPagination } from "@/components/PostsPagination"
import { QueryErrorState } from "@/components/QueryErrorState"
import { ScrollTable } from "@/components/ScrollTable"
import { TableListSkeleton } from "@/components/TableListSkeleton"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { dashboardPath } from "@/kernel/paths"
import { ApiError, api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useEnumLabel } from "@/lib/enum-labels"
import { SendUserMessageDialog, type SendMessageUser } from "@/components/users/SendUserMessageDialog"

type UserRow = {
  id: number
  name: string
  username?: string | null
  email?: string | null
  phone?: string | null
  role?: string | null
  is_active?: boolean
  bot_providers?: string[]
}

type PageMeta = {
  current_page: number
  last_page: number
  per_page?: number
  total: number
  role_counts?: Record<string, number>
  bot_counts?: Record<string, number>
}

const ROLE_TABS = [
  "",
  "customer",
  "partner",
  "subscriber",
  "staff",
  "admin",
  "shop_manager",
  "seller",
  "accountant",
  "author",
  "editor",
] as const

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

async function listUsers(path: string): Promise<{ items: UserRow[]; meta?: PageMeta }> {
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
  const { data, meta } = unwrapApiResponse<UserRow[]>(raw)
  return { items: Array.isArray(data) ? data : [], meta: meta as PageMeta | undefined }
}

function avatarInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const emptyCreate = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  password: "",
  role: "customer",
}

export default function UsersPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("users_admin")
  const tRoles = useTranslations("rbac.roles")
  const tCommon = useTranslations("common")
  const enumLabel = useEnumLabel()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const queryClient = useQueryClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialRole = searchParams.get("role") ?? ""
  const [roleFilter, setRoleFilter] = useState(initialRole)
  const [search, setSearch] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [botFilter, setBotFilter] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [selected, setSelected] = useState<number[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(emptyCreate)
  const [bulkRole, setBulkRole] = useState("customer")
  const [roleDialogUser, setRoleDialogUser] = useState<UserRow | null>(null)
  const [messageUser, setMessageUser] = useState<SendMessageUser | null>(null)
  const [roleValue, setRoleValue] = useState("customer")
  const [resetUser, setResetUser] = useState<UserRow | null>(null)
  const [resetPassword, setResetPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const tmr = window.setTimeout(() => {
      setAppliedSearch(search.trim())
      setPage(1)
    }, 400)
    return () => window.clearTimeout(tmr)
  }, [search])

  useEffect(() => {
    setRoleFilter(initialRole)
  }, [initialRole])

  const roleLabel = useCallback(
    (role: string) => {
      if (!role) return t("tab_all")
      return tRoles.has(role) ? tRoles(role) : enumLabel("role", role)
    },
    [enumLabel, t, tRoles],
  )

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-users", appliedSearch, roleFilter, botFilter, page, perPage],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
      if (appliedSearch) params.set("search", appliedSearch)
      if (roleFilter) params.set("role", roleFilter)
      if (botFilter) params.set("bot", botFilter)
      return listUsers(`/api/v1/users?${params}`)
    },
  })

  const rows = data?.items ?? []
  const meta = data?.meta
  const roleCounts = meta?.role_counts ?? {}
  const botCounts = meta?.bot_counts ?? {}
  const botTabs = (["bale", "telegram"] as const).filter((p) => (botCounts[p] ?? 0) > 0)

  const statItems = useMemo(
    () => [
      { id: "total", label: t("stat_total"), value: meta?.total ?? rows.length },
      {
        id: "page",
        label: t("stat_on_page"),
        value: rows.length,
      },
    ],
    [meta?.total, rows.length, t],
  )

  const toggleSelect = (id: number, on: boolean) => {
    setSelected((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)))
  }

  const toggleAll = (on: boolean) => {
    setSelected(on ? rows.map((r) => r.id) : [])
  }

  const createMut = useMutation({
    mutationFn: () =>
      api("/api/v1/users", {
        method: "POST",
        json: {
          first_name: createForm.first_name || undefined,
          last_name: createForm.last_name || undefined,
          phone: createForm.phone || undefined,
          email: createForm.email || undefined,
          password: createForm.password || undefined,
          role: createForm.role,
        },
      }),
    onSuccess: async () => {
      setShowCreate(false)
      setCreateForm(emptyCreate)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const bulkRoleMut = useMutation({
    mutationFn: () =>
      api("/api/v1/users/bulk-role", {
        method: "POST",
        json: { ids: selected, role: bulkRole },
      }),
    onSuccess: async () => {
      setSelected([])
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const roleMut = useMutation({
    mutationFn: () =>
      api(`/api/v1/users/${roleDialogUser!.id}`, {
        method: "PATCH",
        json: { role: roleValue },
      }),
    onSuccess: async () => {
      setRoleDialogUser(null)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const resetMut = useMutation({
    mutationFn: () =>
      api(`/api/v1/users/${resetUser!.id}/reset-password`, {
        method: "POST",
        json: resetPassword ? { password: resetPassword } : {},
      }),
    onSuccess: async () => {
      setResetUser(null)
      setResetPassword("")
      setError(null)
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api(`/api/v1/users/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  function onDelete(row: UserRow) {
    confirm({
      title: t("delete_confirm_title"),
      description: t("delete_confirm_body", { name: row.name }),
      onConfirm: () => deleteMut.mutateAsync(row.id),
    })
  }

  function onRoleTab(role: string) {
    setRoleFilter(role)
    setPage(1)
    const q = new URLSearchParams()
    if (role) q.set("role", role)
    router.replace(`${dashboardPath("users")}${q.size ? `?${q}` : ""}`)
  }

  return (
    <PageShell
      title={t("title")}
      actions={
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="size-4" />
          {t("new")}
        </Button>
      }
    >
      <ListStatsStrip items={statItems} />

      <div className="flex flex-wrap gap-2">
        {ROLE_TABS.map((role) => {
          const count =
            role === ""
              ? Object.values(roleCounts).reduce((a, b) => a + b, 0)
              : (roleCounts[role] ?? 0)
          const active = roleFilter === role
          return (
            <Button
              key={role || "all"}
              size="sm"
              variant={active ? "default" : "outline"}
              onClick={() => onRoleTab(role)}
            >
              {roleLabel(role)}
              <span className="text-muted-foreground ms-1 text-xs">({count})</span>
            </Button>
          )
        })}
      </div>

      {botTabs.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-b pb-2">
          {(["", ...botTabs] as string[]).map((p) => (
            <Button
              key={p || "all"}
              size="sm"
              variant={botFilter === p ? "secondary" : "ghost"}
              onClick={() => {
                setBotFilter(p)
                setPage(1)
              }}
            >
              {p === "" ? tCommon("all") : t(p === "bale" ? "bot_bale" : "bot_telegram")}
              {p ? <span className="text-muted-foreground ms-1 text-xs">({botCounts[p] ?? 0})</span> : null}
            </Button>
          ))}
        </div>
      ) : null}

      <ListFiltersCollapsible activeCount={appliedSearch ? 1 : 0}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label>{t("search_label")}</Label>
            <div className="relative">
              <Search className="text-muted-foreground absolute start-2 top-2.5 size-4" />
              <Input className="ps-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search_ph")} />
            </div>
          </div>
        </div>
      </ListFiltersCollapsible>

      {selected.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <span className="text-sm">{t("selected_count", { count: selected.length })}</span>
          <select className={selectClass + " max-w-48"} value={bulkRole} onChange={(e) => setBulkRole(e.target.value)}>
            {ROLE_TABS.filter(Boolean).map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={bulkRoleMut.isPending} onClick={() => bulkRoleMut.mutate()}>
            {t("bulk_role_apply")}
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {isError ? (
        <QueryErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <TableListSkeleton columns={6} />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <>
          <ScrollTable className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start">
                  <th className="p-2">
                    <Checkbox checked={selected.length === rows.length && rows.length > 0} onCheckedChange={(v) => toggleAll(!!v)} />
                  </th>
                  <th className="p-2">{t("col_user")}</th>
                  <th className="p-2">{t("col_contact")}</th>
                  <th className="p-2">{t("col_role")}</th>
                  <th className="p-2">{t("col_bots")}</th>
                  <th className="p-2 text-end">{t("col_actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="p-2">
                      <Checkbox checked={selected.includes(row.id)} onCheckedChange={(v) => toggleSelect(row.id, !!v)} />
                    </td>
                    <td className="p-2">
                      <Link href={dashboardPath(`users/${row.id}`)} className="flex items-center gap-2 hover:underline">
                        <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                          {avatarInitials(row.name)}
                        </span>
                        <span>
                          <span className="block font-medium">{row.name}</span>
                          {row.username ? <span className="text-muted-foreground block text-xs">@{row.username}</span> : null}
                        </span>
                      </Link>
                    </td>
                    <td className="p-2">
                      <div className="text-xs">{row.phone || tCommon("em_dash")}</div>
                      <div className="text-muted-foreground text-xs">{row.email || tCommon("em_dash")}</div>
                    </td>
                    <td className="p-2">
                      <Badge variant="outline">{roleLabel(row.role ?? "")}</Badge>
                    </td>
                    <td className="p-2">
                      {(row.bot_providers ?? []).length === 0
                        ? tCommon("em_dash")
                        : (row.bot_providers ?? []).join(", ")}
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" asChild>
                          <Link href={dashboardPath(`users/${row.id}`)}>
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                        <Button
                            size="icon"
                            variant="outline"
                            title={t("message_title")}
                            onClick={() => setMessageUser(row)}
                          >
                            <MessageSquare className="size-4" />
                          </Button>
                          <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setRoleDialogUser(row)
                            setRoleValue(row.role ?? "customer")
                          }}
                        >
                          <UserCog className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setResetUser(row)
                            setResetPassword("")
                          }}
                        >
                          <KeyRound className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => onDelete(row)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>

          <div className="space-y-2 md:hidden">
            {rows.map((row) => (
              <MobileListCard
                key={row.id}
                leading={
                  <Checkbox checked={selected.includes(row.id)} onCheckedChange={(v) => toggleSelect(row.id, !!v)} />
                }
              >
                <Link href={dashboardPath(`users/${row.id}`)} className="flex items-center gap-2 font-medium hover:underline">
                  <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                    {avatarInitials(row.name)}
                  </span>
                  <span>
                    <span className="block">{row.name}</span>
                    {row.username ? <span className="text-muted-foreground block text-xs">@{row.username}</span> : null}
                  </span>
                </Link>
                <MobileListField label={t("col_role")}>{roleLabel(row.role ?? "")}</MobileListField>
                <MobileListField label={t("col_phone")}>{row.phone || tCommon("em_dash")}</MobileListField>
                <MobileListField label={t("col_email")}>{row.email || tCommon("em_dash")}</MobileListField>
                <div className="mt-2 flex justify-end gap-1">
                  <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMessageUser(row)}
                    >
                      {t("message_action")}
                    </Button>
                    <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setRoleDialogUser(row)
                      setRoleValue(row.role ?? "customer")
                    }}
                  >
                    <UserCog className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setResetUser(row)
                      setResetPassword("")
                    }}
                  >
                    <KeyRound className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => onDelete(row)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </MobileListCard>
            ))}
          </div>

          <PostsPagination
            className="mt-4"
            page={meta?.current_page ?? page}
            perPage={meta?.per_page ?? perPage}
            found={meta?.total ?? rows.length}
            onPageChange={setPage}
            onPerPageChange={(n) => {
              setPerPage(n)
              setPage(1)
            }}
          />
        </>
      )}

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background max-h-[90vh] w-full max-w-md overflow-auto rounded-lg border p-4 shadow-lg">
            <h2 className="mb-3 text-lg font-semibold">{t("new")}</h2>
            <div className="grid gap-3">
              <div>
                <Label>{t("first_name")}</Label>
                <Input value={createForm.first_name} onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })} />
              </div>
              <div>
                <Label>{t("last_name")}</Label>
                <Input value={createForm.last_name} onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })} />
              </div>
              <div>
                <Label>{t("phone")}</Label>
                <Input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
              </div>
              <div>
                <Label>{t("email")}</Label>
                <Input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
              </div>
              <div>
                <Label>{t("password_optional")}</Label>
                <Input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
              </div>
              <div>
                <Label>{t("col_role")}</Label>
                <select className={selectClass} value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
                  {ROLE_TABS.filter(Boolean).map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                {tCommon("cancel")}
              </Button>
              <Button disabled={createMut.isPending} onClick={() => createMut.mutate()}>
                {tCommon("save")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {roleDialogUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background w-full max-w-sm rounded-lg border p-4 shadow-lg">
            <h2 className="mb-3 font-semibold">{t("change_role_title")}</h2>
            <select className={selectClass} value={roleValue} onChange={(e) => setRoleValue(e.target.value)}>
              {ROLE_TABS.filter(Boolean).map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRoleDialogUser(null)}>
                {tCommon("cancel")}
              </Button>
              <Button disabled={roleMut.isPending} onClick={() => roleMut.mutate()}>
                {tCommon("save")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {resetUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background w-full max-w-sm rounded-lg border p-4 shadow-lg">
            <h2 className="mb-3 font-semibold">{t("reset_password_title")}</h2>
            <Label>{t("password_optional")}</Label>
            <Input type="password" className="mt-1" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
            <p className="text-muted-foreground mt-2 text-xs">{t("reset_password_hint")}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResetUser(null)}>
                {tCommon("cancel")}
              </Button>
              <Button disabled={resetMut.isPending} onClick={() => resetMut.mutate()}>
                {t("reset_password_action")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <SendUserMessageDialog
        user={messageUser}
        open={Boolean(messageUser)}
        onOpenChange={(o) => {
          if (!o) setMessageUser(null)
        }}
      />
      {confirmDialog}
    </PageShell>
  )
}
