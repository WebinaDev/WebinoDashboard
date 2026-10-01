"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react"

import {
  SetupChoiceCard,
  SetupWizardProgress,
} from "@/components/setup/setup-wizard-ui"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CurrencySettingsFields } from "@/components/CurrencySettingsFields"
import { api, ApiError } from "@/lib/api"
import {
  DEFAULT_CURRENCY_SYMBOL,
  DEFAULT_STORE_CURRENCY,
  type CurrencySymbolId,
  type StoreCurrencyCode,
} from "@/lib/currencies"
import { SITE_TYPES } from "@/kernel/registry"
import type { SiteTypeSlug } from "@/kernel/types"

type SetupStatus = {
  setup_completed: boolean
  site_type_selected: boolean
  tenant: {
    site_type_slug?: string | null
    business_type_slug?: string | null
    domain?: string | null
    domain_configured?: boolean
    license_key_configured?: boolean
    default_locale?: string
  }
}

const STEPS = ["site_type", "store", "locale", "license", "confirm"] as const

const GRADIENT_CARD =
  "overflow-hidden border-primary/20 bg-gradient-to-bl from-primary/10 via-background to-background"

export default function SetupWizardPage() {
  const t = useTranslations("setup")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [siteType, setSiteType] = useState<SiteTypeSlug | "">("")
  const [storeName, setStoreName] = useState("")
  const [currency, setCurrency] = useState<StoreCurrencyCode>(DEFAULT_STORE_CURRENCY)
  const [currencySymbol, setCurrencySymbol] = useState<CurrencySymbolId>(DEFAULT_CURRENCY_SYMBOL)
  const [locale, setLocale] = useState<"fa" | "en">("fa")
  const [tenantName, setTenantName] = useState("")
  const [domain, setDomain] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const stepMetas = useMemo(
    () =>
      STEPS.map((id, i) => ({
        id,
        label: t(`step_${i}_label` as "step_0_label"),
      })),
    [t],
  )

  useEffect(() => {
    let cancelled = false

    async function loadStatus(attempt = 0): Promise<void> {
      try {
        const data = await api<SetupStatus>("/api/v1/setup/status")
        if (cancelled) return
        if (data.setup_completed) {
          router.replace("/dashboard")
          return
        }
        const appliedSlug = data.tenant.site_type_slug as SiteTypeSlug | null
        const businessSlug = data.tenant.business_type_slug as SiteTypeSlug | null
        const preselected = appliedSlug ?? businessSlug
        if (preselected && SITE_TYPES.some((s) => s.slug === preselected)) {
          setSiteType(preselected)
        }
        // Only skip site-type step when the type was actually applied (site_type_slug set).
        if (
          data.site_type_selected &&
          appliedSlug &&
          SITE_TYPES.some((s) => s.slug === appliedSlug)
        ) {
          setStep(1)
        }
        if (data.tenant.domain) setDomain(data.tenant.domain)
        if (data.tenant.default_locale === "en") setLocale("en")
      } catch (e) {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 401) {
          if (attempt < 1) {
            await new Promise((r) => setTimeout(r, 400))
            if (!cancelled) await loadStatus(attempt + 1)
            return
          }
          window.location.assign("/login?next=/setup")
          return
        }
        setErr(e instanceof Error ? e.message : tCommon("error_generic"))
      }
    }

    void loadStatus()
    return () => {
      cancelled = true
    }
  }, [router, tCommon])

  function goBack() {
    setErr(null)
    setMsg(null)
    setStep((s) => Math.max(0, s - 1))
  }

  function selectStep(id: string) {
    const idx = STEPS.indexOf(id as (typeof STEPS)[number])
    if (idx < 0 || idx > step) return
    setErr(null)
    setMsg(null)
    setStep(idx)
  }

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
          default_currency: currency || DEFAULT_STORE_CURRENCY,
          currency_symbol: currencySymbol || DEFAULT_CURRENCY_SYMBOL,
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
      if (siteType) {
        await api("/api/v1/setup/apply-site-type", {
          method: "POST",
          json: { site_type_slug: siteType },
        })
      }
      await api("/api/v1/setup/complete", {
        method: "POST",
        json: siteType ? { site_type_slug: siteType } : {},
      })
      router.replace("/dashboard")
    } catch (e) {
      setErr(e instanceof Error ? e.message : tCommon("error_generic"))
    } finally {
      setPending(false)
    }
  }

  async function onPrimary() {
    if (step === 0) return applySiteType()
    if (step === 1) return saveStore()
    if (step === 2) return saveLocale()
    if (step === 3) return saveCrm()
    return complete()
  }

  const primaryDisabled =
    pending || (step === 0 && !siteType)

  return (
    <div
      className="mx-auto flex min-h-svh max-w-3xl flex-col justify-center space-y-6 px-4 py-10 text-start"
      dir="rtl"
    >
      <header className="space-y-3 text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm md:text-base">{t("subtitle")}</p>
      </header>

      <SetupWizardProgress
        steps={stepMetas}
        current={STEPS[step]}
        onSelect={selectStep}
      />

      {step === 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {SITE_TYPES.map((type) => (
            <SetupChoiceCard
              key={type.slug}
              selected={siteType === type.slug}
              title={type.name_fa}
              description={type.name_en}
              onClick={() => setSiteType(type.slug)}
            />
          ))}
        </div>
      )}

      {step === 1 && (
        <Card className={GRADIENT_CARD}>
          <CardHeader>
            <CardTitle className="text-xl">{t("step_1_label")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="tenantName">{t("tenant_name")}</Label>
              <Input
                id="tenantName"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder={t("tenant_name_placeholder")}
                className="text-start"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="storeName">{t("store_name")}</Label>
              <Input
                id="storeName"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder={t("store_display_name_placeholder")}
                className="text-start"
              />
            </div>
            <CurrencySettingsFields
              currency={currency}
              symbol={currencySymbol}
              onCurrencyChange={setCurrency}
              onSymbolChange={setCurrencySymbol}
              currencyLabel={t("currency")}
              symbolLabel={t("currency_symbol")}
            />
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className={GRADIENT_CARD}>
          <CardHeader>
            <CardTitle className="text-xl">{t("step_2_label")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm leading-6">{t("locale_hint")}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={locale === "fa" ? "default" : "outline"}
                onClick={() => setLocale("fa")}
              >
                {tCommon("locale_fa")}
              </Button>
              <Button
                type="button"
                variant={locale === "en" ? "default" : "outline"}
                onClick={() => setLocale("en")}
              >
                {tCommon("locale_en")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card className={GRADIENT_CARD}>
          <CardHeader>
            <CardTitle className="text-xl">{t("step_3_label")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="domain">{t("domain")}</Label>
              <Input
                id="domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder={t("domain_placeholder")}
                className="text-start"
                dir="ltr"
              />
              <p className="text-muted-foreground text-xs leading-5">{t("domain_hint")}</p>
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void syncLicense()}
                disabled={pending}
              >
                {t("sync_license")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card className={GRADIENT_CARD}>
          <CardHeader>
            <CardTitle className="text-xl">{t("step_4_label")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm leading-6">{t("confirm_hint")}</p>
            {siteType ? (
              <div className="rounded-2xl border bg-background/70 px-4 py-3 text-sm">
                <span className="text-muted-foreground">{t("selected_site_type")}: </span>
                <span className="font-medium">
                  {SITE_TYPES.find((s) => s.slug === siteType)?.name_fa}
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {msg ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          {msg}
        </div>
      ) : null}
      {err ? (
        <div
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-xl border px-4 py-3 text-sm"
          role="alert"
        >
          {err}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" disabled={step <= 0 || pending} onClick={goBack}>
          <ArrowRight className="h-4 w-4" />
          {tCommon("back")}
        </Button>
        <Button type="button" disabled={primaryDisabled} onClick={() => void onPrimary()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {step === 4 ? t("finish") : t("continue")}
          {step !== 4 ? <ArrowLeft className="h-4 w-4" /> : null}
        </Button>
      </div>
    </div>
  )
}
