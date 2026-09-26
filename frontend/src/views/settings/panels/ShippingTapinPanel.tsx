"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type TapinSettings = {
  enabled: boolean
  has_token?: boolean
  connected?: boolean
  shop_id: string
  shop_title: string
  gateway: string
  show_credit: boolean
  use_pws_formula: boolean
  content_type: number
  tipax_pickup_type: number
  tipax_delivery_type: number
  origin_province_code: number
  origin_city_code: number
  auto_register: boolean
  auto_register_status: string
  register_type: number
  default_pay_type: number
  default_order_type: number
  has_insurance: boolean
  employee_code: number
  methods: Record<string, boolean>
  courier_base_price: number
  courier_per_kg: number
  free_shipping_min: number
  rate_extra_percent: number
  rate_extra_fixed: number
  default_box_id: number
  default_kiosk_id: number
  notify_customer_link: boolean
  locations?: { provinces?: { code: number; title: string; cities: { code: number; title: string }[] }[] }
}

type TapinPayload = { settings: TapinSettings; credit: number | null }

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

const METHOD_KEYS = ["pishtaz", "vip", "tipax", "courier", "tipax_api", "alonomic"] as const

export function ShippingTapinPanel() {
  const t = useTranslations("settings_hub")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [draft, setDraft] = useState<TapinSettings | null>(null)
  const [token, setToken] = useState("")
  const [shops, setShops] = useState<{ id: string; title: string }[]>([])

  const q = useQuery({
    queryKey: ["shipping-tapin"],
    queryFn: () => api<TapinPayload>("/api/v1/shipping/tapin"),
  })

  useEffect(() => {
    if (q.data?.settings) setDraft({ ...q.data.settings })
  }, [q.data])

  const save = useMutation({
    mutationFn: (settings: TapinSettings & { token?: string }) =>
      api<TapinPayload>("/api/v1/shipping/tapin", { method: "POST", json: { settings } }),
    onSuccess: async (data) => {
      qc.setQueryData(["shipping-tapin"], data)
      setDraft(data.settings)
      setToken("")
      toast.success(tCommon("saved"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const test = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; message: string; shops: { id: string; title: string }[] }>(
        "/api/v1/shipping/tapin/test",
        { method: "POST" },
      ),
    onSuccess: (res) => {
      setShops(res.shops ?? [])
      if (res.ok) toast.success(t("shipping.tapin_test_ok"))
      else toast.error(res.message || t("shipping.tapin_test_fail"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const syncLoc = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; count: number; message: string }>("/api/v1/shipping/tapin/sync-locations", {
        method: "POST",
      }),
    onSuccess: async (res) => {
      if (res.ok) {
        toast.success(`${t("shipping.tapin_sync_ok")} (${res.count})`)
        await qc.invalidateQueries({ queryKey: ["shipping-tapin"] })
      } else toast.error(res.message)
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (q.isLoading || !draft) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>
  }

  const provinces = draft.locations?.provinces ?? []
  const cities =
    provinces.find((p) => p.code === Number(draft.origin_province_code))?.cities ?? []

  function patch<K extends keyof TapinSettings>(key: K, value: TapinSettings[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("shipping.tapin")}</CardTitle>
          <CardDescription>{t("shipping.tapin_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shipping.tapin_enabled")}</Label>
            <Switch checked={Boolean(draft.enabled)} onCheckedChange={(v) => patch("enabled", v)} />
          </div>

          <div className="grid max-w-lg gap-2">
            <Label>{t("shipping.tapin_token")}</Label>
            <Input
              type="password"
              placeholder={draft.has_token ? "••••••••" : ""}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">{t("shipping.tapin_token_hint")}</p>
          </div>

          <div className="grid max-w-lg gap-2">
            <Label>{t("shipping.tapin_gateway")}</Label>
            <select
              className={selectClass}
              value={draft.gateway || "tapin"}
              onChange={(e) => patch("gateway", e.target.value)}
            >
              <option value="tapin">tapin.ir</option>
              <option value="posteketab">posteketab.com</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={test.isPending}
              onClick={() => {
                const payload = { ...draft, ...(token ? { token } : {}) }
                save.mutate(payload as TapinSettings & { token?: string }, {
                  onSuccess: () => test.mutate(),
                })
              }}
            >
              {t("shipping.tapin_test")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={syncLoc.isPending}
              onClick={() => syncLoc.mutate()}
            >
              {t("shipping.tapin_sync")}
            </Button>
          </div>

          {(shops.length > 0 || draft.shop_id) && (
            <div className="grid max-w-lg gap-2">
              <Label>{t("shipping.tapin_shop")}</Label>
              {shops.length > 0 ? (
                <select
                  className={selectClass}
                  value={draft.shop_id}
                  onChange={(e) => {
                    const shop = shops.find((s) => s.id === e.target.value)
                    setDraft((d) =>
                      d
                        ? {
                            ...d,
                            shop_id: e.target.value,
                            shop_title: shop?.title || d.shop_title,
                          }
                        : d,
                    )
                  }}
                >
                  <option value="">{t("shipping.tapin_shop_pick")}</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title || s.id}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={draft.shop_id}
                  onChange={(e) => patch("shop_id", e.target.value)}
                  placeholder="shop_id"
                />
              )}
            </div>
          )}

          {q.data?.credit != null ? (
            <p className="text-sm">
              {t("shipping.tapin_credit")}:{" "}
              <span className="font-medium">{Number(q.data.credit).toLocaleString()}</span>
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>{t("shipping.tapin_origin_province")}</Label>
              <select
                className={selectClass}
                value={draft.origin_province_code || 0}
                onChange={(e) => {
                  patch("origin_province_code", Number(e.target.value) || 0)
                  patch("origin_city_code", 0)
                }}
              >
                <option value={0}>—</option>
                {provinces.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label>{t("shipping.tapin_origin_city")}</Label>
              <select
                className={selectClass}
                value={draft.origin_city_code || 0}
                onChange={(e) => patch("origin_city_code", Number(e.target.value) || 0)}
              >
                <option value={0}>—</option>
                {cities.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("shipping.tapin_methods")}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {METHOD_KEYS.map((key) => (
                <div key={key} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <span className="text-sm">{t(`shipping.tapin_method_${key}`)}</span>
                  <Switch
                    checked={Boolean(draft.methods?.[key])}
                    onCheckedChange={(v) =>
                      setDraft((d) =>
                        d ? { ...d, methods: { ...d.methods, [key]: v } } : d,
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <NumField
              label={t("shipping.tapin_content_type")}
              value={draft.content_type}
              onChange={(v) => patch("content_type", v)}
            />
            <NumField
              label={t("shipping.tapin_box")}
              value={draft.default_box_id}
              onChange={(v) => patch("default_box_id", v)}
            />
            <NumField
              label={t("shipping.tapin_extra_pct")}
              value={draft.rate_extra_percent}
              onChange={(v) => patch("rate_extra_percent", v)}
            />
            <NumField
              label={t("shipping.tapin_extra_fixed")}
              value={draft.rate_extra_fixed}
              onChange={(v) => patch("rate_extra_fixed", v)}
            />
            <NumField
              label={t("shipping.tapin_courier_base")}
              value={draft.courier_base_price}
              onChange={(v) => patch("courier_base_price", v)}
            />
            <NumField
              label={t("shipping.tapin_courier_kg")}
              value={draft.courier_per_kg}
              onChange={(v) => patch("courier_per_kg", v)}
            />
            <NumField
              label={t("shipping.free_min")}
              value={draft.free_shipping_min}
              onChange={(v) => patch("free_shipping_min", v)}
            />
            <NumField
              label={t("shipping.tapin_pay_type")}
              value={draft.default_pay_type}
              onChange={(v) => patch("default_pay_type", v)}
            />
            <NumField
              label={t("shipping.tapin_order_type")}
              value={draft.default_order_type}
              onChange={(v) => patch("default_order_type", v)}
            />
            <NumField
              label={t("shipping.tapin_register_type")}
              value={draft.register_type}
              onChange={(v) => patch("register_type", v)}
            />
          </div>

          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shipping.tapin_insurance")}</Label>
            <Switch
              checked={Boolean(draft.has_insurance)}
              onCheckedChange={(v) => patch("has_insurance", v)}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shipping.tapin_auto_register")}</Label>
            <Switch
              checked={Boolean(draft.auto_register)}
              onCheckedChange={(v) => patch("auto_register", v)}
            />
          </div>
          {draft.auto_register ? (
            <div className="grid max-w-lg gap-2">
              <Label>{t("shipping.tapin_auto_status")}</Label>
              <select
                className={selectClass}
                value={draft.auto_register_status || "processing"}
                onChange={(e) => patch("auto_register_status", e.target.value)}
              >
                <option value="processing">processing</option>
                <option value="paid">paid</option>
                <option value="shipped">shipped</option>
                <option value="completed">completed</option>
              </select>
            </div>
          ) : null}
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shipping.tapin_show_credit")}</Label>
            <Switch
              checked={Boolean(draft.show_credit)}
              onCheckedChange={(v) => patch("show_credit", v)}
            />
          </div>

          <Button
            disabled={save.isPending}
            onClick={() => {
              const payload = { ...draft, ...(token ? { token } : {}) }
              save.mutate(payload as TapinSettings & { token?: string })
            }}
          >
            {tCommon("save")}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="grid gap-1">
      <Label>{label}</Label>
      <Input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  )
}
