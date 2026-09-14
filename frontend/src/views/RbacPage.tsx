"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { PageShell } from "@/components/PageShell"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type RoleRow = { name: string; users_count: number }

type RolesPayload = {
  roles: RoleRow[]
  permissions: Record<string, string[]>
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export default function RbacPage() {
  const t = useTranslations("nav")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const [userId, setUserId] = useState("")
  const [role, setRole] = useState("staff")
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const body = await api<RolesPayload | { data: RolesPayload }>("/api/v1/roles")
      if (body && typeof body === "object" && "roles" in body) return body as RolesPayload
      if (body && typeof body === "object" && "data" in body) return (body as { data: RolesPayload }).data
      return { roles: [], permissions: {} }
    },
  })

  const roles = data?.roles ?? []
  const permissions = data?.permissions ?? {}

  const assign = useMutation({
    mutationFn: () =>
      api("/api/v1/roles", {
        method: "PUT",
        json: { user_id: Number(userId), role },
      }),
    onSuccess: async () => {
      setOk("Role updated")
      setError(null)
      setUserId("")
      await queryClient.invalidateQueries({ queryKey: ["admin-roles"] })
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

  return (
    <PageShell title={t("rbac")}>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {ok ? <p className="text-sm text-green-600">{ok}</p> : null}

      <ListStatsStrip items={statItems} />

      <div className="grid gap-3 rounded-lg border border-border bg-card/40 p-4 md:grid-cols-3">
        <div>
          <Label>User ID</Label>
          <Input className="mt-1" type="number" value={userId} onChange={(e) => setUserId(e.target.value)} />
        </div>
        <div>
          <Label>Role</Label>
          <select className={`${selectClass} mt-1`} value={role} onChange={(e) => setRole(e.target.value)}>
            {(["admin", "staff", "customer"] as const).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button disabled={!userId || assign.isPending} onClick={() => assign.mutate()}>
            Assign role
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/40">
        <div className="border-b px-4 py-3 text-sm font-medium">Roles</div>
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
                    <span className="font-mono font-medium">{r.name}</span>
                    <Badge variant="secondary">{r.users_count}</Badge>
                  </div>
                  <p className="text-muted-foreground mt-2 text-xs">
                    {(permissions[r.name] ?? []).join(", ") || "—"}
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
