"use client"

import { useState, type ComponentPropsWithoutRef, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import { useAuth } from "@/providers/AppProviders"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginForm({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  const t = useTranslations("auth")
  const router = useRouter()
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
      await api("/api/v1/auth/login", {
        method: "POST",
        json: { email, password },
      })
      setAuthenticated(true)
      try {
        const st = await api<{ data: { setup_completed: boolean } }>("/api/v1/setup/status")
        router.replace(st.data.setup_completed ? "/admin" : "/setup")
      } catch {
        router.replace("/")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors_invalid"))
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
              <div className="flex items-center">
                <Label htmlFor="password">{t("password")}</Label>
                <a
                  href="#login"
                  className="ms-auto text-sm underline-offset-4 hover:underline"
                >
                  {t("forgotPassword")}
                </a>
              </div>
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
              alt=""
              className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
