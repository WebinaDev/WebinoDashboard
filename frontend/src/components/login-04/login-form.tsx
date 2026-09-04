"use client"

import { useState, type ComponentPropsWithoutRef, type FormEvent } from "react"
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

      if (result.password_must_change) {
        window.location.assign("/account/change-password")
        return
      }

      const next = safeNextPath(searchParams.get("next"))
      const setupDone =
        result.setup_completed ??
        result.user?.tenant?.setup_completed ??
        true

      if (!setupDone) {
        window.location.assign("/setup")
        return
      }

      window.location.assign(next ?? "/admin")
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
            <p className="text-muted-foreground text-center text-xs">
              {t("defaultCredentialsHint")}
            </p>
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
