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
  expired?: boolean
  has_key?: boolean
  has_domain?: boolean
  domain?: string | null
  product?: string | null
}

function softErrorMessage(raw: string | null | undefined, fallback: string): string | null {
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (lower.includes("hmac") || lower.includes("signature")) {
    return fallback
  }
  return raw
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
    onError: (e: Error) => toast.error(getApiErrorMessage(e) || t("unreachable")),
  })

  const data = q.data
  const status = data?.status || (data?.active ? "active" : data?.unreachable ? "unreachable" : "unknown")
  const badgeVariant =
    status === "active" || status === "valid" || status === "demo"
      ? "default"
      : status === "unreachable" || status === "unknown"
        ? "secondary"
        : "destructive"
  const statusLabel =
    status === "active" || status === "valid"
      ? t("status_active")
      : status === "demo"
        ? t("status_demo")
        : status === "expired"
          ? t("status_expired")
          : status === "invalid"
            ? t("status_invalid")
            : status === "unreachable"
              ? t("unreachable")
              : status

  const domainConfigured = Boolean(data?.has_domain ?? data?.has_key ?? data?.domain)
  const displayError = softErrorMessage(data?.last_error, t("unreachable"))

  return (
    <PageShell
      title={t("title")}
      description={t("subtitle")}
      actions={
        <Button type="button" onClick={() => void sync.mutateAsync()} disabled={sync.isPending || q.isError}>
          {t("sync")}
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t("status_label")}
            <Badge variant={badgeVariant}>{statusLabel}</Badge>
          </CardTitle>
          <CardDescription>
            {data?.unreachable ? t("unreachable") : t("status_hint")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            {t("key_present")}: {domainConfigured ? tCommon("yes") : tCommon("no")}
          </p>
          <p className="font-mono text-xs" dir="ltr">
            {data?.domain || t("domain_missing")}
            {data?.product ? ` · ${data.product}` : ""}
          </p>
          {data?.demo ? <p>{t("demo_hint")}</p> : null}
          {data?.expired ? <p className="text-destructive">{t("expired_hint")}</p> : null}
          {data?.checked_at ? (
            <p>
              {t("checked_at")}: {data.checked_at}
            </p>
          ) : null}
          {displayError ? (
            <p className="text-destructive">{displayError}</p>
          ) : null}
          {q.isError ? (
            <p className="text-destructive">{t("api_unavailable")}</p>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  )
}
