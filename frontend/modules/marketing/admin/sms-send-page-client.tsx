"use client"

import { useMutation } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { sendSms } from "../../lib/modirpayamak-api"
import { SmsNav } from "../../lib/sms-nav"

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms_admin")
  const [to, setTo] = useState("")
  const [message, setMessage] = useState("")
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const send = useMutation({
    mutationFn: () => sendSms({ to, message }),
    onSuccess: (data) => {
      setError(null)
      setResult(JSON.stringify(data, null, 2))
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">{t("pages.send")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <SmsNav />
      <Card className="max-w-xl">
        <CardHeader><CardTitle className="text-base">{t("pages.send")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sms-to">{t("fields.to")}</Label>
            <Input id="sms-to" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sms-msg">{t("fields.message")}</Label>
            <Textarea id="sms-msg" className="min-h-28" value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {result && <pre className="overflow-auto rounded-md bg-muted/40 p-2 text-xs">{result}</pre>}
          <Button disabled={send.isPending || !to || !message} onClick={() => send.mutate()}>
            {t("actions.send")}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
