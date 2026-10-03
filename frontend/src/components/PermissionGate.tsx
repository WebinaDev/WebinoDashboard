"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { PageSkeleton } from "@/components/PageSkeleton"
import { QueryErrorState } from "@/components/QueryErrorState"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"

export type DashboardRole =
  | "admin"
  | "staff"
  | "shop_manager"
  | "seller"
  | "accountant"
  | "author"
  | "editor"
  | "customer"
  | "partner"
  | "subscriber"

export const STAFF_ROLES: DashboardRole[] = [
  "admin",
  "staff",
  "shop_manager",
  "seller",
  "accountant",
  "author",
  "editor",
]

type AuthUser = {
  id: number
  role?: string | null
  capabilities?: string[]
}

export function useAuthUser() {
  return useQuery({
    queryKey: ["auth-user"],
    queryFn: () => api<AuthUser>("/api/v1/auth/user"),
  })
}

function capabilityMatches(granted: string, required: string): boolean {
  if (granted === "*" || granted === required) return true
  if (granted.endsWith(".*")) {
    const prefix = granted.slice(0, -2)
    return required === prefix || required.startsWith(`${prefix}.`)
  }
  return false
}

export function userHasCapability(capabilities: string[] | undefined, required: string): boolean {
  if (!capabilities?.length) return false
  if (capabilities.includes("*")) return true
  return capabilities.some((g) => capabilityMatches(g, required))
}

/**
 * Client-side role gate for dashboard UX. API routes enforce access server-side;
 * this hides staff screens from customer accounts and shows a clear message.
 */
export function PermissionGate({
  roles = STAFF_ROLES,
  capability,
  anyCapabilities,
  children,
}: {
  roles?: DashboardRole[]
  capability?: string
  /** User needs at least one of these capabilities (unless role list matches). */
  anyCapabilities?: string[]
  children: ReactNode
}) {
  const t = useTranslations("ui")
  const q = useAuthUser()

  if (q.isPending) return <PageSkeleton />
  if (q.isError) return <QueryErrorState onRetry={() => q.refetch()} />

  const role = (q.data?.role ?? "").trim() as DashboardRole
  const capabilities = q.data?.capabilities

  const capOk =
    !capability && !anyCapabilities?.length
      ? true
      : capability
        ? userHasCapability(capabilities, capability)
        : (anyCapabilities ?? []).some((c) => userHasCapability(capabilities, c))

  if ((capability || anyCapabilities?.length) && !capOk) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-6">
        <h1 className="text-lg font-semibold">{t("forbidden_title")}</h1>
        <p className="text-muted-foreground text-sm">{t("forbidden_body")}</p>
        <div>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={STAFF_ROLES.includes(role) ? "/dashboard" : "/dashboard/account"}>{t("go_account")}</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (roles.length > 0 && role && !roles.includes(role)) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-6">
        <h1 className="text-lg font-semibold">{t("forbidden_title")}</h1>
        <p className="text-muted-foreground text-sm">{t("forbidden_body")}</p>
        <div>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={STAFF_ROLES.includes(role) ? "/dashboard" : "/dashboard/account"}>{t("go_account")}</Link>
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
