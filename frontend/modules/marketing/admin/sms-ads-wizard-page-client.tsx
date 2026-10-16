"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { dashboardPath } from "@/kernel/paths"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatNumber, toLocaleDigits } from "@/lib/locale"
import { cn } from "@/lib/utils"

import {
  createSmsAd,
  fetchSmsAccount,
  previewSmsAdSegment,
  quoteSmsAd,
  smsQueryOptions,
} from "../lib/modirpayamak-api"
import { SmsPanelShell } from "../lib/sms-panel-shell"

type SegmentKey =
  | "system_suggest"
  | "retarget"
  | "acquire"
  | "city_customers"
  | "all_city"
  | "vip_buyers"
  | "followers"

const SEGMENTS: SegmentKey[] = [
  "system_suggest",
  "retarget",
  "acquire",
  "city_customers",
  "all_city",
  "vip_buyers",
  "followers",
]

function tomorrowIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function defaultCampaignName(locale: string): string {
  const d = new Date()
  const label = d.toLocaleDateString(locale.startsWith("fa") ? "fa-IR" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
  const base = locale.startsWith("fa") ? `کمپین پیامکی ${label}` : `SMS campaign ${label}`
  return base.slice(0, 16)
}

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("smsAds")
  const tSms = useTranslations("sms")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()
  const qc = useQueryClient()

  const [step, setStep] = useState(1)
  const [segment, setSegment] = useState<SegmentKey>("system_suggest")
  const [name, setName] = useState(() => defaultCampaignName(locale))
  const [channel, setChannel] = useState<"sms" | "notification">("sms")
  const [schedule, setSchedule] = useState(tomorrowIso())
  const [contentType, setContentType] = useState<"product" | "category">("product")
  const [productId, setProductId] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [message, setMessage] = useState("")
  const [coupon, setCoupon] = useState("")
  const [segCount, setSegCount] = useState<number | null>(null)

  const accountQ = useQuery({
    queryKey: ["sms", "account"],
    queryFn: fetchSmsAccount,
    ...smsQueryOptions,
  })
  const account = accountQ.data?.account

  const previewMut = useMutation({
    mutationFn: () => previewSmsAdSegment(segment),
    onSuccess: (res) => setSegCount(res.count),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const quoteMut = useMutation({
    mutationFn: () =>
      quoteSmsAd({
        segment,
        channel,
        message: message || "preview",
      }),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const createMut = useMutation({
    mutationFn: () =>
      createSmsAd({
        name,
        segment,
        channel,
        message,
        schedule,
        content_type: contentType,
        product_id: contentType === "product" ? Number(productId) || 0 : 0,
        category_id: contentType === "category" ? Number(categoryId) || 0 : 0,
        coupon_code: coupon,
        quoted_cost: quoteMut.data?.customer_cost ?? 0,
      }),
    onSuccess: (res) => {
      toast.success(t("created"))
      void qc.invalidateQueries({ queryKey: ["sms", "ads"] })
      router.push(dashboardPath(`marketing/sms/ads/${res.campaign.id}`))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const fmt = (n: number) => formatNumber(n, locale)

  const smsSale = account?.price_per_unit ?? 0
  const smsList = account?.price_list ?? smsSale
  const notifSale = account?.notif_price_per_unit ?? 0
  const notifList = account?.notif_price_list ?? notifSale

  const canNext1 = !!segment
  const canNext2 =
    name.trim().length > 0 &&
    name.trim().length <= 16 &&
    !!schedule &&
    message.trim().length > 0

  const quote = quoteMut.data
  const steps = useMemo(() => [t("stepTarget"), t("stepSettings"), t("stepPay")], [t])

  return (
    <SmsPanelShell title={t("wizardTitle")} description={t("heroDesc")}>
      <div className="mx-auto w-full max-w-2xl space-y-6 pb-24">
        <div className="flex items-center justify-between gap-2">
          {steps.map((label, i) => {
            const n = i + 1
            const active = step === n
            const done = step > n
            return (
              <div key={label} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-sm font-medium",
                    active && "bg-primary text-primary-foreground",
                    done && "bg-primary/20 text-primary",
                    !active && !done && "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? "✓" : toLocaleDigits(String(n), locale)}
                </div>
                <span className={cn("text-xs", active ? "font-medium" : "text-muted-foreground")}>{label}</span>
              </div>
            )
          })}
        </div>

        {step === 1 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("whoQuestion")}</p>
            {SEGMENTS.map((key) => (
              <label
                key={key}
                className={cn(
                  "border-border flex cursor-pointer gap-3 rounded-xl border p-3",
                  segment === key && "border-primary bg-primary/5",
                )}
              >
                <input
                  type="radio"
                  className="mt-1"
                  checked={segment === key}
                  onChange={() => {
                    setSegment(key)
                    setSegCount(null)
                  }}
                />
                <span>
                  <span className="block text-sm font-medium">{t(`seg.${key}.title`)}</span>
                  <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
                    {t(`seg.${key}.desc`)}
                  </span>
                </span>
              </label>
            ))}
            {segCount != null ? (
              <p className="text-muted-foreground text-sm">{t("segmentCount", { count: fmt(segCount) })}</p>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("nameLabel")}</Label>
              <Input maxLength={16} value={name} onChange={(e) => setName(e.target.value.slice(0, 16))} />
              <p className="text-muted-foreground text-xs">
                {t("nameHint")} · {toLocaleDigits(String(name.length), locale)}/{toLocaleDigits("16", locale)}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t("channelLabel")}</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["sms", t("channelSms"), smsSale, smsList],
                    ["notification", t("channelNotif"), notifSale, notifList],
                  ] as const
                ).map(([key, label, sale, list]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setChannel(key)}
                    className={cn(
                      "border-border rounded-xl border p-3 text-start",
                      channel === key && "border-primary bg-primary/5",
                    )}
                  >
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="mt-1 flex items-center gap-2 text-sm">
                      <span className="font-semibold">{fmt(sale)}</span>
                      {list > sale ? (
                        <span className="text-muted-foreground line-through">{fmt(list)}</span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("dateLabel")}</Label>
              <Input type="date" value={schedule} onChange={(e) => setSchedule(e.target.value)} dir="ltr" />
              <p className="text-muted-foreground text-xs">{t("dateHint")}</p>
            </div>

            <div className="space-y-2">
              <Label>{t("contentLabel")}</Label>
              <div className="flex gap-3">
                {(["product", "category"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={contentType === k} onChange={() => setContentType(k)} />
                    {t(`content.${k}`)}
                  </label>
                ))}
              </div>
              {contentType === "product" ? (
                <Input
                  dir="ltr"
                  placeholder={t("productId")}
                  value={productId}
                  onChange={(e) => setProductId(e.target.value.replace(/\D/g, ""))}
                />
              ) : (
                <Input
                  dir="ltr"
                  placeholder={t("categoryId")}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value.replace(/\D/g, ""))}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>{t("messageLabel")}</Label>
              <Textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("messagePlaceholder")}
              />
              <p className="text-muted-foreground text-xs">{t("messageHint")}</p>
            </div>

            <div className="space-y-2">
              <Label>{t("couponOptional")}</Label>
              <Input value={coupon} onChange={(e) => setCoupon(e.target.value)} dir="ltr" />
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <div className="border-border space-y-2 rounded-xl border p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("recipients")}</span>
                <span>{fmt(quote?.recipient_count ?? segCount ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("unitPrice")}</span>
                <span>{fmt(quote?.price_per_unit ?? (channel === "sms" ? smsSale : notifSale))}</span>
              </div>
              {(quote?.discount_percent ?? 0) > 0 ? (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span>{t("volumeDiscount")}</span>
                  <span>{fmt(quote?.discount_percent ?? 0)}%</span>
                </div>
              ) : null}
              <div className="flex justify-between font-medium">
                <span>{t("total")}</span>
                <span>
                  {fmt(quote?.customer_cost ?? 0)} {tSms("toman")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tSms("balance")}</span>
                <span>
                  {fmt(quote?.balance ?? account?.balance ?? 0)} {tSms("toman")}
                </span>
              </div>
            </div>
            <Button type="button" variant="outline" disabled={quoteMut.isPending} onClick={() => quoteMut.mutate()}>
              {t("refreshQuote")}
            </Button>
          </div>
        ) : null}

        <div className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-40 flex justify-between gap-2 border-t p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          {step > 1 ? (
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
              {t("prev")}
            </Button>
          ) : (
            <Button type="button" variant="ghost" asChild>
              <Link href={dashboardPath("marketing/sms")}>{tCommon("cancel")}</Link>
            </Button>
          )}
          {step < 3 ? (
            <Button
              type="button"
              disabled={step === 1 ? !canNext1 : !canNext2}
              onClick={() => {
                if (step === 1) {
                  previewMut.mutate()
                  setStep(2)
                  return
                }
                quoteMut.mutate()
                setStep(3)
              }}
            >
              {t("next")}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={createMut.isPending || !quote || (quote.customer_cost ?? 0) <= 0}
              onClick={() => createMut.mutate()}
            >
              {t("confirmPay")}
            </Button>
          )}
        </div>
      </div>
    </SmsPanelShell>
  )
}
