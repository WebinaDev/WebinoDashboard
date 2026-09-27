"use client"

import { useTranslations } from "next-intl"

import { LoginForm } from "@/components/login-04/login-form"

export default function LoginPage() {
  const t = useTranslations("common")

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full flex-col items-center gap-6">
        <p className="text-muted-foreground text-sm font-medium">{t("appName")}</p>
        <LoginForm />
      </div>
    </div>
  )
}
