"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { CouponGeneralPanel } from "@/components/coupons/CouponGeneralPanel"
import { CouponOfferPanel } from "@/components/coupons/CouponOfferPanel"
import { CouponPublishPanel } from "@/components/coupons/CouponPublishPanel"
import { CouponRestrictionsPanel } from "@/components/coupons/CouponRestrictionsPanel"
import { CouponUsagePanel } from "@/components/coupons/CouponUsagePanel"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Coupon = {
  id?: number
  code: string
  type: string
  amount: number
  free_shipping?: boolean
  individual_use?: boolean
  exclude_sale?: boolean
  min_spend_minor?: number | null
  max_spend_minor?: number | null
  usage_limit?: number | null
  usage_limit_per_user?: number | null
  expires_at?: string | null
  status?: string
  visibility?: string
  password?: string | null
  scheduled_at?: string | null
  description?: string | null
  condition_type?: string | null
  condition_value?: number | null
  auto_apply?: boolean
  max_discount_minor?: number | null
  shipping_percent?: number | null
  restrictions?: {
    product_ids?: number[]
    category_ids?: number[]
    brand_ids?: number[]
    user_ids?: number[]
    channels?: string[]
    emails?: string[]
  }
}

export default function CouponEditorPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("coupons")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const qc = useQueryClient()
  const couponId = route.params?.couponId
  const isNew = route.path === "marketing/coupons/new" || !couponId

  const [code, setCode] = useState("")
  const [type, setType] = useState("percent")
  const [amount, setAmount] = useState(10)
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState("publish")
  const [visibility, setVisibility] = useState("public")
  const [password, setPassword] = useState("")
  const [scheduledAt, setScheduledAt] = useState("")
  const [freeShipping, setFreeShipping] = useState(false)
  const [individualUse, setIndividualUse] = useState(false)
  const [excludeSale, setExcludeSale] = useState(false)
  const [minSpend, setMinSpend] = useState("")
  const [maxSpend, setMaxSpend] = useState("")
  const [usageLimit, setUsageLimit] = useState("")
  const [usagePerUser, setUsagePerUser] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [channels, setChannels] = useState<string[]>(["site"])
  const [productIds, setProductIds] = useState<number[]>([])
  const [userIds, setUserIds] = useState<number[]>([])
  const [conditionType, setConditionType] = useState("none")
  const [conditionValue, setConditionValue] = useState("")
  const [autoApply, setAutoApply] = useState(false)
  const [maxDiscount, setMaxDiscount] = useState("")
  const [shippingPercent, setShippingPercent] = useState("")
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [brandIds, setBrandIds] = useState<number[]>([])
  const [emails, setEmails] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const q = useQuery({
    queryKey: ["coupon", couponId],
    enabled: !isNew && Boolean(couponId),
    queryFn: () => api<Coupon>(`/api/v1/marketing/coupons/${couponId}`),
  })

  useEffect(() => {
    if (!q.data) return
    const c = q.data
    setCode(c.code)
    setType(c.type)
    setAmount(c.amount)
    setDescription(c.description || "")
    setStatus(c.status || "publish")
    setVisibility(c.visibility || "public")
    setPassword(c.password || "")
    setScheduledAt(c.scheduled_at ? c.scheduled_at.slice(0, 16) : "")
    setFreeShipping(Boolean(c.free_shipping))
    setIndividualUse(Boolean(c.individual_use))
    setExcludeSale(Boolean(c.exclude_sale))
    setMinSpend(c.min_spend_minor != null ? String(c.min_spend_minor) : "")
    setMaxSpend(c.max_spend_minor != null ? String(c.max_spend_minor) : "")
    setUsageLimit(c.usage_limit != null ? String(c.usage_limit) : "")
    setUsagePerUser(c.usage_limit_per_user != null ? String(c.usage_limit_per_user) : "")
    setExpiresAt(c.expires_at ? c.expires_at.slice(0, 16) : "")
    setChannels(c.restrictions?.channels?.length ? c.restrictions.channels : ["site"])
    setProductIds((c.restrictions?.product_ids ?? []).map(Number).filter((n) => n > 0))
    setUserIds((c.restrictions?.user_ids ?? []).map(Number).filter((n) => n > 0))
    setConditionType(c.condition_type || "none")
    setConditionValue(c.condition_value != null ? String(c.condition_value) : "")
    setAutoApply(Boolean(c.auto_apply))
    setMaxDiscount(c.max_discount_minor != null ? String(c.max_discount_minor) : "")
    setShippingPercent(c.shipping_percent != null ? String(c.shipping_percent) : "")
    setCategoryIds((c.restrictions?.category_ids ?? []).map(Number).filter((n) => n > 0))
    setBrandIds((c.restrictions?.brand_ids ?? []).map(Number).filter((n) => n > 0))
    setEmails((c.restrictions?.emails ?? []).join("\n"))
  }, [q.data])

  function payload() {
    return {
      code,
      type,
      amount,
      description,
      status,
      visibility,
      password: visibility === "password" ? password || null : null,
      scheduled_at: scheduledAt || null,
      free_shipping: freeShipping,
      individual_use: individualUse,
      exclude_sale: excludeSale,
      min_spend_minor: minSpend ? Number(minSpend) : null,
      max_spend_minor: maxSpend ? Number(maxSpend) : null,
      usage_limit: usageLimit ? Number(usageLimit) : null,
      usage_limit_per_user: usagePerUser ? Number(usagePerUser) : null,
      expires_at: expiresAt || null,
      condition_type: conditionType,
      condition_value: conditionType !== "none" && conditionValue ? Number(conditionValue) : null,
      auto_apply: autoApply,
      max_discount_minor: maxDiscount ? Number(maxDiscount) : null,
      shipping_percent: shippingPercent ? Number(shippingPercent) : null,
      restrictions: {
        channels,
        product_ids: productIds,
        user_ids: userIds,
        category_ids: categoryIds,
        brand_ids: brandIds,
        emails: emails
          .split(/[\n,;]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      },
    }
  }

  const generate = useMutation({
    mutationFn: () => api<{ code: string }>("/api/v1/marketing/coupons/generate-code"),
    onSuccess: (d) => setCode(d.code),
  })

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api<Coupon>("/api/v1/marketing/coupons", { method: "POST", json: payload() })
        : api<Coupon>(`/api/v1/marketing/coupons/${couponId}`, { method: "PUT", json: payload() }),
    onSuccess: async (data) => {
      setSaved(true)
      setError(null)
      await qc.invalidateQueries({ queryKey: ["coupons"] })
      if (isNew && data.id) router.replace(`/dashboard/marketing/coupons/${data.id}`)
    },
    onError: (e: Error) => {
      setSaved(false)
      setError(getApiErrorMessage(e))
    },
  })

  return (
    <PageShell title={isNew ? t("addCoupon") : t("edit")} description={t("description")}>
      <div className="mb-2 flex justify-end">
        <Button variant="outline" asChild>
          <Link href="/dashboard/marketing/coupons">{tCommon("back")}</Link>
        </Button>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {saved ? <p className="text-sm text-green-700">{tCommon("saved")}</p> : null}

      <div className="grid max-w-4xl gap-4 lg:grid-cols-[1fr_240px]">
        <div className="space-y-4">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">{t("panels.general")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CouponGeneralPanel
                code={code}
                setCode={setCode}
                type={type}
                setType={setType}
                amount={amount}
                setAmount={setAmount}
                description={description}
                setDescription={setDescription}
                onGenerate={() => generate.mutate()}
              />
            </CardContent>
          </Card>
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">{t("panels.usage")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CouponUsagePanel
                freeShipping={freeShipping}
                setFreeShipping={setFreeShipping}
                individualUse={individualUse}
                setIndividualUse={setIndividualUse}
                excludeSale={excludeSale}
                setExcludeSale={setExcludeSale}
                minSpend={minSpend}
                setMinSpend={setMinSpend}
                maxSpend={maxSpend}
                setMaxSpend={setMaxSpend}
                usageLimit={usageLimit}
                setUsageLimit={setUsageLimit}
                usagePerUser={usagePerUser}
                setUsagePerUser={setUsagePerUser}
                expiresAt={expiresAt}
                setExpiresAt={setExpiresAt}
              />
            </CardContent>
          </Card>
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">{t("offer.panel")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CouponOfferPanel
                conditionType={conditionType}
                setConditionType={setConditionType}
                conditionValue={conditionValue}
                setConditionValue={setConditionValue}
                autoApply={autoApply}
                setAutoApply={setAutoApply}
                maxDiscount={maxDiscount}
                setMaxDiscount={setMaxDiscount}
                shippingPercent={shippingPercent}
                setShippingPercent={setShippingPercent}
              />
            </CardContent>
          </Card>
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">{t("panels.restrictions")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CouponRestrictionsPanel
                channels={channels}
                setChannels={setChannels}
                productIds={productIds}
                setProductIds={setProductIds}
                userIds={userIds}
                setUserIds={setUserIds}
                categoryIds={categoryIds}
                setCategoryIds={setCategoryIds}
                brandIds={brandIds}
                setBrandIds={setBrandIds}
                emails={emails}
                setEmails={setEmails}
              />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">{t("panels.publish")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CouponPublishPanel
                status={status}
                setStatus={setStatus}
                visibility={visibility}
                setVisibility={setVisibility}
                password={password}
                setPassword={setPassword}
                scheduledAt={scheduledAt}
                setScheduledAt={setScheduledAt}
              />
              <Button className="w-full" disabled={save.isPending || !code} onClick={() => save.mutate()}>
                {tCommon("save")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
