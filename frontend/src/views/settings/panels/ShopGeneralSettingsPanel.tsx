"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { CurrencySettingsFields } from "@/components/CurrencySettingsFields"
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
import { getApiErrorMessage } from "@/lib/api-helpers"
import {
  DEFAULT_CURRENCY_SYMBOL,
  DEFAULT_STORE_CURRENCY,
  normalizeCurrencySymbol,
  normalizeStoreCurrency,
  type CurrencySymbolId,
  type StoreCurrencyCode,
} from "@/lib/currencies"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

type Tenant = {
  name: string
  store_display_name: string | null
  default_currency: string | null
  branding?: { currency_symbol?: string } | null
}

type CmsPage = { id: number; title: string; slug: string }

type StoreAddress = {
  address_1?: string
  address_2?: string
  city?: string
  country?: string
  state?: string
  postcode?: string
}

export type ShopGeneralPayload = {
  store_display_name?: string
  store_address?: StoreAddress
  selling_locations?: string
  specific_allowed_countries?: string[]
  ship_to_countries?: string
  specific_ship_to_countries?: string[]
  enable_coupons?: boolean
  enable_coupon_stacking?: boolean
  calc_taxes?: boolean
  currency?: string
  currency_position?: string
  thousand_separator?: string
  decimal_separator?: string
  price_decimals?: number
  shop_page_id?: number | null
  cart_redirect_after_add?: boolean
  weight_unit?: string
  dimension_unit?: string
  guest_checkout?: boolean
}

const COUNTRY_OPTIONS = ["IR", "AF", "AE", "TR", "IQ", "SA", "US", "GB", "DE", "FR"]

function countriesToText(list?: string[]): string {
  return (list ?? []).join(", ")
}

function textToCountries(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
}

