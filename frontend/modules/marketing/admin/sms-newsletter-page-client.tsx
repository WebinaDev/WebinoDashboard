"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useMutation, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"

import { isSmsUnavailable, SmsServiceBanner } from "@/components/marketing/SmsServiceBanner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import {
  fetchNewsletterSubscribers,
  fetchShopSmsSettings,
  sendNewsletterCampaign,
} from "../lib/modirpayamak-api"
import { SmsPanelShell } from "../lib/sms-panel-shell"

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")
  const [productId, setProductId] = useState("0")
  const [message, setMessage] = useState("")

  const shopQ = useQuery({ queryKey: ["shop-sms-settings"], queryFn: fetchShopSmsSettings })
  const subsQ = useQuery({
    queryKey: ["newsletter-subs", productId],
    queryFn: () => fetchNewsletterSubscribers(parseInt(productId, 10) || 0),
  })

  const unavailable = shopQ.data ? isSmsUnavailable(shopQ.data) : false
  const subscriberCount = subsQ.data?.subscribers?.length ?? 0
  const newsletter = shopQ.data?.settings?.newsletter ?? {}

  const send = useMutation({
    mutationFn: () =>
      sendNewsletterCampaign({
        product_id: parseInt(productId, 10) || 0,
        message: message.trim() || String(newsletter.message_template ?? ""),
      }),
    onSuccess: (res: { sent?: number }) =>
      toast.success(t("newsletterSent", { count: res.sent ?? 0 })),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const onSend = () => {
    const body = message.trim() || String(newsletter.message_template ?? "").trim()
    if (!body) {
      toast.error(t("messageRequired"))
      return
    }
    if (subscriberCount <= 0) {
      toast.error(t("newsletterNoSubscribers"))
      return
    }
    if (!newsletter.enabled) {
      toast.error(t("newsletterDisabled"))
      return
    }
    send.mutate()
  }

  return (
    <SmsPanelShell title={t("newsletterTitle")} description={t("newsletterHint")}>
      {(shopQ.isError || subsQ.isError) && (
        <SmsServiceBanner
          message={getApiErrorMessage(shopQ.error ?? subsQ.error)}
          onRetry={() => {
            void shopQ.refetch()
            void subsQ.refetch()
          }}
        />
      )}
      {unavailable ? (
        <SmsServiceBanner
          message={String((shopQ.data as { message?: string })?.message ?? "")}
          onRetry={() => void shopQ.refetch()}
        />
      ) : null}

      <Card className="shadow-soft max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">{t("newsletterCampaign")}</CardTitle>
          <CardDescription>
            {newsletter.pattern_code
              ? t("newsletterPatternBound", { code: newsletter.pattern_code })
              : t("newsletterBindHint")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t("productId")}</Label>
            <Input
              className="mt-1"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label>{t("message")}</Label>
            <Textarea
              className="mt-1"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={newsletter.message_template || undefined}
            />
          </div>
          <p className="text-muted-foreground text-sm">
            {t("subscriberCount", { count: subscriberCount })}
          </p>
          <Button type="button" disabled={send.isPending || unavailable} onClick={onSend}>
            {t("sendCampaign")}
          </Button>
        </CardContent>
      </Card>
    </SmsPanelShell>
  )
}
