"use client"

import Image from "next/image"
import { useTranslation } from "react-i18next"

import { LoginForm } from "@/components/login-02/login-form"

export default function LoginPage() {
  const { t } = useTranslation(["common"])

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <div className="flex items-center gap-2 font-medium">
            <Image
              src="/brand/logo.png"
              alt=""
              width={24}
              height={24}
              className="size-6 rounded-md"
              priority
            />
            {t("common:appName")}
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <img
          src="/placeholder.svg"
          alt=""
          fetchPriority="low"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
        />
      </div>
    </div>
  )
}
