"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"

import { MediaPickerDialog } from "@/components/content/MediaPickerDialog"
import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Product = { id: number; name: string }
type Named = { id: number; name: string }
type Calculated = { retail?: number; credit?: number; wholesale?: number; installment?: number }
type PricingSettings = {
  general?: { enabled?: boolean }
  credit?: { enabled?: boolean }
  wholesale?: { enabled?: boolean }
  installment?: { enabled?: boolean }
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export default function PricingQuickAddPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const [name, setName] = useState("")
  const [purchase, setPurchase] = useState(0)
  const [imageUrl, setImageUrl] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [brandId, setBrandId] = useState("")
  const [mediaOpen, setMediaOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewPurchase, setPreviewPurchase] = useState(0)

  const { data: categories = [] } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => api<Named[]>("/api/v1/categories"),
  })
  const { data: brands = [] } = useQuery({
    queryKey: ["admin-brands"],
    queryFn: () => api<Named[]>("/api/v1/brands"),
  })
  const { data: pricingSettings } = useQuery({
    queryKey: ["pricing-settings"],
    queryFn: () => api<PricingSettings>("/api/v1/pricing/settings"),
  })

  const pricingEnabled = pricingSettings?.general?.enabled !== false
  const showCredit = pricingEnabled && Boolean(pricingSettings?.credit?.enabled)
  const showWholesale = pricingEnabled && Boolean(pricingSettings?.wholesale?.enabled)
  const showInstallment = pricingEnabled && Boolean(pricingSettings?.installment?.enabled)

  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewPurchase(purchase), 350)
    return () => window.clearTimeout(timer)
  }, [purchase])

  const { data: calculated } = useQuery({
    queryKey: ["pricing-calculate", previewPurchase],
    enabled: previewPurchase > 0 && pricingEnabled,
    queryFn: () =>
      api<Calculated>("/api/v1/pricing/calculate", {
        method: "POST",
        json: { purchase_price_minor: previewPurchase },
      }),
  })

  const previewBadges = useMemo(() => {
    if (!calculated || !pricingEnabled) return []
    const rows: { key: string; label: string; amount: number }[] = [
      { key: "retail", label: t("calc_retail"), amount: calculated.retail ?? 0 },
    ]
    if (showCredit) rows.push({ key: "credit", label: t("calc_credit"), amount: calculated.credit ?? 0 })
    if (showWholesale) rows.push({ key: "wholesale", label: t("calc_wholesale"), amount: calculated.wholesale ?? 0 })
    if (showInstallment && calculated.installment != null) {
      rows.push({ key: "installment", label: t("calc_installment"), amount: calculated.installment })
    }
    return rows
  }, [calculated, pricingEnabled, showCredit, showWholesale, showInstallment, t])

  const save = useMutation({
    mutationFn: () =>
      api<Product>("/api/v1/pricing/quick-add", {
        method: "POST",
        json: {
          name,
          purchase_price_minor: Number(purchase),
          image_url: imageUrl || null,
          category_id: categoryId ? Number(categoryId) : null,
          brand_id: brandId ? Number(brandId) : null,
        },
      }),
    onSuccess: (product) => {
      setMessage(t("quick_add_success", { name: product.name, id: product.id }))
      setName("")
      setPurchase(0)
      setImageUrl("")
      setCategoryId("")
      setBrandId("")
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <PageShell title={t("quick_add_title")} className="flex min-h-[calc(100dvh-8rem)] flex-col">
      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Card className="flex min-h-0 w-full flex-1 flex-col">
        <CardHeader>
          <CardTitle>{t("quick_add_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="grid flex-1 content-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="sm:col-span-2 xl:col-span-1">
            <Label>{t("name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t("purchase_price")}</Label>
            <Input
              type="number"
              value={purchase}
              onChange={(e) => setPurchase(Number(e.target.value))}
            />
            {previewPurchase > 0 && previewBadges.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {previewBadges.map((b) => (
                  <Badge key={b.key} variant="outline">
                    {b.label}: <MoneyDisplay amount={b.amount} />
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <Label>{t("categories")}</Label>
            <select className={selectClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t("all")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("brands")}</Label>
            <select className={selectClass} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">{t("all")}</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 xl:col-span-1">
            <Label>{t("featured_image")}</Label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="size-16 rounded border object-cover" />
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={() => setMediaOpen(true)}>
                {t("pick_from_media")}
              </Button>
              {imageUrl ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setImageUrl("")}>
                  {t("remove_image")}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex items-end sm:col-span-2 xl:col-span-3">
            <Button
              onClick={() => {
                setError(null)
                setMessage(null)
                save.mutate()
              }}
              disabled={!name || purchase <= 0 || save.isPending}
            >
              {tCommon("save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <MediaPickerDialog
        open={mediaOpen}
        onOpenChange={setMediaOpen}
        title={t("pick_from_media")}
        onPick={(item) => setImageUrl(item.url)}
      />
    </PageShell>
  )
}
