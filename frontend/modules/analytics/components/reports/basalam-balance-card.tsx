"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api } from "@/lib/api"
import { MARKETPLACE_SETTINGS_BASE } from "@/lib/marketplace"

type Wrapped = { success?: boolean; data?: unknown }
type BalanceEnvelope = { ok?: boolean; balance?: Wrapped }

/** Basalam wallet balance is reported in rial; returns toman or null when unavailable. */
function balanceToman(env: BalanceEnvelope | undefined): number | null {
  const wrapped = env?.balance
  if (!wrapped || wrapped.success === false) return null
  const outer = (wrapped.data ?? {}) as Record<string, unknown>
  const inner = (outer.data ?? outer) as Record<string, unknown>
  const raw = inner.balance ?? inner.amount ?? inner.total
  const n = typeof raw === "string" ? Number(raw) : raw
  if (typeof n !== "number" || !Number.isFinite(n)) return null
  return Math.trunc(n / 10)
}

export function BasalamBalanceCard() {
  const t = useTranslations("reports")
  const q = useQuery({
    queryKey: ["basalam", "finance", "balance-lite"],
    queryFn: () => api<BalanceEnvelope>("/api/v1/marketplace/basalam/finance/balance"),
    retry: false,
    staleTime: 60_000,
  })

  const toman = balanceToman(q.data)
  if (q.isLoading || q.isError || toman === null) return null

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("basalam.title")}</CardTitle>
        <CardDescription>{t("basalam.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <MoneyDisplay amount={toman} currency="IRT" amountClassName="text-2xl font-semibold tracking-tight" />
        <Button asChild size="sm" variant="outline">
          <Link href={`${MARKETPLACE_SETTINGS_BASE}/basalam/finance`}>{t("basalam.details")}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
