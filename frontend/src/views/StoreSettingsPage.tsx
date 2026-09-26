"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { CurrencySettingsFields } from "@/components/CurrencySettingsFields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import {
  DEFAULT_CURRENCY_SYMBOL,
  DEFAULT_STORE_CURRENCY,
  normalizeCurrencySymbol,
  normalizeStoreCurrency,
  type CurrencySymbolId,
  type StoreCurrencyCode,
} from "@/lib/currencies"

type Tenant = {
  id: number
  name: string
  slug: string
  domain: string | null
  license_key: string | null
  store_display_name: string | null
  default_currency: string | null
  branding?: { currency_symbol?: string } | null
}

export default function StoreSettingsPage() {
  const t = useTranslations("store_settings")
  const tCommon = useTranslations("common")
  const tSetup = useTranslations("setup")
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [storeName, setStoreName] = useState("")
  const [currency, setCurrency] = useState<StoreCurrencyCode>(DEFAULT_STORE_CURRENCY)
  const [currencySymbol, setCurrencySymbol] = useState<CurrencySymbolId>(DEFAULT_CURRENCY_SYMBOL)
  const [tenantName, setTenantName] = useState("")
  const [msg, setMsg] = useState<string | null>(null)

  function load() {
    api<Tenant>("/api/v1/tenant")
      .then((r) => {
        setTenant(r)
        setStoreName(r.store_display_name ?? "")
        const code = normalizeStoreCurrency(r.default_currency)
        setCurrency(code)
        setCurrencySymbol(
          normalizeCurrencySymbol(code, r.branding?.currency_symbol)
        )
        setTenantName(r.name ?? "")
      })
      .catch(() => setTenant(null))
  }

  useEffect(() => {
    load()
  }, [])

  async function save() {
    setMsg(null)
    await api("/api/v1/setup/store", {
      method: "PATCH",
      json: {
        store_display_name: storeName || null,
        default_currency: currency || DEFAULT_STORE_CURRENCY,
        currency_symbol: currencySymbol || DEFAULT_CURRENCY_SYMBOL,
        tenant_name: tenantName || null,
      },
    })
    setMsg(t("saved"))
    load()
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </div>
      {msg ? <p className="text-sm text-green-600 dark:text-green-400">{msg}</p> : null}
      <div className="grid gap-2">
        <Label>{tSetup("tenant_name")}</Label>
        <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>{tSetup("store_display_name")}</Label>
        <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} />
      </div>
      <CurrencySettingsFields
        currency={currency}
        symbol={currencySymbol}
        onCurrencyChange={setCurrency}
        onSymbolChange={setCurrencySymbol}
        currencyLabel={tSetup("default_currency")}
        symbolLabel={tSetup("currency_symbol")}
      />
      {tenant ? (
        <p className="text-muted-foreground text-xs font-mono" dir="ltr">
          slug: {tenant.slug} · domain: {tenant.domain ?? "—"}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" onClick={() => void save()}>
          {tCommon("save")}
        </Button>
        <Button type="button" variant="outline" onClick={() => load()}>
          {t("load_tenant")}
        </Button>
      </div>
    </div>
  )
}
