"use client"

import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import type { SimpleSeo } from "@/components/seo/SimpleSeoFields"

/** Shows whether the focus keyword appears in title/excerpt/SEO fields (not a Rank Math score). */
export function SeoKeywordIndicator({
  seo,
  title,
  excerpt,
}: {
  seo?: SimpleSeo | null
  title: string
  excerpt?: string | null
}) {
  const t = useTranslations("content_admin")
  const kw = seo?.focus_keyword?.trim()
  if (!kw) {
    return <span className="text-muted-foreground text-xs">—</span>
  }
  const hay = [title, excerpt ?? "", seo?.title ?? "", seo?.description ?? ""].join(" ").toLowerCase()
  const present = hay.includes(kw.toLowerCase())
  return (
    <Badge variant={present ? "default" : "outline"} className="max-w-[10rem] truncate font-normal" title={kw}>
      {present ? t("seo_keyword_present") : t("seo_keyword_absent")}
    </Badge>
  )
}
