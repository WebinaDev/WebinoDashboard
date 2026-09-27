"use client"

import { TrendingDown, TrendingUp } from "lucide-react"
import { useTranslations } from "next-intl"

export function ChangePctBadge({ value }: { value: number | null }) {
  const t = useTranslations("reports")
  if (value === null) {
    return <span className="text-xs text-muted-foreground">{t("deltaNew")}</span>
  }
  const up = value >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs ${up ? "text-emerald-600" : "text-red-600"}`}
    >
      <Icon className="size-3" aria-hidden />
      {Math.abs(value).toFixed(1)}%
    </span>
  )
}
