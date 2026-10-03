"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { PageShell } from "@/components/PageShell"
import { api } from "@/lib/api"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { getApiErrorMessage } from "@/lib/api-helpers"

type RoleRow = { name: string; users_count: number; capabilities?: string[] }

type RolesPayload = {
  roles: RoleRow[]
  permissions: Record<string, string[]>
  available_capabilities?: string[]
}

type MenuAclEntry = { menu_key: string; allowed: boolean }

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

const ASSIGNABLE_ROLES = [
  "admin",
  "staff",
  "shop_manager",
  "seller",
  "accountant",
  "author",
  "editor",
  "customer",
  "partner",
  "subscriber",
] as const

/** Stable menu keys for ACL editing (paths / groups). */
const MENU_KEYS = [
  "dashboard",
  "products",
  "orders",
  "pos",
  "accounting",
  "customers",
  "staff",
  "users",
  "tickets",
  "marketing",
  "analytics",
  "blog",
  "media",
  "settings",
  "modules",
  "license",
  "settings/shop/reviews",
] as const

export default function RbacPage() {
  const tNav = useTranslations("nav")
  const t = useTranslations("rbac")
  const locale = normalizeUiLocale(useLocale())
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const [userId, setUserId] = useState("")
  const [role, setRole] = useState("staff")
  const [editRole, setEditRole] = useState("staff")
  const [selectedCaps, setSelectedCaps] = useState<string[]>([])
  const [menuEntries, setMenuEntries] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const body = await api<RolesPayload | { data: RolesPayload }>("/api/v1/roles")
      if (body && typeof body === "object" && "roles" in body) return body as RolesPayload
      if (body && typeof body === "object" && "data" in body) return (body as { data: RolesPayload }).data
      return { roles: [], permissions: {}, available_capabilities: [] }
    },
  })

  const menuAclQ = useQuery({
    queryKey: ["admin-menu-acl"],
    queryFn: async () => {
      const body = await api<{ menu_acl: Record<string, MenuAclEntry[]> } | { data: { menu_acl: Record<string, MenuAclEntry[]> } }>(
        "/api/v1/roles/menu-acl",
      )
      if (body && typeof body === "object" && "menu_acl" in body) {
        return (body as { menu_acl: Record<string, MenuAclEntry[]> }).menu_acl
      }
      if (body && typeof body === "object" && "data" in body) {
        return (body as { data: { menu_acl: Record<string, MenuAclEntry[]> } }).data.menu_acl
      }
      return {} as Record<string, MenuAclEntry[]>
    },
  })

  const roles = useMemo(() => data?.roles ?? [], [data?.roles])
  const permissions = useMemo(() => data?.permissions ?? {}, [data?.permissions])
  const availableCaps = data?.available_capabilities ?? []

  useEffect(() => {
    const caps = permissions[editRole] ?? roles.find((r) => r.name === editRole)?.capabilities ?? []
    setSelectedCaps([...caps])
    const entries = menuAclQ.data?.[editRole] ?? []
    const map: Record<string, boolean> = {}
    for (const key of MENU_KEYS) {
      const hit = entries.find((e) => e.menu_key === key)
      map[key] = hit ? hit.allowed : true
    }
    setMenuEntries(map)
  }, [editRole, permissions, roles, menuAclQ.data])

  const assign = useMutation({
    mutationFn: () =>
      api("/api/v1/roles", {
        method: "PUT",
        json: { user_id: Number(userId), role },
      }),
    onSuccess: async () => {
      setOk(t("role_updated"))
      setError(null)
      setUserId("")
      await queryClient.invalidateQueries({ queryKey: ["admin-roles"] })
    },
    onError: (e: Error) => {
      setOk(null)
      setError(getApiErrorMessage(e))
    },
  })

  const saveCaps = useMutation({
    mutationFn: () =>
      api("/api/v1/roles/capabilities", {
        method: "PUT",
        json: { role: editRole, capabilities: selectedCaps },
      }),
    onSuccess: async () => {
      setOk(t("capabilities_saved"))
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ["admin-roles"] })
    },
    onError: (e: Error) => {
      setOk(null)
      setError(getApiErrorMessage(e))
    },
  })

  const saveMenuAcl = useMutation({
    mutationFn: () =>
      api("/api/v1/roles/menu-acl", {
        method: "PUT",
        json: {
          role: editRole,
          entries: Object.entries(menuEntries).map(([menu_key, allowed]) => ({ menu_key, allowed })),
        },
      }),
    onSuccess: async () => {
      setOk(t("menu_acl_saved"))
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ["admin-menu-acl"] })
    },
    onError: (e: Error) => {
      setOk(null)
      setError(getApiErrorMessage(e))
    },
  })

  const statItems = useMemo(
    () => roles.map((r) => ({ id: r.name, label: r.name, value: r.users_count })),
    [roles],
  )

  function toggleCap(cap: string) {
    setSelectedCaps((prev) => (prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]))
  }

  const isAdminRole = editRole === "admin"

  return (
    <PageShell title={tNav("rbac")}>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {ok ? <p className="text-sm text-green-600">{ok}</p> : null}

      <ListStatsStrip items={statItems} />

      <div className="grid gap-3 rounded-lg border border-border bg-card/40 p-4 md:grid-cols-3">
        <div>
          <Label>{t("user_id")}</Label>
          <Input className="mt-1" type="number" value={userId} onChange={(e) => setUserId(e.target.value)} />
        </div>
        <div>
          <Label>{t("role")}</Label>
          <select className={`${selectClass} mt-1`} value={role} onChange={(e) => setRole(e.target.value)}>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button disabled={!userId || assign.isPending} onClick={() => assign.mutate()}>
            {t("assign_role")}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/40">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <span className="text-sm font-medium">{t("edit_heading")}</span>
          <select className={`${selectClass} w-auto min-w-[10rem]`} value={editRole} onChange={(e) => setEditRole(e.target.value)}>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-6 p-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-medium">{t("capabilities_heading")}</h3>
            {isAdminRole ? (
              <p className="text-muted-foreground text-sm">{t("admin_all_caps")}</p>
            ) : isLoading ? (
              <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {availableCaps.map((cap) => (
                  <li key={cap} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedCaps.includes(cap)}
                      onCheckedChange={() => toggleCap(cap)}
                      id={`cap-${cap}`}
                    />
                    <Label htmlFor={`cap-${cap}`} className="font-mono text-xs font-normal">
                      {cap}
                    </Label>
                  </li>
                ))}
              </ul>
            )}
            {!isAdminRole ? (
              <Button className="mt-3" size="sm" disabled={saveCaps.isPending} onClick={() => saveCaps.mutate()}>
                {t("save_capabilities")}
              </Button>
            ) : null}
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium">{t("menu_acl_heading")}</h3>
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {MENU_KEYS.map((key) => (
                <li key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={menuEntries[key] !== false}
                    onCheckedChange={(v) => setMenuEntries((prev) => ({ ...prev, [key]: v === true }))}
                    id={`menu-${key}`}
                  />
                  <Label htmlFor={`menu-${key}`} className="font-mono text-xs font-normal">
                    {key}
                  </Label>
                </li>
              ))}
            </ul>
            <Button className="mt-3" size="sm" disabled={saveMenuAcl.isPending} onClick={() => saveMenuAcl.mutate()}>
              {t("save_menu_acl")}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/40">
        <div className="border-b px-4 py-3 text-sm font-medium">{t("roles_heading")}</div>
        <div className="p-4">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : roles.length === 0 ? (
            <p className="text-muted-foreground text-sm">{tCommon("em_dash")}</p>
          ) : (
            <ul className="space-y-2">
              {roles.map((r) => (
                <li key={r.name} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-medium">{t(`roles.${r.name}`, { defaultValue: r.name })}</span>
                    <Badge variant="secondary">{formatNumber(r.users_count, locale)}</Badge>
                  </div>
                  <p className="text-muted-foreground mt-2 text-xs">
                    {(permissions[r.name] ?? r.capabilities ?? []).join(", ") || tCommon("em_dash")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageShell>
  )
}
