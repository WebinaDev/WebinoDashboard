"use client"

import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"

export function AnalyticsSourceBadge({ source }: { source?: string | null }) {
  const t = useTranslations("analytics")
  if (!source) return null
  return (
    <Badge variant="secondary" className="text-[11px] font-medium">
      {source === "native" ? t("sourceNative") : source}
    </Badge>
  )
}
