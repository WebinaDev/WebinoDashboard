"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"

import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ChangePasswordPage() {
  const t = useTranslations("auth")
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirmation, setPasswordConfirmation] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== passwordConfirmation) {
      setError(t("passwordMismatch"))
      return
    }
    setPending(true)
    try {
      await api("/api/v1/auth/change-password", {
        method: "POST",
        json: {
          current_password: currentPassword,
          password,
          password_confirmation: passwordConfirmation,
        },
      })
      const st = await api<{ setup_completed?: boolean }>("/api/v1/setup/status")
      router.replace(st.setup_completed === false ? "/setup" : "/admin")
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors_invalid"))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="bg-muted flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader>
          <CardTitle>{t("changePasswordTitle")}</CardTitle>
          <p className="text-muted-foreground text-sm">{t("changePasswordSubtitle")}</p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="current_password">{t("currentPassword")}</Label>
              <Input
                id="current_password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(ev) => setCurrentPassword(ev.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">{t("newPassword")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password_confirmation">{t("confirmPassword")}</Label>
              <Input
                id="password_confirmation"
                type="password"
                autoComplete="new-password"
                value={passwordConfirmation}
                onChange={(ev) => setPasswordConfirmation(ev.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {t("changePasswordSubmit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
