"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"

type Tenant = {
  id: number
  name: string
  slug: string
  domain: string | null
  license_key: string | null
  store_display_name: string | null
  default_currency: string | null
}

export default function StoreSettingsPage() {
  const { t } = useTranslation(["store_settings", "common", "setup"])
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [storeName, setStoreName] = useState("")
  const [currency, setCurrency] = useState("IRR")
  const [tenantName, setTenantName] = useState("")
  const [msg, setMsg] = useState<string | null>(null)

  function load() {
    api<{ data: Tenant }>("/api/v1/tenant")
      .then((r) => {
        setTenant(r.data)
        setStoreName(r.data.store_display_name ?? "")
        setCurrency(r.data.default_currency ?? "IRR")
        setTenantName(r.data.name ?? "")
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
        default_currency: currency || "IRR",
        tenant_name: tenantName || null,
      },
    })
    setMsg(t("store_settings:saved"))
    load()
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("store_settings:title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("store_settings:subtitle")}</p>
      </div>
      {msg ? <p className="text-sm text-green-600 dark:text-green-400">{msg}</p> : null}
      <div className="grid gap-2">
        <Label>{t("setup:tenant_name")}</Label>
        <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>{t("setup:store_display_name")}</Label>
        <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>{t("setup:default_currency")}</Label>
        <Input value={currency} onChange={(e) => setCurrency(e.target.value)} dir="ltr" className="font-mono" />
      </div>
      {tenant ? (
        <p className="text-muted-foreground text-xs font-mono" dir="ltr">
          slug: {tenant.slug} · domain: {tenant.domain ?? "—"}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" onClick={() => void save()}>
          {t("common:save")}
        </Button>
        <Button type="button" variant="outline" onClick={() => load()}>
          {t("store_settings:load_tenant")}
        </Button>
      </div>
    </div>
  )
}
