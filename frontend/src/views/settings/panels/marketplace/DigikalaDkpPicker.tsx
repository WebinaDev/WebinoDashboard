"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { fmtNum } from "@/views/settings/panels/marketplace/MarketplaceShared"

type DkVariant = { variant_id: string; product_id: string; title: string; label?: string; price: number; stock: number }

type MapResult = { dk_product_id: string; dk_variant_id: string; variants: DkVariant[]; needs_variant: boolean }

/** Map a product/variant to Digikala by DKP code; asks for the Digikala variant when there are several. */
export function DigikalaDkpPicker({ productId, variantId, currentDkp }: { productId: string; variantId: number | null; currentDkp: string | null }) {
  const t = useTranslations("marketplace_admin.digikala")
  const locale = useLocale()
  const qc = useQueryClient()
  const [dkp, setDkp] = useState(currentDkp ? `DKP-${currentDkp}` : "")
  const [result, setResult] = useState<MapResult | null>(null)

  const map = useMutation({
    mutationFn: (dkVariant?: string) =>
      api<MapResult>(`/api/v1/marketplace/digikala/products/${productId}/map`, {
        method: "POST",
        json: { dkp, variant_id: dkVariant ?? null, product_variant_id: variantId },
      }),
    onSuccess: (res) => {
      setResult(res.needs_variant ? res : null)
      if (!res.needs_variant) toast.success(t("dkp_mapped"))
      void qc.invalidateQueries({ queryKey: ["product-marketplace-maps", productId] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-48 flex-1 gap-1">
          <Label className="text-xs">{t("dkp")}</Label>
          <Input dir="ltr" placeholder="DKP-123456" value={dkp} onChange={(e) => setDkp(e.target.value)} />
        </div>
        <Button size="sm" variant="outline" disabled={map.isPending || !dkp.trim()} onClick={() => map.mutate(undefined)}>
          {t("resolve_dkp")}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{t("dkp_hint")}</p>
      {result?.needs_variant ? (
        <div className="space-y-1">
          <p className="text-xs font-medium">{t("pick_variant")}</p>
          <ul className="space-y-1">
            {result.variants.map((v) => (
              <li key={v.variant_id} className="flex flex-wrap items-center gap-2 rounded border px-2 py-1 text-xs">
                <span className="min-w-0 flex-1">
                  {v.label || v.title || `#${v.variant_id}`}
                  <span className="text-muted-foreground ms-2" dir="ltr">
                    #{v.variant_id}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {fmtNum(v.price, locale)} · {t("stock")}: {fmtNum(v.stock, locale)}
                </span>
                <Button size="sm" variant="secondary" disabled={map.isPending} onClick={() => map.mutate(v.variant_id)}>
                  {t("select")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
