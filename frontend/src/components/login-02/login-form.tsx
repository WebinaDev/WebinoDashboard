"use client"

import { useState, type ComponentPropsWithoutRef, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import { useAuth } from "@/providers/AppProviders"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginForm({
  className,
  ...props
}: ComponentPropsWithoutRef<"form">) {
  const { t } = useTranslation(["auth"])
  const router = useRouter()
  const { setToken } = useAuth()
  const [email, setEmail] = useState("admin@example.com")
  const [password, setPassword] = useState("password")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await api<{ token: string }>("/api/v1/auth/login", {
        method: "POST",
        json: { email, password },
      })
      setToken(res.token)
      try {
        const st = await api<{ data: { setup_completed: boolean } }>("/api/v1/setup/status")
        router.replace(st.data.setup_completed ? "/admin" : "/setup")
      } catch {
        router.replace("/")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth:errors_invalid"))
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={(e) => void onSubmit(e)}
      {...props}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">{t("auth:loginTitle")}</h1>
        <p className="text-balance text-sm text-muted-foreground">
          {t("auth:loginSubtitle")}
        </p>
      </div>
      <div className="grid gap-6">
        {error ? (
          <p className="text-center text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="email">{t("auth:email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center">
            <Label htmlFor="password">{t("auth:password")}</Label>
            <a
              href="#login"
              className="ms-auto text-sm underline-offset-4 hover:underline"
            >
              {t("auth:forgotPassword")}
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
          {t("auth:submit")}
        </Button>
      </div>
    </form>
  )
}
