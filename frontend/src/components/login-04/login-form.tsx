"use client"

import { useEffect, useState, type ComponentPropsWithoutRef, type FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { api, ApiError } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useAuth } from "@/providers/AppProviders"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type LoginResult = {
  password_must_change?: boolean
  setup_completed?: boolean
  user?: { tenant?: { setup_completed?: boolean } }
}

function safeNextPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null
  return raw
}

function redirectAfterLogin(result: LoginResult, next: string | null) {
  if (result.password_must_change) {
    window.location.assign("/account/change-password")
    return
  }

  const setupDone =
    result.setup_completed ??
    result.user?.tenant?.setup_completed ??
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
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [panelPending, setPanelPending] = useState(false)

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

  async function onSubmit(e: FormEvent) {
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

  if (panelPending) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card className="overflow-hidden shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">{t("submit")}…</p>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden shadow-sm">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form
            className="flex flex-col gap-6 p-6 md:p-8"
            onSubmit={(e) => void onSubmit(e)}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-2xl font-bold">{t("loginTitle")}</h1>
              <p className="text-balance text-sm text-muted-foreground">
                {t("loginSubtitle")}
              </p>
            </div>
            {error ? (
              <p className="text-center text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
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
            <Button type="submit" className="w-full" disabled={pending}>
              {t("submit")}
            </Button>
          </form>
          <div className="relative hidden bg-muted md:block">
            <img
              src="/brand/logo.png"
              alt={t("brandAlt")}
              className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
