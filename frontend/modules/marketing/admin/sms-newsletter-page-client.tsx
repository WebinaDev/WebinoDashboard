"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { isSmsUnavailable, SmsServiceBanner } from "@/components/marketing/SmsServiceBanner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import {
  addNewsletterSubscriber,
  fetchNewsletterSubscribers,
  fetchShopSmsSettings,
  sendNewsletterCampaign,
  unsubscribeNewsletterSubscriber,
} from "../lib/modirpayamak-api"
import { SmsPanelShell } from "../lib/sms-panel-shell"

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")
  const qc = useQueryClient()
  const [productId, setProductId] = useState("0")
  const [message, setMessage] = useState("")
  const [newPhone, setNewPhone] = useState("")

  const shopQ = useQuery({ queryKey: ["shop-sms-settings"], queryFn: fetchShopSmsSettings })
  const subsQ = useQuery({
    queryKey: ["newsletter-subs", productId],
    queryFn: () => fetchNewsletterSubscribers(parseInt(productId, 10) || 0),
  })

  const unavailable = shopQ.data ? isSmsUnavailable(shopQ.data) : false
  const subscribers = subsQ.data?.subscribers ?? []
  const subscriberCount = subscribers.length
  const newsletter = shopQ.data?.settings?.newsletter ?? {}

  const addSub = useMutation({
    mutationFn: () =>
      addNewsletterSubscriber({ phone: newPhone.trim(), product_id: parseInt(productId, 10) || 0 }),
    onSuccess: async () => {
      toast.success(t("subscriberAdded"))
      setNewPhone("")
      await qc.invalidateQueries({ queryKey: ["newsletter-subs"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const removeSub = useMutation({
    mutationFn: (id: number) => unsubscribeNewsletterSubscriber(id),
    onSuccess: async () => {
      toast.success(t("subscriberRemoved"))
      await qc.invalidateQueries({ queryKey: ["newsletter-subs"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

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

      <Card className="shadow-soft mt-4 max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">{t("newsletterSubscribers")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label>{t("phone")}</Label>
              <Input
                className="mt-1 font-mono"
                dir="ltr"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="09xxxxxxxxx"
              />
            </div>
            <Button
              type="button"
              disabled={addSub.isPending || !newPhone.trim()}
              onClick={() => addSub.mutate()}
            >
              {t("addSubscriber")}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("phone")}</TableHead>
                  <TableHead>{t("productId")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscribers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground text-sm">
                      {t("noSubscribersYet")}
                    </TableCell>
                  </TableRow>
                ) : (
                  subscribers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs" dir="ltr">
                        {s.phone}
                      </TableCell>
                      <TableCell className="font-mono text-xs" dir="ltr">
                        {s.product_id}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={removeSub.isPending}
                          onClick={() => removeSub.mutate(s.id)}
                        >
                          {t("actions.delete")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </SmsPanelShell>
  )
}
