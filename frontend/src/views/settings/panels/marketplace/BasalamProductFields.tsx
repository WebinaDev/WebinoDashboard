"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { BasalamCategoryPicker, RemoteBasalamPicker } from "@/views/settings/panels/marketplace/BasalamProductsTab"
import { fmtDate, selectClass } from "@/views/settings/panels/marketplace/MarketplaceShared"

export const BASALAM_UNIT_TYPES = [
  6304, 6305, 6306, 6307, 6308, 6309, 6310, 6311, 6312, 6313, 6314, 6315, 6316, 6317, 6318, 6319, 6320, 6321, 6322, 6323, 6324, 6325, 6326, 6327,
  6328, 6329, 6330, 6331, 6332, 6373, 6374, 6375, 6392, 6438, 6466,
] as const

const MOBILE_KEYS = ["storage", "cpu_type", "ram", "screen_size", "rear_camera", "battery_capacity"] as const
const GOLD_KEYS = ["purity", "weight"] as const

type BasalamMeta = {
  unit_type?: number
  unit_quantity?: number
  is_wholesale?: boolean
  price_change?: string
  variant_price_change?: Record<string, string>
  is_mobile?: boolean
  mobile?: Partial<Record<(typeof MOBILE_KEYS)[number], string>>
  is_gold?: boolean
  gold?: Partial<Record<(typeof GOLD_KEYS)[number], string>>
  video_url?: string
  category_ids?: number[]
  preparation_days?: number
}

type BasalamProductInfo = {
  maps: {
    id: number
    variant_id: number | null
    remote_product_id: string | null
    remote_url: string | null
    status: number
    remote_price: number | null
    remote_stock: number | null
    last_sync_at: string | null
    last_error: string | null
  }[]
  meta: BasalamMeta
  is_variable: boolean
  preview: { price?: number; stock?: number; name?: string; category_ids?: number[]; error?: string } | null
}

type VariantRow = { product_variant_id: number | null; variant_name?: string | null; variant_sku?: string | null }

const STATUS_ARCHIVED = 3790

