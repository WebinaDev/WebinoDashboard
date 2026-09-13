"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { fetchSmsPackages, initSmsTopup, smsQueryOptions } from "../../lib/modirpayamak-api"
import { SmsNav } from "../../lib/sms-nav"

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms_admin")
  const [error, setError] = useState<string | null>(null)
  const q = useQuery({ queryKey: ["sms", "packages"], queryFn: () => fetchSmsPackages(), ...smsQueryOptions })
  const init = useMutation({
    mutationFn: (packageId: number) => initSmsTopup({ package_id: packageId }),
    onSuccess: (data) => {
      setError(null)
      const url = (data as { payment_url?: string }).payment_url
      if (url) window.location.assign(url)
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })
  const packages = ((q.data as { packages?: { id: number; name: string; amount: number }[] } | undefined)?.packages) ?? []

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">{t("pages.topup")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <SmsNav />
      <Card>
        <CardHeader><CardTitle className="text-base">{t("pages.topup")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {q.isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
          <ul className="space-y-2">
            {packages.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>{p.name} — {p.amount}</span>
                <Button size="sm" disabled={init.isPending} onClick={() => init.mutate(p.id)}>{t("actions.topup")}</Button>
              </li>
            ))}
          </ul>
          {!q.isLoading && packages.length === 0 && q.data && (
            <pre className="max-h-80 overflow-auto rounded-md bg-muted/40 p-3 text-xs">{JSON.stringify(q.data, null, 2)}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
