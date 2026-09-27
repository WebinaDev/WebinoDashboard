"use client"

import { useLocale, useTranslations } from "next-intl"
import { useId } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"

export type SimpleSeo = {
  title?: string
  description?: string
  focus_keyword?: string
}

const TITLE_MAX = 60
const DESCRIPTION_MAX = 160

function Counter({ value, max, locale }: { value: string; max: number; locale: "fa" | "en" }) {
  const len = value.length
  return (
    <span className={cn("text-xs tabular-nums", len > max ? "text-destructive" : "text-muted-foreground")}>
      {formatNumber(len, locale)} / {formatNumber(max, locale)}
    </span>
  )
}

/** Shared SEO box (focus keyword, SEO title, meta description) for post, page and product editors. */
export function SimpleSeoFields({
  seo,
  onChange,
  className,
}: {
  seo: SimpleSeo | null | undefined
  onChange: (next: SimpleSeo) => void
  className?: string
}) {
  const t = useTranslations("ui")
  const locale = normalizeUiLocale(useLocale())
  const id = useId()
  const value = seo ?? {}
  const patch = (partial: Partial<SimpleSeo>) => onChange({ ...value, ...partial })

  return (
    <div className={cn("space-y-3 rounded-xl border p-4", className)}>
      <p className="text-sm font-semibold">{t("seo_panel")}</p>
      <div className="space-y-1">
        <Label htmlFor={`${id}-kw`}>{t("seo_focus_keyword")}</Label>
        <Input
          id={`${id}-kw`}
          value={value.focus_keyword ?? ""}
          onChange={(e) => patch({ focus_keyword: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${id}-title`}>{t("seo_title")}</Label>
          <Counter value={value.title ?? ""} max={TITLE_MAX} locale={locale} />
        </div>
        <Input id={`${id}-title`} value={value.title ?? ""} onChange={(e) => patch({ title: e.target.value })} />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${id}-desc`}>{t("seo_description")}</Label>
          <Counter value={value.description ?? ""} max={DESCRIPTION_MAX} locale={locale} />
        </div>
        <Textarea
          id={`${id}-desc`}
          rows={3}
          value={value.description ?? ""}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </div>
    </div>
  )
}
