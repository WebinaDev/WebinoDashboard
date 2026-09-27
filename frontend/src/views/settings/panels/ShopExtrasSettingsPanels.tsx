"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/lib/api"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

export function ShopDownloadsSettingsPanel() {
  const t = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } = useDraftSettings<{
    delivery_method?: string
    x_accel_prefix?: string
    require_login?: boolean
    count_downloads?: boolean
  }>("shop", "downloads")

  if (loading || !draft) return <p className="text-muted-foreground text-sm">{t("loading")}</p>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("shop_downloads.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid max-w-md gap-2">
            <Label>{t("shop_downloads.delivery")}</Label>
            <Select
              value={draft.delivery_method ?? "force"}
              onValueChange={(v) => setDraft({ ...draft, delivery_method: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="force">{t("shop_downloads.force")}</SelectItem>
                <SelectItem value="redirect">{t("shop_downloads.redirect")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("shop_downloads.x_accel")}</Label>
            <Input
              dir="ltr"
              value={draft.x_accel_prefix ?? ""}
              onChange={(e) => setDraft({ ...draft, x_accel_prefix: e.target.value })}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shop_downloads.require_login")}</Label>
            <Switch
              checked={Boolean(draft.require_login)}
              onCheckedChange={(v) => setDraft({ ...draft, require_login: v })}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shop_downloads.count")}</Label>
            <Switch
              checked={Boolean(draft.count_downloads)}
              onCheckedChange={(v) => setDraft({ ...draft, count_downloads: v })}
            />
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}

export function ShopReviewsSettingsPanel() {
  const t = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } = useDraftSettings<{
    enabled?: boolean
    verified_buyer_only?: boolean
    require_approval?: boolean
    show_average?: boolean
  }>("shop", "reviews")
  const [pendingReviews, setPendingReviews] = useState<
    { id: number; rating: number; body?: string; product?: { name: string } }[]
  >([])

  useEffect(() => {
    type PendingReview = { id: number; rating: number; body?: string; product?: { name: string } }
    api<PendingReview[] | { data: PendingReview[] }>("/api/v1/product-reviews?status=pending")
      .then((res) => setPendingReviews(Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : []))
      .catch(() => setPendingReviews([]))
  }, [saved])

  async function moderate(id: number, status: string) {
    await api(`/api/v1/product-reviews/${id}`, { method: "PATCH", json: { status } })
    setPendingReviews((prev) => prev.filter((r) => r.id !== id))
  }

  if (loading || !draft) return <p className="text-muted-foreground text-sm">{t("loading")}</p>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("shop_reviews.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(
            [
              ["enabled", "enabled"],
              ["verified_buyer_only", "verified"],
              ["require_approval", "approval"],
              ["show_average", "average"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex max-w-lg items-center justify-between gap-3">
              <Label>{t(`shop_reviews.${label}`)}</Label>
              <Switch
                checked={Boolean(draft[key])}
                onCheckedChange={(v) => setDraft({ ...draft, [key]: v })}
              />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("shop_reviews.moderation")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingReviews.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("shop_reviews.empty")}</p>
          ) : (
            pendingReviews.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <div>
                  <p className="text-sm font-medium">
                    {r.product?.name ?? `#${r.id}`} — {r.rating}/5
                  </p>
                  <p className="text-muted-foreground text-xs">{r.body}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void moderate(r.id, "approved")}>
                    {t("shop_reviews.approve")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void moderate(r.id, "rejected")}>
                    {t("shop_reviews.reject")}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}

export function ShopMapsSettingsPanel() {
  const t = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } = useDraftSettings<{
    billing_map_enabled?: boolean
    provider?: string
    api_key?: string
    service_api_key?: string
    map_type?: string
  }>("shop", "maps")

  if (loading || !draft) return <p className="text-muted-foreground text-sm">{t("loading")}</p>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("shop_maps.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{t("shop_maps.hint")}</p>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shop_maps.billing_enabled")}</Label>
            <Switch
              checked={Boolean(draft.billing_map_enabled)}
              onCheckedChange={(v) => setDraft({ ...draft, billing_map_enabled: v })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("shop_maps.provider")}</Label>
            <Select
              value={draft.provider ?? "neshan"}
              onValueChange={(v) => setDraft({ ...draft, provider: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="neshan">Neshan</SelectItem>
                <SelectItem value="mapbox">Mapbox</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("shop_maps.api_key")}</Label>
            <Input
              dir="ltr"
              type="password"
              value={draft.api_key ?? ""}
              onChange={(e) => setDraft({ ...draft, api_key: e.target.value })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("shop_maps.service_key")}</Label>
            <Input
              dir="ltr"
              type="password"
              value={draft.service_api_key ?? ""}
              onChange={(e) => setDraft({ ...draft, service_api_key: e.target.value })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("shop_maps.map_type")}</Label>
            <Select
              value={draft.map_type ?? "mapboxgl"}
              onValueChange={(v) => setDraft({ ...draft, map_type: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mapboxgl">mapboxgl</SelectItem>
                <SelectItem value="leaflet">leaflet</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}

type Reward = {
  id?: number
  uid?: string
  title: string
  points_cost: number
  discount_type: string
  discount_amount: number
  min_cart_minor?: number | null
  validity_days?: number | null
  is_active?: boolean
}

export function ShopLoyaltySettingsPanel() {
  const t = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } = useDraftSettings<{
    enabled?: boolean
    point_price_minor?: number
    max_points_per_product?: number
  }>("shop", "loyalty")
  const [rewards, setRewards] = useState<Reward[]>([])
  const [rewardsMsg, setRewardsMsg] = useState<string | null>(null)

  useEffect(() => {
    api<Reward[]>("/api/v1/loyalty/rewards")
      .then((rows) => setRewards(Array.isArray(rows) ? rows : []))
      .catch(() => setRewards([]))
  }, [])

  async function saveRewards() {
    setRewardsMsg(null)
    const rows = await api<Reward[]>("/api/v1/loyalty/rewards", {
      method: "PUT",
      json: { rewards },
    })
    setRewards(Array.isArray(rows) ? rows : [])
    setRewardsMsg(t("saved"))
  }

  if (loading || !draft) return <p className="text-muted-foreground text-sm">{t("loading")}</p>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("shop_loyalty.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shop_loyalty.enabled")}</Label>
            <Switch
              checked={Boolean(draft.enabled)}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            />
          </div>
          <div className="grid max-w-xs gap-2">
            <Label>{t("shop_loyalty.point_price")}</Label>
            <Input
              type="number"
              value={Number(draft.point_price_minor ?? 1000)}
              onChange={(e) => setDraft({ ...draft, point_price_minor: Number(e.target.value) })}
            />
          </div>
          <div className="grid max-w-xs gap-2">
            <Label>{t("shop_loyalty.max_points")}</Label>
            <Input
              type="number"
              value={Number(draft.max_points_per_product ?? 150)}
              onChange={(e) => setDraft({ ...draft, max_points_per_product: Number(e.target.value) })}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("shop_loyalty.rewards")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rewards.map((r, i) => (
            <div key={r.id ?? r.uid ?? i} className="space-y-2 rounded border p-3">
              <Input
                value={r.title}
                onChange={(e) => {
                  const next = [...rewards]
                  next[i] = { ...r, title: e.target.value }
                  setRewards(next)
                }}
                placeholder={t("shop_loyalty.reward_title")}
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  type="number"
                  value={r.points_cost}
                  onChange={(e) => {
                    const next = [...rewards]
                    next[i] = { ...r, points_cost: Number(e.target.value) }
                    setRewards(next)
                  }}
                />
                <Select
                  value={r.discount_type}
                  onValueChange={(v) => {
                    const next = [...rewards]
                    next[i] = { ...r, discount_type: v }
                    setRewards(next)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">{t("shop_loyalty.percent")}</SelectItem>
                    <SelectItem value="fixed">{t("shop_loyalty.fixed")}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={r.discount_amount}
                  onChange={(e) => {
                    const next = [...rewards]
                    next[i] = { ...r, discount_amount: Number(e.target.value) }
                    setRewards(next)
                  }}
                />
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setRewards(rewards.filter((_, j) => j !== i))}
              >
                {t("shop_loyalty.delete_reward")}
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setRewards([
                  ...rewards,
                  {
                    title: "",
                    points_cost: 100,
                    discount_type: "percent",
                    discount_amount: 10,
                    is_active: true,
                  },
                ])
              }
            >
              {t("shop_loyalty.add_reward")}
            </Button>
            <Button type="button" onClick={() => void saveRewards()}>
              {t("shop_loyalty.save_rewards")}
            </Button>
            {rewardsMsg ? <p className="text-sm text-green-600">{rewardsMsg}</p> : null}
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}

export function ShopArchiveSettingsPanel() {
  const t = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } = useDraftSettings<{
    sidebar_enabled?: boolean
    category_slider?: boolean
    category_slider_mode?: string
    filter_placement?: string
    filter_price?: boolean
    filter_in_stock?: boolean
    filter_on_sale?: boolean
    filter_color?: boolean
    filters_open_default?: boolean
    products_per_page?: number
    product_columns?: number
    default_sort?: string
  }>("shop", "archive")

  if (loading || !draft) return <p className="text-muted-foreground text-sm">{t("loading")}</p>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("shop_archive.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(
            [
              ["sidebar_enabled", "sidebar"],
              ["category_slider", "slider"],
              ["filter_price", "filter_price"],
              ["filter_in_stock", "filter_stock"],
              ["filter_on_sale", "filter_sale"],
              ["filter_color", "filter_color"],
              ["filters_open_default", "filters_open"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex max-w-lg items-center justify-between gap-3">
              <Label>{t(`shop_archive.${label}`)}</Label>
              <Switch
                checked={Boolean(draft[key])}
                onCheckedChange={(v) => setDraft({ ...draft, [key]: v })}
              />
            </div>
          ))}
          <div className="grid max-w-md gap-2">
            <Label>{t("shop_archive.slider_mode")}</Label>
            <Select
              value={draft.category_slider_mode ?? "image_title"}
              onValueChange={(v) => setDraft({ ...draft, category_slider_mode: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image_title">{t("shop_archive.mode_both")}</SelectItem>
                <SelectItem value="image">{t("shop_archive.mode_image")}</SelectItem>
                <SelectItem value="title">{t("shop_archive.mode_title")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("shop_archive.placement")}</Label>
            <Select
              value={draft.filter_placement ?? "sidebar"}
              onValueChange={(v) => setDraft({ ...draft, filter_placement: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sidebar">{t("shop_archive.place_sidebar")}</SelectItem>
                <SelectItem value="header">{t("shop_archive.place_header")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid max-w-md gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("shop_archive.per_page")}</Label>
              <Input
                type="number"
                value={Number(draft.products_per_page ?? 12)}
                onChange={(e) => setDraft({ ...draft, products_per_page: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("shop_archive.columns")}</Label>
              <Input
                type="number"
                value={Number(draft.product_columns ?? 3)}
                onChange={(e) => setDraft({ ...draft, product_columns: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("shop_archive.sort")}</Label>
            <Select
              value={draft.default_sort ?? "newest"}
              onValueChange={(v) => setDraft({ ...draft, default_sort: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{t("shop_archive.sort_newest")}</SelectItem>
                <SelectItem value="price_asc">{t("shop_archive.sort_price_asc")}</SelectItem>
                <SelectItem value="price_desc">{t("shop_archive.sort_price_desc")}</SelectItem>
                <SelectItem value="popular">{t("shop_archive.sort_popular")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
