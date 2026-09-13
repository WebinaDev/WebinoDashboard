"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { isSmsUnavailable, SmsServiceBanner } from "@/components/marketing/SmsServiceBanner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { fetchSmsPackages, initSmsTopup, smsQueryOptions, type SmsPackage } from "../lib/modirpayamak-api"
import { SmsPanelShell } from "../lib/sms-panel-shell"

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")
  const [error, setError] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ["sms", "packages"],
    queryFn: () => fetchSmsPackages(),
    ...smsQueryOptions,
  })

  const pay = useMutation({
    mutationFn: (id: number) => initSmsTopup(id),
    onSuccess: (res) => {
      setError(null)
      if (res.payment_url) {
        window.location.href = res.payment_url
        return
      }
      if (isSmsUnavailable(res)) {
        setError(String(res.message ?? t("serviceUnavailable")))
        return
      }
      setError(t("paymentFailed"))
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const unavailable = q.data ? isSmsUnavailable(q.data) : false
  const packages: SmsPackage[] = unavailable ? [] : (q.data?.packages ?? [])
  const loading = q.isPending

  return (
    <SmsPanelShell title={t("topupTitle")} description={t("topupHint")}>
      {q.isError ? <SmsServiceBanner message={getApiErrorMessage(q.error)} onRetry={() => void q.refetch()} /> : null}
      {unavailable ? (
        <SmsServiceBanner message={String(q.data?.message ?? "")} onRetry={() => void q.refetch()} />
      ) : null}
      {error ? <p className="text-destructive mb-3 text-sm">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }, (_, i) => (
              <Card key={i} className="shadow-soft">
                <CardHeader>
                  <Skeleton className="h-5 w-24" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-9 w-full" />
                </CardContent>
              </Card>
            ))
          : packages.map((p) => (
              <Card key={p.id} className="shadow-soft">
                <CardHeader>
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <CardDescription>{t("topupHint")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-2xl font-bold">
                    {p.amount.toLocaleString()} {t("toman")}
                  </p>
                  {p.bonus > 0 ? (
                    <p className="text-muted-foreground text-sm">
                      + {p.bonus.toLocaleString()} {t("bonus")}
                    </p>
                  ) : null}
                  <Button disabled={unavailable || pay.isPending} onClick={() => pay.mutate(p.id)}>
                    {t("buy")}
                  </Button>
                </CardContent>
              </Card>
            ))}
      </div>
      {!loading && packages.length === 0 && !unavailable ? (
        <p className="text-muted-foreground mt-4 text-sm">{t("noPackages")}</p>
      ) : null}
    </SmsPanelShell>
  )
}
