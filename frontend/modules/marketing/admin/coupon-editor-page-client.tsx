"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
const CHANNELS = ["site", "bale", "telegram"] as const

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
    user_ids?: number[]
  }
}

export default function CouponEditorPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("coupons_admin")
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

  function parseIds(text: string): number[] {
    return text
      .split(/[\s,;]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  }

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
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{isNew ? t("actions.new") : t("edit")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/marketing/coupons">{tCommon("back")}</Link>
        </Button>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">{t("form.general")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm text-green-700">{tCommon("saved")}</p>}

          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="code">{t("fields.code")}</Label>
              <Input id="code" className="font-mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </div>
            <Button type="button" className="mt-6" variant="secondary" onClick={() => generate.mutate()}>
              {t("actions.generate")}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="type">{t("fields.type")}</Label>
              <select id="type" className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="percent">percent</option>
                <option value="fixed_cart">fixed_cart</option>
                <option value="fixed_product">fixed_product</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="amount">{t("fields.amount")}</Label>
              <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="desc">{t("fields.description")}</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="status">{t("fields.status")}</Label>
              <select id="status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="publish">publish</option>
                <option value="draft">draft</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="expires">{t("fields.expires")}</Label>
              <Input id="expires" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="min">{t("fields.min_spend")}</Label>
              <Input id="min" value={minSpend} onChange={(e) => setMinSpend(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="max">{t("fields.max_spend")}</Label>
              <Input id="max" value={maxSpend} onChange={(e) => setMaxSpend(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ul">{t("fields.usage_limit")}</Label>
              <Input id="ul" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="upu">{t("fields.usage_per_user")}</Label>
              <Input id="upu" value={usagePerUser} onChange={(e) => setUsagePerUser(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={freeShipping} onCheckedChange={(v) => setFreeShipping(Boolean(v))} />
              {t("fields.free_shipping")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={individualUse} onCheckedChange={(v) => setIndividualUse(Boolean(v))} />
              {t("fields.individual_use")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={excludeSale} onCheckedChange={(v) => setExcludeSale(Boolean(v))} />
              {t("fields.exclude_sale")}
            </label>
          </div>

          <div className="space-y-2">
            <Label>{t("fields.channels")}</Label>
            <div className="flex flex-wrap gap-3">
              {CHANNELS.map((ch) => (
                <label key={ch} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={channels.includes(ch)}
                    onCheckedChange={(v) =>
                      setChannels((prev) => (v ? [...new Set([...prev, ch])] : prev.filter((x) => x !== ch)))
                    }
                  />
                  {ch}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="pids">{t("fields.product_ids")}</Label>
            <Input id="pids" value={productIds} onChange={(e) => setProductIds(e.target.value)} placeholder="1,2,3" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cids">{t("fields.category_ids")}</Label>
            <Input id="cids" value={categoryIds} onChange={(e) => setCategoryIds(e.target.value)} placeholder="1,2" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bids">{t("fields.brand_ids")}</Label>
            <Input id="bids" value={brandIds} onChange={(e) => setBrandIds(e.target.value)} placeholder="1,2" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="emails">{t("fields.emails")}</Label>
            <Textarea id="emails" value={emails} onChange={(e) => setEmails(e.target.value)} />
          </div>

          <Button disabled={save.isPending || !code} onClick={() => save.mutate()}>
            {tCommon("save")}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
