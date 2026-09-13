"use client"

import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { fetchSmsNumbers, smsQueryOptions } from "../../lib/modirpayamak-api"
import { SmsNav } from "../../lib/sms-nav"

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms_admin")
  const q = useQuery({
    queryKey: ["sms", "sms-lines"],
    queryFn: () => fetchSmsNumbers(),
    ...smsQueryOptions,
  })

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">{t("title")} — {t("pages.lines")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <SmsNav />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("pages.lines")}</CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
          {q.isError && <p className="text-sm text-destructive">{getApiErrorMessage(q.error)}</p>}
          {q.data && (
            <pre className="max-h-[480px] overflow-auto rounded-md bg-muted/40 p-3 text-xs">
              {JSON.stringify(q.data, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
