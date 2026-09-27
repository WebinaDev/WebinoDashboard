"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("modules")
  const tCommon = useTranslations("common")
  const params = useSearchParams()
  const status = params.get("status")

  const sync = useMutation({
    mutationFn: () => api("/api/v1/license/sync", { method: "POST" }),
    onSuccess: () => toast.success(tCommon("saved")),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  return (
    <PageShell title={t("payment_callback_title")}>
      <Card>
        <CardHeader>
          <CardTitle>{t("payment_callback_title")}</CardTitle>
          <CardDescription>
            {status === "ok" || status === "success"
              ? t("payment_callback_ok")
              : status === "cancel" || status === "failed"
                ? t("payment_callback_failed")
                : t("payment_callback_pending")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void sync.mutateAsync()} disabled={sync.isPending}>
            {t("sync_license")}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/modules">{t("back_to_modules")}</Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  )
}