export function BasalamProductFields({ productId, variantId }: { productId: string; variantId: number | null }) {
  const t = useTranslations("marketplace_admin.basalam")
  const locale = useLocale()
  const qc = useQueryClient()
  const [meta, setMeta] = useState<BasalamMeta>({})
  const [linking, setLinking] = useState(false)

  const key = ["basalam-product", productId]
  const infoQ = useQuery({ queryKey: key, queryFn: () => api<BasalamProductInfo>(`/api/v1/marketplace/basalam/products/${productId}`) })
  const mapsQ = useQuery({
    queryKey: ["product-marketplace-maps", productId],
    queryFn: () => api<{ variants: VariantRow[] }[]>(`/api/v1/marketplace/products/${productId}/maps`),
  })
  useEffect(() => {
    if (infoQ.data) setMeta(structuredClone(infoQ.data.meta ?? {}))
  }, [infoQ.data])

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key })
    void qc.invalidateQueries({ queryKey: ["product-marketplace-maps", productId] })
  }
  const onError = (e: Error) => toast.error(getApiErrorMessage(e))

  const save = useMutation({
    mutationFn: () => api<{ meta: BasalamMeta }>(`/api/v1/marketplace/basalam/products/${productId}/meta`, { method: "PUT", json: meta }),
    onSuccess: () => {
      toast.success(t("product_meta_saved"))
      refresh()
    },
    onError,
  })
  const action = useMutation({
    mutationFn: ({ name, extra }: { name: string; extra?: Record<string, unknown> }) =>
      api(`/api/v1/marketplace/basalam/sync/products/${name}`, { method: "POST", json: { product_id: Number(productId), ...(extra ?? {}) } }),
    onSuccess: () => {
      toast.success(t("done"))
      refresh()
    },
    onError,
  })

  const set = <K extends keyof BasalamMeta>(k: K, v: BasalamMeta[K]) => setMeta((m) => ({ ...m, [k]: v }))
  const variants = (mapsQ.data?.[0]?.variants ?? []).filter((v) => v.product_variant_id)
  const info = infoQ.data
  const maps = info?.maps ?? []
  const connected = maps.some((m) => m.remote_product_id)
  const archived = connected && maps.every((m) => m.status === STATUS_ARCHIVED)
  const cats = meta.category_ids ?? []

  if (infoQ.isLoading) return <p className="text-muted-foreground text-xs">{t("loading")}</p>
  if (infoQ.error) return <p className="text-destructive text-xs">{getApiErrorMessage(infoQ.error)}</p>

  return (
    <div className="space-y-4 border-t pt-3">
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("product_links")}</Label>
        {maps.length ? (
          <ul className="space-y-1 text-xs">
            {maps.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2">
                {m.variant_id ? <Badge variant="outline">#{m.variant_id}</Badge> : null}
                {m.remote_url ? (
                  <a className="text-primary hover:underline" href={m.remote_url} target="_blank" rel="noreferrer" dir="ltr">
                    {m.remote_product_id}
                  </a>
                ) : null}
                {m.status === STATUS_ARCHIVED ? <Badge variant="outline">{t("archived")}</Badge> : null}
                <span className="text-muted-foreground">
                  {m.remote_price ?? "—"} / {m.remote_stock ?? "—"} · {fmtDate(m.last_sync_at, locale)}
                </span>
                {m.last_error ? <span className="text-destructive">{m.last_error}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">{t("not_linked")}</p>
        )}
        {info?.preview ? (
          info.preview.error ? (
            <p className="text-destructive text-xs">{info.preview.error}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              {t("preview_line", { name: info.preview.name ?? "", price: info.preview.price ?? 0, stock: info.preview.stock ?? 0 })}
            </p>
          )
        ) : null}
        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <>
              <Button size="sm" disabled={action.isPending} onClick={() => action.mutate({ name: "create", extra: { now: true, ...(cats.length ? { category_ids: cats } : {}) } })}>
                {t("create_now")}
              </Button>
              <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ name: "create" })}>
                {t("create_queued")}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ name: "update", extra: { now: true } })}>
                {t("update_now")}
              </Button>
              <Button size="sm" variant="ghost" disabled={action.isPending} onClick={() => action.mutate({ name: "update", extra: { now: true, mode: "quick_update" } })}>
                {t("update_price_stock")}
              </Button>
              <Button size="sm" variant="ghost" disabled={action.isPending} onClick={() => action.mutate({ name: archived ? "restore" : "archive" })}>
                {archived ? t("restore") : t("archive")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={action.isPending}
                onClick={() => {
                  if (window.confirm(t("confirm_unlink"))) action.mutate({ name: "disconnect" })
                }}
              >
                {t("unlink")}
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setLinking(!linking)}>
            {t("link")}
          </Button>
        </div>
        {linking ? (
          <RemoteBasalamPicker
            initial={info?.preview?.name ?? ""}
            onPick={(r) => {
              action.mutate({ name: "connect", extra: { basalam_product_id: r.id, ...(variantId ? { variant_id: variantId } : {}) } })
              setLinking(false)
            }}
          />
        ) : null}
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("product_fields")}</Label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1">
            <Label className="text-xs">{t("unit_type")}</Label>
            <select className={selectClass} value={meta.unit_type ?? ""} onChange={(e) => set("unit_type", e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">{t("default_option")}</option>
              {BASALAM_UNIT_TYPES.map((u) => (
                <option key={u} value={u}>
                  {t(`unit.${u}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">{t("unit_quantity")}</Label>
            <Input type="number" min={1} dir="ltr" value={meta.unit_quantity ?? ""} onChange={(e) => set("unit_quantity", e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">{t("preparation_days")}</Label>
            <Input type="number" min={0} max={60} dir="ltr" value={meta.preparation_days ?? ""} onChange={(e) => set("preparation_days", e.target.value === "" ? undefined : Number(e.target.value))} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">{t("price_change")}</Label>
            <Input dir="ltr" placeholder="+10% / -5000" value={meta.price_change ?? ""} onChange={(e) => set("price_change", e.target.value || undefined)} />
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label className="text-xs">{t("video_url")}</Label>
            <Input dir="ltr" value={meta.video_url ?? ""} onChange={(e) => set("video_url", e.target.value || undefined)} />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">{t("price_change_hint")}</p>

        {variants.length ? (
          <div className="space-y-1">
            <Label className="text-xs">{t("variant_price_change")}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {variants.map((v) => {
                const id = String(v.product_variant_id)
                return (
                  <div key={id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs">{v.variant_name || v.variant_sku || `#${id}`}</span>
                    <Input
                      className="w-32"
                      dir="ltr"
                      value={meta.variant_price_change?.[id] ?? ""}
                      onChange={(e) => set("variant_price_change", { ...(meta.variant_price_change ?? {}), [id]: e.target.value })}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="grid gap-1">
          <Label className="text-xs">{t("product_categories")}</Label>
          <BasalamCategoryPicker
            value={[cats[0] ?? null, cats[1] ?? null, cats[2] ?? null]}
            onChange={(ids) => set("category_ids", ids.filter((v): v is number => Boolean(v)))}
          />
          <p className="text-muted-foreground text-xs">{t("product_categories_hint")}</p>
        </div>

        <div className="flex flex-wrap gap-4 text-xs">
          <label className="flex items-center gap-2">
            <Checkbox checked={Boolean(meta.is_wholesale)} onCheckedChange={(v) => set("is_wholesale", Boolean(v))} />
            {t("is_wholesale")}
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={Boolean(meta.is_mobile)} onCheckedChange={(v) => set("is_mobile", Boolean(v))} />
            {t("is_mobile")}
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={Boolean(meta.is_gold)} onCheckedChange={(v) => set("is_gold", Boolean(v))} />
            {t("is_gold")}
          </label>
        </div>
        {meta.is_mobile ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {MOBILE_KEYS.map((k) => (
              <div key={k} className="grid gap-1">
                <Label className="text-xs">{t(`mobile.${k}`)}</Label>
                <Input value={meta.mobile?.[k] ?? ""} onChange={(e) => set("mobile", { ...(meta.mobile ?? {}), [k]: e.target.value })} />
              </div>
            ))}
          </div>
        ) : null}
        {meta.is_gold ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {GOLD_KEYS.map((k) => (
              <div key={k} className="grid gap-1">
                <Label className="text-xs">{t(`gold.${k}`)}</Label>
                <Input dir="ltr" value={meta.gold?.[k] ?? ""} onChange={(e) => set("gold", { ...(meta.gold ?? {}), [k]: e.target.value })} />
              </div>
            ))}
          </div>
        ) : null}
        <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
          {t("save_product_fields")}
        </Button>
      </div>
    </div>
  )
}
