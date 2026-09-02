"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { SITE_TYPES } from "@/kernel/registry"
import type { SiteTypeSlug } from "@/kernel/types"

type SetupStatus = {
  setup_completed: boolean
  site_type_selected: boolean
  tenant: {
    site_type_slug?: string | null
    business_type_slug?: string | null
    domain?: string | null
    license_key_configured?: boolean
    default_locale?: string
  }
}

const STEPS = ["site_type", "store", "locale", "license", "confirm"] as const

export default function SetupWizardPage() {
  const t = useTranslations("setup")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [siteType, setSiteType] = useState<SiteTypeSlug | "">("")
  const [storeName, setStoreName] = useState("")
  const [currency, setCurrency] = useState("IRR")
  const [locale, setLocale] = useState<"fa" | "en">("fa")
  const [tenantName, setTenantName] = useState("")
  const [domain, setDomain] = useState("")
  const [licenseKey, setLicenseKey] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [skipSiteType, setSkipSiteType] = useState(false)

  useEffect(() => {
    let cancelled = false
    api<SetupStatus>("/api/v1/setup/status")
      .then((data) => {
        if (!cancelled) {
          if (data.setup_completed) {
            router.replace("/admin")
            return
          }
          const preselected =
            (data.tenant.site_type_slug as SiteTypeSlug | null) ??
            (data.tenant.business_type_slug as SiteTypeSlug | null)
          if (preselected && SITE_TYPES.some((s) => s.slug === preselected)) {
            setSiteType(preselected)
            setSkipSiteType(true)
            setStep(1)
          }
          if (data.tenant.domain) setDomain(data.tenant.domain)
          if (data.tenant.default_locale === "en") setLocale("en")
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [router])

  async function applySiteType() {
    if (!siteType) {
      setErr(t("site_type_required"))
      return
    }
    setErr(null)
    setPending(true)
    try {
      await api("/api/v1/setup/apply-site-type", {
        method: "POST",
        json: { site_type_slug: siteType },
      })
      setMsg(t("site_type_applied"))
      setStep(1)
    } catch (e) {
      setErr(e instanceof Error ? e.message : tCommon("error_generic"))
    } finally {
      setPending(false)
    }
  }

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
      setMsg(t("saved"))
      setStep(2)
    } catch (e) {
      setErr(e instanceof Error ? e.message : tCommon("error_generic"))
    } finally {
      setPending(false)
    }
  }

  async function saveLocale() {
    setErr(null)
    setPending(true)
    try {
      await api("/api/v1/setup/store", {
        method: "PATCH",
        json: { default_locale: locale },
      })
      setMsg(t("saved"))
      setStep(3)
    } catch (e) {
      setErr(e instanceof Error ? e.message : tCommon("error_generic"))
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
      setMsg(t("saved"))
      setStep(4)
    } catch (e) {
      setErr(e instanceof Error ? e.message : tCommon("error_generic"))
    } finally {
      setPending(false)
    }
  }

  async function syncLicense() {
    setErr(null)
    setPending(true)
    try {
      await api("/api/v1/setup/sync-license", { method: "POST" })
      setMsg(t("license_synced"))
    } catch (e) {
      setErr(e instanceof Error ? e.message : tCommon("error_generic"))
    } finally {
      setPending(false)
    }
  }

  async function complete() {
    setErr(null)
    setPending(true)
    try {
      await api("/api/v1/setup/complete", { method: "POST" })
      router.replace("/admin")
    } catch (e) {
      setErr(e instanceof Error ? e.message : tCommon("error_generic"))
    } finally {
      setPending(false)
    }
  }

  const currentStep = skipSiteType && step === 0 ? 1 : step

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </div>

      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full ${i <= currentStep ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>

      {currentStep === 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {SITE_TYPES.map((type) => (
            <button
              key={type.slug}
              type="button"
              onClick={() => setSiteType(type.slug)}
              className={`rounded-xl border p-4 text-start transition-colors ${
                siteType === type.slug
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <p className="font-medium">{type.name_fa}</p>
              <p className="text-muted-foreground text-xs">{type.name_en}</p>
            </button>
          ))}
          <div className="sm:col-span-2">
            <Button onClick={applySiteType} disabled={pending || !siteType} className="w-full">
              {t("continue")}
            </Button>
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tenantName">{t("tenant_name")}</Label>
            <Input id="tenantName" value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="storeName">{t("store_name")}</Label>
            <Input id="storeName" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">{t("currency")}</Label>
            <Input id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </div>
          <Button onClick={saveStore} disabled={pending}>
            {t("continue")}
          </Button>
        </div>
      )}

      {currentStep === 2 && (
        <div className="space-y-4">
          <p className="text-sm">{t("locale_hint")}</p>
          <div className="flex gap-2">
            <Button variant={locale === "fa" ? "default" : "outline"} onClick={() => setLocale("fa")}>
              فارسی
            </Button>
            <Button variant={locale === "en" ? "default" : "outline"} onClick={() => setLocale("en")}>
              English
            </Button>
          </div>
          <Button onClick={saveLocale} disabled={pending}>
            {t("continue")}
          </Button>
        </div>
      )}

      {currentStep === 3 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="domain">{t("domain")}</Label>
            <Input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="licenseKey">{t("license_key")}</Label>
            <Input id="licenseKey" value={licenseKey} onChange={(e) => setLicenseKey(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={saveCrm} disabled={pending}>
              {t("continue")}
            </Button>
            <Button variant="outline" onClick={syncLicense} disabled={pending}>
              {t("sync_license")}
            </Button>
          </div>
        </div>
      )}

      {currentStep === 4 && (
        <div className="space-y-4">
          <p className="text-sm">{t("confirm_hint")}</p>
          {siteType && (
            <p className="text-sm font-medium">
              {t("selected_site_type")}: {SITE_TYPES.find((s) => s.slug === siteType)?.name_fa}
            </p>
          )}
          <Button onClick={complete} disabled={pending}>
            {t("finish")}
          </Button>
        </div>
      )}

      {msg && <p className="text-sm text-green-600">{msg}</p>}
      {err && <p className="text-destructive text-sm">{err}</p>}
    </div>
  )
}
