"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { PageSkeleton } from "@/components/PageSkeleton"
import { QueryErrorState } from "@/components/QueryErrorState"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"

export type DashboardRole = "admin" | "staff" | "customer"

export const STAFF_ROLES: DashboardRole[] = ["admin", "staff"]

type AuthUser = { id: number; role?: string | null }

export function useAuthUser() {
  return useQuery({
    queryKey: ["auth-user"],
    queryFn: () => api<AuthUser>("/api/v1/auth/user"),
  })
}

/**
 * Client-side role gate for dashboard UX. API routes enforce access server-side;
 * this hides staff screens from customer accounts and shows a clear message.
 */
export function PermissionGate({
  roles = STAFF_ROLES,
  children,
}: {
  roles?: DashboardRole[]
  children: ReactNode
}) {
  const t = useTranslations("ui")
  const q = useAuthUser()

  if (q.isPending) return <PageSkeleton />
  if (q.isError) return <QueryErrorState onRetry={() => q.refetch()} />

  const role = (q.data?.role ?? "").trim() as DashboardRole
  if (role && !roles.includes(role)) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-6">
        <h1 className="text-lg font-semibold">{t("forbidden_title")}</h1>
        <p className="text-muted-foreground text-sm">{t("forbidden_body")}</p>
        <div>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/dashboard/account">{t("go_account")}</Link>
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
