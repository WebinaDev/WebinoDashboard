"use client"

import { useTranslations } from "next-intl"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type LicenseStatus = {
  status: string
  checked_at?: string | null
  unreachable?: boolean
  last_error?: string | null
  active?: boolean
  demo?: boolean
}

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("license")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ["license-status"],
    queryFn: () => api<LicenseStatus>("/api/v1/license/status"),
  })

  const sync = useMutation({
    mutationFn: () => api<LicenseStatus>("/api/v1/license/sync", { method: "POST" }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["license-status"] })
      void qc.invalidateQueries({ queryKey: ["modules"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const data = q.data
  const status = data?.status || (data?.active ? "valid" : "unknown")

  return (
    <PageShell
      title={t("title")}
      description={t("subtitle")}
      actions={
        <Button type="button" onClick={() => void sync.mutateAsync()} disabled={sync.isPending}>
          {t("sync")}
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t("status_label")}
            <Badge variant={status === "valid" ? "default" : "destructive"}>{status}</Badge>
          </CardTitle>
          <CardDescription>
            {data?.unreachable ? t("unreachable") : t("status_hint")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data?.checked_at ? (
            <p>
              {t("checked_at")}: {data.checked_at}
            </p>
          ) : null}
          {data?.last_error ? (
            <p className="text-destructive">{data.last_error}</p>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  )
}