export function ShopGeneralSettingsPanel() {
  const t = useTranslations("settings_hub")
  const tSetup = useTranslations("setup")
  const { loading, draft, setDraft, persist, pending, saved, error } =
    useDraftSettings<ShopGeneralPayload>("shop", "general")

  const [tenantName, setTenantName] = useState("")
  const [currency, setCurrency] = useState<StoreCurrencyCode>(DEFAULT_STORE_CURRENCY)
  const [currencySymbol, setCurrencySymbol] =
    useState<CurrencySymbolId>(DEFAULT_CURRENCY_SYMBOL)
  const [pages, setPages] = useState<CmsPage[]>([])
  const [storeMsg, setStoreMsg] = useState<string | null>(null)
  const [storeErr, setStoreErr] = useState<string | null>(null)
  const [storePending, setStorePending] = useState(false)

  useEffect(() => {
    api<Tenant>("/api/v1/tenant")
      .then((r) => {
        setTenantName(r.name ?? "")
        const code = normalizeStoreCurrency(r.default_currency)
        setCurrency(code)
        setCurrencySymbol(normalizeCurrencySymbol(code, r.branding?.currency_symbol))
      })
      .catch(() => undefined)
    api<CmsPage[]>("/api/v1/cms/pages")
      .then((list) => setPages(Array.isArray(list) ? list : []))
      .catch(() => setPages([]))
  }, [])

  useEffect(() => {
    if (!draft) return
    if (draft.currency) {
      setCurrency(normalizeStoreCurrency(draft.currency))
    }
  }, [draft?.currency])

  function patchAddress(patch: Partial<StoreAddress>) {
    if (!draft) return
    setDraft({
      ...draft,
      store_address: { ...(draft.store_address ?? {}), ...patch },
    })
  }

  async function saveAll() {
    if (!draft) return
    setStoreMsg(null)
    setStoreErr(null)
    setStorePending(true)
    try {
      const next = { ...draft, currency }
      setDraft(next)
      await api("/api/v1/setup/store", {
        method: "PATCH",
        json: {
          tenant_name: tenantName || null,
          store_display_name: next.store_display_name || null,
          default_currency: currency,
          currency_symbol: currencySymbol,
        },
      })
      await persist()
      setStoreMsg(t("saved"))
    } catch (e) {
      setStoreErr(getApiErrorMessage(e as Error))
    } finally {
      setStorePending(false)
    }
  }

  if (loading || !draft) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>
  }

  const addr = draft.store_address ?? {}

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("shop_general.identity")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid max-w-md gap-2">
            <Label>{tSetup("tenant_name")}</Label>
            <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{tSetup("store_display_name")}</Label>
            <Input
              value={draft.store_display_name ?? ""}
              onChange={(e) => setDraft({ ...draft, store_display_name: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("shop_general.address")}</CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-xl gap-3">
          <div className="grid gap-2">
            <Label>{t("shop_general.address_1")}</Label>
            <Input
              value={addr.address_1 ?? ""}
              onChange={(e) => patchAddress({ address_1: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("shop_general.address_2")}</Label>
            <Input
              value={addr.address_2 ?? ""}
              onChange={(e) => patchAddress({ address_2: e.target.value })}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("shop_general.city")}</Label>
              <Input
                value={addr.city ?? ""}
                onChange={(e) => patchAddress({ city: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("shop_general.postcode")}</Label>
              <Input
                value={addr.postcode ?? ""}
                onChange={(e) => patchAddress({ postcode: e.target.value })}
                dir="ltr"
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("shop_general.country")}</Label>
              <Select
                value={addr.country ?? "IR"}
                onValueChange={(v) => patchAddress({ country: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("shop_general.state")}</Label>
              <Input
                value={addr.state ?? ""}
                onChange={(e) => patchAddress({ state: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("shop_general.commerce")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid max-w-md gap-2">
            <Label>{t("shop_general.selling_locations")}</Label>
            <Select
              value={draft.selling_locations ?? "specific"}
              onValueChange={(v) => setDraft({ ...draft, selling_locations: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("shop_general.sell_all")}</SelectItem>
                <SelectItem value="specific">{t("shop_general.sell_specific")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(draft.selling_locations ?? "specific") === "specific" ? (
            <div className="grid max-w-md gap-2">
              <Label>{t("shop_general.allowed_countries")}</Label>
              <Input
                dir="ltr"
                value={countriesToText(draft.specific_allowed_countries)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    specific_allowed_countries: textToCountries(e.target.value),
                  })
                }
                placeholder="IR, AE"
              />
            </div>
          ) : null}
          <div className="grid max-w-md gap-2">
            <Label>{t("shop_general.ship_to")}</Label>
            <Select
              value={draft.ship_to_countries ?? "specific"}
              onValueChange={(v) => setDraft({ ...draft, ship_to_countries: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="specific">{t("shop_general.ship_specific")}</SelectItem>
                <SelectItem value="all">{t("shop_general.ship_all")}</SelectItem>
                <SelectItem value="disabled">{t("shop_general.ship_disabled")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(draft.ship_to_countries ?? "specific") === "specific" ? (
            <div className="grid max-w-md gap-2">
              <Label>{t("shop_general.ship_countries")}</Label>
              <Input
                dir="ltr"
                value={countriesToText(draft.specific_ship_to_countries)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    specific_ship_to_countries: textToCountries(e.target.value),
                  })
                }
                placeholder="IR"
              />
            </div>
          ) : null}
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shop_general.coupons")}</Label>
            <Switch
              checked={Boolean(draft.enable_coupons)}
              onCheckedChange={(v) => setDraft({ ...draft, enable_coupons: v })}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shop_general.coupon_stacking")}</Label>
            <Switch
              checked={Boolean(draft.enable_coupon_stacking)}
              onCheckedChange={(v) => setDraft({ ...draft, enable_coupon_stacking: v })}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shop_general.calc_taxes")}</Label>
            <Switch
              checked={Boolean(draft.calc_taxes)}
              onCheckedChange={(v) => setDraft({ ...draft, calc_taxes: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("shop_general.currency_card")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CurrencySettingsFields
            currency={currency}
            symbol={currencySymbol}
            onCurrencyChange={(c) => {
              setCurrency(c)
              setDraft({ ...draft, currency: c })
            }}
            onSymbolChange={setCurrencySymbol}
            currencyLabel={tSetup("default_currency")}
            symbolLabel={tSetup("currency_symbol")}
          />
          <div className="grid max-w-md gap-2">
            <Label>{t("shop_general.currency_position")}</Label>
            <Select
              value={draft.currency_position ?? "left"}
              onValueChange={(v) => setDraft({ ...draft, currency_position: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">{t("shop_general.pos_left")}</SelectItem>
                <SelectItem value="right">{t("shop_general.pos_right")}</SelectItem>
                <SelectItem value="left_space">{t("shop_general.pos_left_space")}</SelectItem>
                <SelectItem value="right_space">{t("shop_general.pos_right_space")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid max-w-md gap-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>{t("shop_general.thousand_sep")}</Label>
              <Input
                dir="ltr"
                value={draft.thousand_separator ?? ","}
                onChange={(e) => setDraft({ ...draft, thousand_separator: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("shop_general.decimal_sep")}</Label>
              <Input
                dir="ltr"
                value={draft.decimal_separator ?? "."}
                onChange={(e) => setDraft({ ...draft, decimal_separator: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("shop_general.decimals")}</Label>
              <Input
                type="number"
                min={0}
                max={6}
                value={Number(draft.price_decimals ?? 0)}
                onChange={(e) => setDraft({ ...draft, price_decimals: Number(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("shop_general.pages_units")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid max-w-md gap-2">
            <Label>{t("shop_general.shop_page")}</Label>
            <Select
              value={draft.shop_page_id != null ? String(draft.shop_page_id) : "none"}
              onValueChange={(v) =>
                setDraft({ ...draft, shop_page_id: v === "none" ? null : Number(v) })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("shop_general.page_none")}</SelectItem>
                {pages.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shop_general.cart_redirect")}</Label>
            <Switch
              checked={Boolean(draft.cart_redirect_after_add)}
              onCheckedChange={(v) => setDraft({ ...draft, cart_redirect_after_add: v })}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <div>
              <Label htmlFor="guest-checkout">{t("shop_general.guest_checkout")}</Label>
              <p className="text-muted-foreground text-xs">{t("shop_general.guest_checkout_hint")}</p>
            </div>
            <Switch
              id="guest-checkout"
              checked={Boolean(draft.guest_checkout)}
              onCheckedChange={(v) => setDraft({ ...draft, guest_checkout: v })}
            />
          </div>
          <div className="grid max-w-md gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("shop_general.weight_unit")}</Label>
              <Select
                value={draft.weight_unit ?? "kg"}
                onValueChange={(v) => setDraft({ ...draft, weight_unit: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="g">g</SelectItem>
                  <SelectItem value="lbs">lbs</SelectItem>
                  <SelectItem value="oz">oz</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("shop_general.dimension_unit")}</Label>
              <Select
                value={draft.dimension_unit ?? "cm"}
                onValueChange={(v) => setDraft({ ...draft, dimension_unit: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cm">cm</SelectItem>
                  <SelectItem value="m">m</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void saveAll()} disabled={storePending || pending}>
          {storePending || pending ? "…" : t("save_all")}
        </Button>
        {storeMsg || saved ? (
          <p className="text-sm text-green-600 dark:text-green-400">{storeMsg ?? t("saved")}</p>
        ) : null}
        {storeErr || error ? (
          <p className="text-sm text-destructive">{storeErr ?? error}</p>
        ) : null}
      </div>
      <SettingsSaveBar
        onSave={() => void persist()}
        pending={pending}
        saved={saved}
        error={error}
      />
    </div>
  )
}
