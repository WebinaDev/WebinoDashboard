"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"

export default function NotFound() {
  const t = useTranslations("common")

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t("not_found_title")}</h1>
      <p className="text-muted-foreground">{t("page_not_found")}</p>
      <Link href="/" className="text-primary underline-offset-4 hover:underline">
        {t("back_to_home")}
      </Link>
    </div>
  )
}
