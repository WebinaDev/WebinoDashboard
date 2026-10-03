"use client"

import { TrendingDown, TrendingUp } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { formatNumber, normalizeUiLocale } from "@/lib/locale"

export function ChangePctBadge({ value }: { value: number | null }) {
  const t = useTranslations("reports")
  const locale = normalizeUiLocale(useLocale())
  if (value === null) {
    return <span className="text-xs text-muted-foreground">{t("deltaNew")}</span>
  }
  const up = value >= 0
  const Icon = up ? TrendingUp : TrendingDown
  const amount = formatNumber(Math.abs(value), locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs ${up ? "text-emerald-600" : "text-red-600"}`}
    >
      <Icon className="size-3" aria-hidden />
      {amount}
      {locale === "fa" ? "٪" : "%"}
    </span>
  )
}
