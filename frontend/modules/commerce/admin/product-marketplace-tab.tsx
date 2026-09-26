"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { marketplaceLabel, type MarketplaceKind, type MarketplaceRemoteProduct } from "@/lib/marketplace"
import { ProductPlatformExtras } from "@/views/settings/panels/marketplace/ProductPlatformExtras"

export type ProductMapRow = {
  id: number | null
  platform: string
  product_variant_id: number | null
  remote_product_id: string | null
  remote_variant_id: string | null
  remote_url: string | null
  sync_enabled: boolean
  last_sync_at: string | null
  last_error: string | null
  remote_price: number | null
  remote_stock: number | null
  meta: Record<string, unknown> | null
  variant_name?: string | null
  variant_sku?: string | null
}

export type ProductPlatformRow = ProductMapRow & {
  kind: MarketplaceKind
  can_create: boolean
  enabled: boolean
  variants: ProductMapRow[]
}

type Preview = {
  currency: string
  stock: number
  platforms: Record<string, { store_price: number; remote_price: number; unit: "rial" | "toman"; locked: boolean }>
}

type SyncResult = { synced: number; results: { platform: string; product_variant_id: number | null; ok: boolean; price?: number; stock?: number; error?: string }[] }

type PriceDraft = Record<string, { lock: boolean; price: string }>

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export function ProductMarketplaceTab({ productId }: { productId: string }) {
  const t = useTranslations("marketplace_admin")
  const locale = useLocale()
  const qc = useQueryClient()
  const [variantId, setVariantId] = useState<number | null>(null)
  const [rows, setRows] = useState<ProductPlatformRow[]>([])
  const [prices, setPrices] = useState<PriceDraft>({})
  const [searchFor, setSearchFor] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<SyncResult | null>(null)
  const nf = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString(locale === "en" ? "en-US" : "fa-IR"))

  const mapsQ = useQuery({
    queryKey: ["product-marketplace-maps", productId],
    queryFn: () => api<ProductPlatformRow[]>(`/api/v1/marketplace/products/${productId}/maps`),
  })
  useEffect(() => {
    if (mapsQ.data) setRows(structuredClone(mapsQ.data))
  }, [mapsQ.data])

  const previewQ = useQuery({
    queryKey: ["product-marketplace-preview", productId, variantId],
    queryFn: () => api<Preview>(`/api/v1/marketplace/pricing/preview/${productId}${variantId ? `?variant_id=${variantId}` : ""}`),
  })

  const variants = useMemo(() => rows[0]?.variants ?? [], [rows])
  const visible = rows.filter((r) => r.enabled || r.id || r.variants.some((v) => v.id))

  const current = (row: ProductPlatformRow): ProductMapRow =>
    variantId ? (row.variants.find((v) => v.product_variant_id === variantId) ?? { ...row, id: null, product_variant_id: variantId }) : row

  const patchRow = (platform: string, patch: Partial<ProductMapRow>) =>
    setRows((list) =>
      list.map((r) => {
        if (r.platform !== platform) return r
        if (!variantId) return { ...r, ...patch }
        return { ...r, variants: r.variants.map((v) => (v.product_variant_id === variantId ? { ...v, ...patch } : v)) }
      }),
    )

  const saveMaps = useMutation({
    mutationFn: () => {
      const maps = rows.flatMap((r) =>
        [r, ...r.variants].map((m) => ({
          platform: r.platform,
          product_variant_id: m.product_variant_id,
          remote_product_id: m.remote_product_id || null,
          remote_variant_id: m.remote_variant_id || null,
          remote_url: m.remote_url || null,
          sync_enabled: Boolean(m.sync_enabled),
          ...(m.meta ? { meta: m.meta } : {}),
        })),
      )
      return api<ProductPlatformRow[]>(`/api/v1/marketplace/products/${productId}/maps`, { method: "POST", json: { maps } })
    },
    onSuccess: (data) => {
      qc.setQueryData(["product-marketplace-maps", productId], data)
      toast.success(t("maps_saved"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const syncNow = useMutation({
    mutationFn: () => api<SyncResult>(`/api/v1/marketplace/products/${productId}/sync-now`, { method: "POST" }),
    onSuccess: (res) => {
      setLastSync(res)
      toast.success(t("synced_count", { count: res.synced }))
      void qc.invalidateQueries({ queryKey: ["product-marketplace-maps", productId] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const createRemote = useMutation({
    mutationFn: (platform: string) =>
      api<ProductPlatformRow[]>(`/api/v1/marketplace/products/${productId}/create-remote`, {
        method: "POST",
        json: { platform, product_variant_id: variantId },
      }),
    onSuccess: (data) => {
      qc.setQueryData(["product-marketplace-maps", productId], data)
      toast.success(t("remote_created"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  useEffect(() => {
    const p = previewQ.data?.platforms
    if (!p) return
    const next: PriceDraft = {}
    for (const [slug, row] of Object.entries(p)) next[slug] = { lock: row.locked, price: row.locked ? String(row.store_price) : "" }
    setPrices(next)
  }, [previewQ.data])

  const savePrices = useMutation({
    mutationFn: () =>
      api<Preview>(`/api/v1/marketplace/products/${productId}/platform-prices`, {
        method: "PUT",
        json: {
          product_variant_id: variantId,
          prices: Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, { lock: v.lock, price: v.price === "" ? null : Number(v.price) }])),
        },
      }),
    onSuccess: (data) => {
      qc.setQueryData(["product-marketplace-preview", productId, variantId], data)
      toast.success(t("prices_saved"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (mapsQ.isLoading) return <p className="text-muted-foreground text-sm">{t("loading")}</p>
  if (mapsQ.error) return <p className="text-destructive text-sm">{getApiErrorMessage(mapsQ.error)}</p>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{t("product_tab.title")}</CardTitle>
            <CardDescription>{t("product_tab.hint")}</CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={syncNow.isPending} onClick={() => syncNow.mutate()}>
            {t("product_tab.sync_now")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {variants.length > 0 ? (
            <div className="grid max-w-sm gap-2">
              <Label>{t("product_tab.variant")}</Label>
              <select className={selectClass} value={variantId ?? ""} onChange={(e) => setVariantId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{t("product_tab.product_level")}</option>
                {variants.map((v) => (
                  <option key={v.product_variant_id ?? 0} value={v.product_variant_id ?? ""}>
                    {v.variant_name || v.variant_sku || `#${v.product_variant_id}`}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {lastSync?.results.length ? (
            <ul className="space-y-1 text-xs">
              {lastSync.results.map((r, i) => (
                <li key={i} className={r.ok ? "text-green-600" : "text-destructive"}>
                  {marketplaceLabel(r.platform, locale)}
                  {r.product_variant_id ? ` (#${r.product_variant_id})` : ""}: {r.ok ? `${nf(r.price)} / ${nf(r.stock)}` : r.error}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {visible.length === 0 ? <p className="text-muted-foreground text-sm">{t("product_tab.no_platforms")}</p> : null}

      {visible
        .filter((r) => r.kind === "api")
        .map((r) => {
          const m = current(r)
          return (
            <Card key={r.platform}>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{marketplaceLabel(r.platform, locale)}</CardTitle>
                  {!r.enabled ? <Badge variant="outline">{t("disabled")}</Badge> : null}
                  {m.id ? <Badge variant="secondary">{t("product_tab.mapped")}</Badge> : null}
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={Boolean(m.sync_enabled)} onCheckedChange={(v) => patchRow(r.platform, { sync_enabled: Boolean(v) })} />
                  {t("product_tab.sync_enabled")}
                </label>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="grid gap-1">
                    <Label className="text-xs">{t("remote_id")}</Label>
                    <Input dir="ltr" value={m.remote_product_id ?? ""} onChange={(e) => patchRow(r.platform, { remote_product_id: e.target.value })} />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">{t("remote_variant_id")}</Label>
                    <Input dir="ltr" value={m.remote_variant_id ?? ""} onChange={(e) => patchRow(r.platform, { remote_variant_id: e.target.value })} />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">{t("remote_url")}</Label>
                    <Input dir="ltr" value={m.remote_url ?? ""} onChange={(e) => patchRow(r.platform, { remote_url: e.target.value })} />
                  </div>
                </div>
                <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
                  <span>
                    {t("remote_price")}: {nf(m.remote_price)}
                  </span>
                  <span>
                    {t("remote_stock")}: {nf(m.remote_stock)}
                  </span>
                  {m.last_sync_at ? (
                    <span>
                      {t("last_sync")}: {new Date(m.last_sync_at).toLocaleString(locale === "en" ? "en-US" : "fa-IR")}
                    </span>
                  ) : null}
                </div>
                {m.last_error ? <p className="text-destructive text-xs">{m.last_error}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSearchFor(searchFor === r.platform ? null : r.platform)}>
                    {t("product_tab.find_remote")}
                  </Button>
                  {r.can_create && !m.remote_product_id ? (
                    <Button size="sm" variant="secondary" disabled={createRemote.isPending} onClick={() => createRemote.mutate(r.platform)}>
                      {t("product_tab.create_remote")}
                    </Button>
                  ) : null}
                </div>
                {searchFor === r.platform ? (
                  <RemotePicker
                    platform={r.platform}
                    onPick={(p) => {
                      patchRow(r.platform, { remote_product_id: p.id, remote_variant_id: p.variant_id ?? null, sync_enabled: true })
                      setSearchFor(null)
                    }}
                  />
                ) : null}
                <ProductPlatformExtras
                  platform={r.platform}
                  productId={productId}
                  variantId={variantId}
                  map={m}
                  onMetaChange={(meta) => patchRow(r.platform, { meta })}
                />
              </CardContent>
            </Card>
          )
        })}

      {rows.length > 0 ? (
        <Button disabled={saveMaps.isPending} onClick={() => saveMaps.mutate()}>
          {t("product_tab.save_maps")}
        </Button>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("product_tab.prices")}</CardTitle>
          <CardDescription>{t("product_tab.prices_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {previewQ.data ? (
            <>
              <p className="text-muted-foreground text-xs">
                {t("product_tab.stock_sent")}: {nf(previewQ.data.stock)}
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("pricing.platform")}</TableHead>
                      <TableHead>{t("product_tab.store_price")}</TableHead>
                      <TableHead>{t("product_tab.remote_price")}</TableHead>
                      <TableHead>{t("product_tab.lock")}</TableHead>
                      <TableHead>{t("product_tab.manual_price")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(previewQ.data.platforms).map(([slug, p]) => (
                      <TableRow key={slug}>
                        <TableCell className="whitespace-nowrap">{marketplaceLabel(slug, locale)}</TableCell>
                        <TableCell>{nf(p.store_price)}</TableCell>
                        <TableCell>
                          {nf(p.remote_price)} <span className="text-muted-foreground text-xs">{t(`pricing.${p.unit}`)}</span>
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={Boolean(prices[slug]?.lock)}
                            onCheckedChange={(v) => setPrices((d) => ({ ...d, [slug]: { lock: Boolean(v), price: d[slug]?.price ?? "" } }))}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="w-32"
                            type="number"
                            dir="ltr"
                            disabled={!prices[slug]?.lock}
                            value={prices[slug]?.price ?? ""}
                            onChange={(e) => setPrices((d) => ({ ...d, [slug]: { lock: d[slug]?.lock ?? true, price: e.target.value } }))}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-muted-foreground text-xs">{t("product_tab.manual_hint", { currency: previewQ.data.currency })}</p>
              <Button variant="outline" disabled={savePrices.isPending} onClick={() => savePrices.mutate()}>
                {t("product_tab.save_prices")}
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{t("loading")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RemotePicker({ platform, onPick }: { platform: string; onPick: (p: MarketplaceRemoteProduct) => void }) {
  const t = useTranslations("marketplace_admin")
  const [kw, setKw] = useState("")
  const search = useMutation({
    mutationFn: () => api<MarketplaceRemoteProduct[]>(`/api/v1/marketplace/${platform}/search?q=${encodeURIComponent(kw)}`),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  return (
    <div className="space-y-2 rounded-md border p-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          search.mutate()
        }}
      >
        <Input value={kw} onChange={(e) => setKw(e.target.value)} placeholder={t("keyword")} />
        <Button type="submit" size="sm" variant="outline" disabled={search.isPending}>
          {t("search")}
        </Button>
      </form>
      {search.data?.length ? (
        <ul className="max-h-60 space-y-1 overflow-auto text-sm">
          {search.data.map((p) => (
            <li key={`${p.id}-${p.variant_id ?? ""}`} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted">
              <span className="min-w-0 truncate">
                {p.title} <code className="text-muted-foreground text-xs" dir="ltr">{p.id}{p.variant_id && p.variant_id !== p.id ? ` / ${p.variant_id}` : ""}</code>
              </span>
              <Button size="sm" variant="ghost" onClick={() => onPick(p)}>
                {t("pick")}
              </Button>
            </li>
          ))}
        </ul>
      ) : search.isSuccess ? (
        <p className="text-muted-foreground text-xs">{t("no_results")}</p>
      ) : null}
    </div>
  )
}
