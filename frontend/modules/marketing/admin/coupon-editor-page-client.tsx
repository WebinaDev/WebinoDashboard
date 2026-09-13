"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { CouponGeneralPanel } from "@/components/coupons/CouponGeneralPanel"
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
  description?: string | null
  restrictions?: {
    product_ids?: number[]
    category_ids?: number[]
    brand_ids?: number[]
    channels?: string[]
    emails?: string[]
  }
}

function parseIds(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
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
  const [freeShipping, setFreeShipping] = useState(false)
  const [individualUse, setIndividualUse] = useState(false)
  const [excludeSale, setExcludeSale] = useState(false)
  const [minSpend, setMinSpend] = useState("")
  const [maxSpend, setMaxSpend] = useState("")
  const [usageLimit, setUsageLimit] = useState("")
  const [usagePerUser, setUsagePerUser] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [channels, setChannels] = useState<string[]>(["site"])
  const [productIds, setProductIds] = useState("")
  const [categoryIds, setCategoryIds] = useState("")
  const [brandIds, setBrandIds] = useState("")
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
    setFreeShipping(Boolean(c.free_shipping))
    setIndividualUse(Boolean(c.individual_use))
    setExcludeSale(Boolean(c.exclude_sale))
    setMinSpend(c.min_spend_minor != null ? String(c.min_spend_minor) : "")
    setMaxSpend(c.max_spend_minor != null ? String(c.max_spend_minor) : "")
    setUsageLimit(c.usage_limit != null ? String(c.usage_limit) : "")
    setUsagePerUser(c.usage_limit_per_user != null ? String(c.usage_limit_per_user) : "")
    setExpiresAt(c.expires_at ? c.expires_at.slice(0, 16) : "")
    setChannels(c.restrictions?.channels?.length ? c.restrictions.channels : ["site"])
    setProductIds((c.restrictions?.product_ids ?? []).join(","))
    setCategoryIds((c.restrictions?.category_ids ?? []).join(","))
    setBrandIds((c.restrictions?.brand_ids ?? []).join(","))
    setEmails((c.restrictions?.emails ?? []).join("\n"))
  }, [q.data])

  function payload() {
    return {
      code,
      type,
      amount,
      description,
      status,
      free_shipping: freeShipping,
      individual_use: individualUse,
      exclude_sale: excludeSale,
      min_spend_minor: minSpend ? Number(minSpend) : null,
      max_spend_minor: maxSpend ? Number(maxSpend) : null,
      usage_limit: usageLimit ? Number(usageLimit) : null,
      usage_limit_per_user: usagePerUser ? Number(usagePerUser) : null,
      expires_at: expiresAt || null,
      restrictions: {
        channels,
        product_ids: parseIds(productIds),
        category_ids: parseIds(categoryIds),
        brand_ids: parseIds(brandIds),
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
      if (isNew && data.id) router.replace(`/admin/marketing/coupons/${data.id}`)
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
          <Link href="/admin/marketing/coupons">{tCommon("back")}</Link>
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
              <CardTitle className="text-base">{t("panels.restrictions")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CouponRestrictionsPanel
                channels={channels}
                setChannels={setChannels}
                productIds={productIds}
                setProductIds={setProductIds}
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
              <CouponPublishPanel status={status} setStatus={setStatus} />
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
