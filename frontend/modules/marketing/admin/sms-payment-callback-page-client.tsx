"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { cn } from "@/lib/utils"
import { verifySmsTopup } from "../lib/modirpayamak-api"
import { SmsPanelShell } from "../lib/sms-panel-shell"

type CallbackState = "verifying" | "success" | "error"

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")
  const params = useSearchParams()
  const [state, setState] = useState<CallbackState>("verifying")
  const [message, setMessage] = useState(t("paymentVerifying"))

  useEffect(() => {
    const authority = params.get("Authority") ?? params.get("authority") ?? ""
    const status = params.get("Status") ?? params.get("status") ?? ""
    const orderRaw = params.get("order_id")
    void verifySmsTopup({
      authority,
      status,
      order_id: orderRaw ? Number(orderRaw) : undefined,
    })
      .then((res) => {
        if (res.ok || res.credited) {
          setState("success")
          setMessage(t("paymentSuccess"))
        } else {
          setState("error")
          setMessage(t("paymentFailed"))
        }
      })
      .catch(() => {
        setState("error")
        setMessage(t("paymentFailed"))
      })
  }, [params, t])

  return (
    <SmsPanelShell title={t("pages.payment_callback")}>
      <div className="flex min-h-[40vh] items-center justify-center">
        <Card
          className={cn(
            "w-full max-w-md shadow-soft",
            state === "success" && "border-emerald-500/40",
            state === "error" && "border-destructive/40",
          )}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {state === "verifying" ? (
                <Loader2 className="size-5 animate-spin" />
              ) : state === "success" ? (
                <CheckCircle2 className="size-5 text-emerald-600" />
              ) : (
                <XCircle className="text-destructive size-5" />
              )}
              {t("pages.payment_callback")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                "text-sm",
                state === "success" && "text-emerald-700 dark:text-emerald-300",
                state === "error" && "text-destructive",
              )}
            >
              {message}
            </p>
          </CardContent>
          {state !== "verifying" ? (
            <CardFooter>
              <Button asChild>
                <Link href="/admin/marketing/sms/wallet">{t("goToWallet")}</Link>
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      </div>
    </SmsPanelShell>
  )
}
