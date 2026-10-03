"use client"

import Image from "next/image"
import { useEffect, useState, type ComponentPropsWithoutRef, type FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { api, ApiError } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useAuth } from "@/providers/AppProviders"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type LoginResult = {
  password_must_change?: boolean
  setup_completed?: boolean
  impersonation?: { staff_name?: string } | null
  user?: { tenant?: { setup_completed?: boolean; name?: string; branding?: { logo_url?: string } } }
  data?: LoginResult
}

type PublicTenant = {
  name?: string
  store_display_name?: string | null
  branding?: { logo_url?: string | null; logo_dark_url?: string | null } | null
  otp_auth?: { login_enabled?: boolean; register_enabled?: boolean; length?: number }
}

function safeNextPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null
  return raw
}

function unwrapLogin(result: LoginResult): LoginResult {
  return result.data ?? result
}

function redirectAfterLogin(result: LoginResult, next: string | null) {
  const body = unwrapLogin(result)
  if (body.impersonation) {
    window.location.assign(next ?? "/dashboard")
    return
  }
  if (body.password_must_change) {
    window.location.assign("/account/change-password")
    return
  }

  const setupDone =
    body.setup_completed ??
    body.user?.tenant?.setup_completed ??
    true

  if (!setupDone) {
    window.location.assign("/setup")
    return
  }

  window.location.assign(next ?? "/dashboard")
}

export function LoginForm({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  const t = useTranslations("auth")
  const searchParams = useSearchParams()
  const { setAuthenticated } = useAuth()
  const [mode, setMode] = useState<"password" | "otp">("password")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [identifier, setIdentifier] = useState("")
  const [code, setCode] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [panelPending, setPanelPending] = useState(false)
  const [tenant, setTenant] = useState<PublicTenant | null>(null)

  useEffect(() => {
    void api<{ data?: PublicTenant } | PublicTenant>("/api/v1/public/tenant")
      .then((r) => {
        const body = (r && typeof r === "object" && "data" in r ? r.data : r) as PublicTenant
        setTenant(body ?? null)
      })
      .catch(() => setTenant(null))
  }, [])

  useEffect(() => {
    const panelToken = searchParams.get("panel_token")
    if (!panelToken) return

    let cancelled = false
    setPanelPending(true)
    setError(null)

    void (async () => {
      try {
        const result = await api<LoginResult>("/api/v1/auth/panel-login", {
          method: "POST",
          json: { panel_token: panelToken },
        })
        if (cancelled) return
        setAuthenticated(true)
        redirectAfterLogin(result, safeNextPath(searchParams.get("next")))
      } catch (err) {
        if (cancelled) return
        setError(getApiErrorMessage(err) || t("errors_invalid"))
        setPanelPending(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [searchParams, setAuthenticated, t])

  async function onPasswordSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const result = await api<LoginResult>("/api/v1/auth/login", {
        method: "POST",
        json: { email, password },
      })
      setAuthenticated(true)
      redirectAfterLogin(result, safeNextPath(searchParams.get("next")))
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError(t("errors_throttled"))
      } else {
        setError(getApiErrorMessage(err) || t("errors_invalid"))
      }
    } finally {
      setPending(false)
    }
  }

  async function onSendOtp(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      await api("/api/v1/auth/send-otp", {
        method: "POST",
        json: { identifier, purpose: "login" },
      })
      setCodeSent(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError(t("errors_throttled"))
      } else {
        setError(getApiErrorMessage(err) || t("errors_otp_send"))
      }
    } finally {
      setPending(false)
    }
  }

  async function onVerifyOtp(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const result = await api<LoginResult>("/api/v1/auth/verify-otp", {
        method: "POST",
        json: { identifier, code, purpose: "login", remember },
      })
      setAuthenticated(true)
      redirectAfterLogin(result, safeNextPath(searchParams.get("next")))
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError(t("errors_throttled"))
      } else {
        setError(getApiErrorMessage(err) || t("errors_otp_invalid"))
      }
    } finally {
      setPending(false)
    }
  }

  const brandName = tenant?.store_display_name || tenant?.name || t("brandAlt")
  const brandLogo =
    tenant?.branding?.logo_url || tenant?.branding?.logo_dark_url || "/brand/logo.png"
  const otpEnabled = tenant?.otp_auth?.login_enabled === true

  useEffect(() => {
    if (!otpEnabled && mode === "otp") setMode("password")
  }, [otpEnabled, mode])

  if (panelPending) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card className="overflow-hidden shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-muted-foreground text-sm">{t("submit")}…</p>
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={cn("flex w-full max-w-sm flex-col gap-6 md:max-w-4xl", className)} {...props}>
      <Card className="overflow-hidden shadow-sm">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="flex flex-col gap-6 p-6 md:p-8">
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-2xl font-bold">{t("loginTitle")}</h1>
              <p className="text-muted-foreground text-balance text-sm">{t("loginSubtitle")}</p>
            </div>

            {otpEnabled ? (
              <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "password" ? "default" : "ghost"}
                  onClick={() => setMode("password")}
                >
                  {t("mode_password")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "otp" ? "default" : "ghost"}
                  onClick={() => setMode("otp")}
                >
                  {t("mode_otp")}
                </Button>
              </div>
            ) : null}

            {error ? (
              <p className="text-destructive text-center text-sm" role="alert">
                {error}
              </p>
            ) : null}

            {mode === "password" ? (
              <form className="flex flex-col gap-4" onSubmit={(e) => void onPasswordSubmit(e)}>
                <div className="grid gap-2">
                  <Label htmlFor="email">{t("email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    required
                    dir="ltr"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">{t("password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(ev) => setPassword(ev.target.value)}
                    required
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                  {t("remember")}
                </label>
                <Button type="submit" className="w-full" disabled={pending}>
                  {t("submit")}
                </Button>
              </form>
            ) : (
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => void (codeSent ? onVerifyOtp(e) : onSendOtp(e))}
              >
                <div className="grid gap-2">
                  <Label htmlFor="identifier">{t("identifier")}</Label>
                  <Input
                    id="identifier"
                    value={identifier}
                    onChange={(ev) => setIdentifier(ev.target.value)}
                    required
                    dir="ltr"
                    placeholder={t("identifier_placeholder")}
                  />
                </div>
                {codeSent ? (
                  <div className="grid gap-2">
                    <Label htmlFor="otp">{t("otp_code")}</Label>
                    <Input
                      id="otp"
                      value={code}
                      onChange={(ev) => setCode(ev.target.value)}
                      required
                      dir="ltr"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </div>
                ) : null}
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                  {t("remember")}
                </label>
                <Button type="submit" className="w-full" disabled={pending}>
                  {codeSent ? t("verify_otp") : t("send_otp")}
                </Button>
                {codeSent ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setCodeSent(false)
                      setCode("")
                    }}
                  >
                    {t("change_identifier")}
                  </Button>
                ) : null}
              </form>
            )}
          </div>
          <div className="relative hidden flex-col items-center justify-center gap-4 bg-muted p-8 md:flex">
            <Image
              src={brandLogo}
              alt={brandName}
              width={96}
              height={96}
              className="size-24 rounded-2xl object-contain"
              unoptimized
            />
            <p className="text-center text-lg font-semibold">{brandName}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
