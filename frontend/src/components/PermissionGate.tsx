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
  // Café counter roles. They hold a dashboard and a till, so they belong with staff —
  // leaving them out of this union is what made an owner sign-in fall through to the
  // customer portal branch and see «دسترسی به این بخش ندارید» on their own dashboard.
  | "cashier"
  | "waiter"
  | "cook"
  | "branch_manager"
  | "owner"
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
  "cashier",
  "waiter",
  "cook",
  "branch_manager",
  "owner",
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
  if (typeof granted !== "string" || typeof required !== "string") return false
  if (granted === "*" || granted === required) return true
  if (granted.endsWith(".*")) {
    const prefix = granted.slice(0, -2)
    return required === prefix || required.startsWith(`${prefix}.`)
  }
  return false
}

export function userHasCapability(capabilities: string[] | undefined, required: string): boolean {
  // Defensive: the API is typed as `string[]`, but a misconfigured tenant can return a bare
  // string (or an object). Calling `.some` on that throws a TypeError during render, which
  // the route error boundary turns into "this page ran into an error" — a full blackout of
  // every gated dashboard screen. Normalise instead of trusting the payload.
  // Widen once: at runtime this may be a bare string even though the type says string[].
  const raw = capabilities as unknown
  const list: string[] = Array.isArray(raw)
    ? (raw as string[])
    : typeof raw === "string" && raw.trim() !== ""
      ? [raw.trim()]
      : []

  if (list.length === 0) return false
  if (list.includes("*")) return true
  if (typeof required !== "string" || required.trim() === "") return false

  const requiredAny = required.split(",").map((part) => part.trim()).filter(Boolean)
  return requiredAny.some((req) => list.some((g) => capabilityMatches(g, req)))
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
