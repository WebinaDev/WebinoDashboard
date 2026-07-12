"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"

type SetupStatus = {
  setup_completed: boolean
  tenant: {
    business_type_slug?: string | null
    vertical?: string | null
    package_sku?: string | null
    domain?: string | null
    license_key_configured?: boolean
  }
}

export default function SetupWizardPage() {
  const { t } = useTranslation(["setup", "common"])
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [businessType, setBusinessType] = useState("")
  const [packageSku, setPackageSku] = useState("")
  const [storeName, setStoreName] = useState("")
  const [currency, setCurrency] = useState("IRR")
  const [tenantName, setTenantName] = useState("")
  const [domain, setDomain] = useState("")
  const [licenseKey, setLicenseKey] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    api<{ data: SetupStatus }>("/api/v1/setup/status")
      .then((r) => {
        if (!cancelled) {
          if (r.data.setup_completed) {
            router.replace("/")
            return
          }
          const tenant = r.data.tenant
          setBusinessType(tenant.business_type_slug || tenant.vertical || "")
          setPackageSku(tenant.package_sku || "")
          if (tenant.domain) setDomain(tenant.domain)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [router])

  async function saveStore() {
    setErr(null)
    setPending(true)
    try {
      await api("/api/v1/setup/store", {
        method: "PATCH",
        json: {
          store_display_name: storeName || null,
          default_currency: currency || "IRR",
          tenant_name: tenantName || null,
        },
      })
      setMsg(t("setup:saved"))
      setStep(2)
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("common:error_generic"))
    } finally {
      setPending(false)
    }
  }

  async function saveCrm() {
    setErr(null)
    setPending(true)
    try {
      await api("/api/v1/setup/crm", {
        method: "PATCH",
        json: {
          domain: domain || null,
          license_key: licenseKey || null,
        },
      })
      setMsg(t("setup:saved"))
      setStep(3)
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("common:error_generic"))
    } finally {
      setPending(false)
    }
  }

  async function syncLicense() {
    setErr(null)
    setPending(true)
    try {
      await api("/api/v1/setup/sync-license", { method: "POST" })
      setMsg(t("setup:sync_ok"))
      setStep(4)
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("setup:sync_fail"))
    } finally {
      setPending(false)
    }
  }

  async function finish() {
    setErr(null)
    setPending(true)
    try {
      await api("/api/v1/setup/complete", { method: "POST" })
      router.replace("/")
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("common:error_generic"))
    } finally {
      setPending(false)
    }
  }

  const steps = [0, 1, 2, 3, 4]

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("setup:title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("setup:subtitle")}</p>
      </div>
      <ol className="text-muted-foreground flex flex-wrap gap-2 text-xs">
        {steps.map((i) => (
          <li
            key={i}
            className={
              i === step
                ? "text-foreground font-medium"
                : i < step
                  ? "text-primary"
                  : ""
            }
          >
            {i + 1}. {t(`setup:step_${i}_label` as never)}
          </li>
        ))}
      </ol>
      {err ? <p className="text-destructive text-sm">{err}</p> : null}
      {msg ? <p className="text-sm text-green-600 dark:text-green-400">{msg}</p> : null}

      {step === 0 ? (
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">{t("setup:business_readonly")}</p>
          <div className="grid gap-2">
            <Label>{t("setup:business_type")}</Label>
            <Input value={businessType} readOnly dir="ltr" className="font-mono bg-muted" />
          </div>
          {packageSku ? (
            <div className="grid gap-2">
              <Label>SKU</Label>
              <Input value={packageSku} readOnly dir="ltr" className="font-mono bg-muted text-sm" />
            </div>
          ) : null}
          <Button type="button" onClick={() => setStep(1)}>
            {t("setup:continue")}
          </Button>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="tenantName">{t("setup:tenant_name")}</Label>
            <Input
              id="tenantName"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              placeholder="Demo tenant"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="storeName">{t("setup:store_display_name")}</Label>
            <Input
              id="storeName"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="My shop"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="currency">{t("setup:default_currency")}</Label>
            <Input
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              dir="ltr"
              className="font-mono"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(0)}>
              {t("common:cancel")}
            </Button>
            <Button type="button" disabled={pending} onClick={() => void saveStore()}>
              {t("setup:continue")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="domain">{t("setup:domain")}</Label>
            <Input
              id="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              dir="ltr"
              className="font-mono text-sm"
              placeholder="store.example.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="license">{t("setup:license_key")}</Label>
            <Input
              id="license"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              dir="ltr"
              className="font-mono text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              {t("common:cancel")}
            </Button>
            <Button type="button" disabled={pending} onClick={() => void saveCrm()}>
              {t("setup:continue")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">{t("setup:sync_hint")}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
              {t("common:cancel")}
            </Button>
            <Button type="button" disabled={pending} onClick={() => void syncLicense()}>
              {t("setup:sync_license")}
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => setStep(4)}>
              {t("setup:skip_sync")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">{t("setup:finish_hint")}</p>
          <Button type="button" disabled={pending} onClick={() => void finish()}>
            {t("setup:finish")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
