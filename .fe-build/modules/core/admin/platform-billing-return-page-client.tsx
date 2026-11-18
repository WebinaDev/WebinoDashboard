"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"

type Payment = { id: number; status: "pending" | "paid" | "failed" | string }

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("platform_billing")
  const params = useSearchParams()
  const id = params.get("payment") ?? params.get("payment_id") ?? ""

  const q = useQuery({
    queryKey: ["platform-billing-payment", id],
    enabled: id !== "" && /^\d+$/.test(id),
    refetchInterval: (query) => (query.state.data?.payment?.status === "pending" ? 2000 : false),
    queryFn: () => api<{ payment: Payment }>(`/api/v1/billing/payments/${id}`),
  })

  const status = q.data?.payment?.status
  const numeric = /^\d+$/.test(id)

  return (
    <PageShell title={t("return_title")}>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {!numeric || q.isPending || status === "pending" ? (
              <Loader2 className="size-5 animate-spin" />
            ) : status === "paid" ? (
              <CheckCircle2 className="size-5 text-emerald-600" />
            ) : (
              <XCircle className="text-destructive size-5" />
            )}
            {t("return_title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            {!numeric ? t("return_missing") : status === "paid" ? t("return_paid") : status === "failed" ? t("return_failed") : t("return_pending")}
          </p>
          <Button asChild>
            <Link href="/dashboard/platform-billing">{t("back")}</Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  )
}
