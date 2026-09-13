"use client"

import { useMutation } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { verifySmsTopup } from "../../lib/modirpayamak-api"
import { SmsNav } from "../../lib/sms-nav"

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms_admin")
  const params = useSearchParams()
  const [msg, setMsg] = useState<string | null>(null)
  const verify = useMutation({
    mutationFn: () =>
      verifySmsTopup({
        order_id: params.get("order_id") ?? params.get("Authority") ?? undefined,
        status: params.get("status") ?? params.get("Status") ?? undefined,
      }),
    onSuccess: (data) => setMsg(JSON.stringify(data)),
    onError: (e: Error) => setMsg(getApiErrorMessage(e)),
  })

  useEffect(() => {
    verify.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold">{t("pages.payment_callback")}</h1>
      <SmsNav />
      <Card>
        <CardHeader><CardTitle className="text-base">{t("pages.payment_callback")}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{msg ?? t("loading")}</p>
        </CardContent>
      </Card>
    </div>
  )
}
