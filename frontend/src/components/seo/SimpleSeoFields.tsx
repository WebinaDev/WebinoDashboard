"use client"

import { useLocale, useTranslations } from "next-intl"
import { useId } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"

export type SimpleSeo = {
  title?: string
  description?: string
  focus_keyword?: string
  og_title?: string
  og_description?: string
  og_image?: string
  schema_type?: string
}

const TITLE_MAX = 60
const DESCRIPTION_MAX = 160

const SCHEMA_TYPES = ["Article", "BlogPosting", "WebPage", "NewsArticle", "Product"] as const

function Counter({ value, max, locale }: { value: string; max: number; locale: "fa" | "en" }) {
  const len = value.length
  return (
    <span className={cn("text-xs tabular-nums", len > max ? "text-destructive" : "text-muted-foreground")}>
      {formatNumber(len, locale)} / {formatNumber(max, locale)}
    </span>
  )
}

function SerpPreview({
  title,
  description,
  url,
  siteName,
}: {
  title: string
  description: string
  url: string
  siteName?: string
}) {
  const t = useTranslations("ui")
  const displayTitle = title.trim() || t("seo_serp_title_placeholder")
  const displayDesc = description.trim() || t("seo_serp_desc_placeholder")
  const displayUrl = url.trim() || "example.com/page"

  return (
    <div className="bg-muted/40 space-y-1 rounded-lg border p-3 text-start">
      <p className="text-muted-foreground text-xs">{t("seo_serp_preview")}</p>
      {siteName ? <p className="text-muted-foreground truncate text-xs">{siteName}</p> : null}
      <p className="truncate text-sm text-[#1a0dab]">{displayUrl}</p>
      <p className="line-clamp-1 text-base text-[#1a0dab]">{displayTitle}</p>
      <p className="text-muted-foreground line-clamp-2 text-sm">{displayDesc}</p>
    </div>
  )
}


function SeoScoreChecklist({ seo }: { seo: SimpleSeo }) {
  const t = useTranslations("ui")
  const title = (seo.title ?? "").trim()
  const desc = (seo.description ?? "").trim()
  const kw = (seo.focus_keyword ?? "").trim().toLowerCase()
  const checks = [
    { id: "title", ok: title.length > 0 && title.length <= TITLE_MAX, label: t("seo_check_title") },
    { id: "desc", ok: desc.length > 0 && desc.length <= DESCRIPTION_MAX, label: t("seo_check_description") },
    { id: "kw", ok: kw.length > 0, label: t("seo_check_keyword") },
    {
      id: "kw_title",
      ok: kw.length > 0 && title.toLowerCase().includes(kw),
      label: t("seo_check_keyword_in_title"),
    },
    {
      id: "kw_desc",
      ok: kw.length > 0 && desc.toLowerCase().includes(kw),
      label: t("seo_check_keyword_in_description"),
    },
    { id: "og", ok: Boolean((seo.og_title ?? "").trim() || (seo.og_image ?? "").trim()), label: t("seo_check_og") },
    { id: "schema", ok: Boolean((seo.schema_type ?? "").trim()), label: t("seo_check_schema") },
  ]
  const passed = checks.filter((c) => c.ok).length
  const score = Math.round((passed / checks.length) * 100)
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{t("seo_score")}</p>
        <span className={cn("text-sm font-semibold tabular-nums", score >= 70 ? "text-green-700" : score >= 40 ? "text-amber-700" : "text-destructive")}>
          {score}
        </span>
      </div>
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.id} className={cn("text-xs", c.ok ? "text-green-700" : "text-muted-foreground")}>
            {c.ok ? "✓" : "○"} {c.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Shared SEO box for post, page and product editors. */
export function SimpleSeoFields({
  seo,
  onChange,
  className,
  previewUrl,
  siteName,
}: {
  seo: SimpleSeo | null | undefined
  onChange: (next: SimpleSeo) => void
  className?: string
  /** Shown in SERP preview (path or full URL). */
  previewUrl?: string
  siteName?: string
}) {
  const t = useTranslations("ui")
  const locale = normalizeUiLocale(useLocale())
  const id = useId()
  const value = seo ?? {}
  const patch = (partial: Partial<SimpleSeo>) => onChange({ ...value, ...partial })

  const serpTitle = value.title?.trim() || ""
  const serpDesc = value.description?.trim() || ""

  return (
    <div className={cn("space-y-3 rounded-xl border p-4", className)}>
      <p className="text-sm font-semibold">{t("seo_panel")}</p>

      <SerpPreview title={serpTitle} description={serpDesc} url={previewUrl ?? ""} siteName={siteName} />
      <SeoScoreChecklist seo={value} />

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

      <div className="border-t pt-3">
        <p className="mb-2 text-sm font-medium">{t("seo_og_section")}</p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`${id}-og-title`}>{t("seo_og_title")}</Label>
            <Input
              id={`${id}-og-title`}
              value={value.og_title ?? ""}
              onChange={(e) => patch({ og_title: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-og-desc`}>{t("seo_og_description")}</Label>
            <Textarea
              id={`${id}-og-desc`}
              rows={2}
              value={value.og_description ?? ""}
              onChange={(e) => patch({ og_description: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-og-image`}>{t("seo_og_image")}</Label>
            <Input
              id={`${id}-og-image`}
              dir="ltr"
              value={value.og_image ?? ""}
              onChange={(e) => patch({ og_image: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-schema`}>{t("seo_schema_type")}</Label>
            <Select value={value.schema_type ?? ""} onValueChange={(v) => patch({ schema_type: v || undefined })}>
              <SelectTrigger id={`${id}-schema`}>
                <SelectValue placeholder={t("seo_schema_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {SCHEMA_TYPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  )
}
