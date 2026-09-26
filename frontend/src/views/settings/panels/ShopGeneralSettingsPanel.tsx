"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { CurrencySettingsFields } from "@/components/CurrencySettingsFields"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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

type GeneralPayload = {
  store_display_name?: string
  sold_individually_default?: boolean
  enable_coupons?: boolean
  calc_taxes?: boolean
}

export function ShopGeneralSettingsPanel() {
  const t = useTranslations("settings_hub")
  const tSetup = useTranslations("setup")
  const { loading, draft, setDraft, persist, pending, saved, error } =
    useDraftSettings<GeneralPayload>("shop", "general")

  const [tenantName, setTenantName] = useState("")
  const [currency, setCurrency] = useState<StoreCurrencyCode>(DEFAULT_STORE_CURRENCY)
  const [currencySymbol, setCurrencySymbol] =
    useState<CurrencySymbolId>(DEFAULT_CURRENCY_SYMBOL)
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
        if (draft && !draft.store_display_name && r.store_display_name) {
          setDraft({ ...draft, store_display_name: r.store_display_name })
        }
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveIdentity() {
    setStoreMsg(null)
    setStoreErr(null)
    setStorePending(true)
    try {
      await api("/api/v1/setup/store", {
        method: "PATCH",
        json: {
          tenant_name: tenantName || null,
          store_display_name: draft?.store_display_name || null,
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
          <CurrencySettingsFields
            currency={currency}
            symbol={currencySymbol}
            onCurrencyChange={setCurrency}
            onSymbolChange={setCurrencySymbol}
            currencyLabel={tSetup("default_currency")}
            symbolLabel={tSetup("currency_symbol")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("shop_general.commerce")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shop_general.coupons")}</Label>
            <Switch
              checked={Boolean(draft.enable_coupons)}
              onCheckedChange={(v) => setDraft({ ...draft, enable_coupons: v })}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shop_general.calc_taxes")}</Label>
            <Switch
              checked={Boolean(draft.calc_taxes)}
              onCheckedChange={(v) => setDraft({ ...draft, calc_taxes: v })}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shop_general.sold_individually")}</Label>
            <Switch
              checked={Boolean(draft.sold_individually_default)}
              onCheckedChange={(v) => setDraft({ ...draft, sold_individually_default: v })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void saveIdentity()} disabled={storePending || pending}>
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
