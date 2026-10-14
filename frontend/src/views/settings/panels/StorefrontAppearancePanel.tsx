"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useLocale, useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MediaPickerField } from "@/components/content/MediaPickerField"
import { api } from "@/lib/api"
import { SettingsSaveBar } from "@/views/settings/use-tenant-settings"
import { CLASSIC_TEXT_GROUPS, CLASSIC_TEXTS } from "@/themes/ecommerce-classic/lib/texts"

const SERVICE_ICON_PRESETS = ["truck", "card", "shield", "badge"] as const

type Dict = Record<string, unknown>
type Appearance = Dict

const COLOR_KEYS = [
  "primary_color",
  "secondary_color",
  "accent_color",
  "text1_color",
  "text2_color",
  "text3_color",
  "navy_color",
  "surface_color",
  "header_bg",
  "footer_bg",
  "border_color",
] as const

const COLOR_FALLBACKS: Record<(typeof COLOR_KEYS)[number], string> = {
  primary_color: "#e775ae",
  secondary_color: "#021959",
  accent_color: "#dc5f9d",
  text1_color: "#021959",
  text2_color: "#4d5e8a",
  text3_color: "#8b97b3",
  navy_color: "#021959",
  surface_color: "#f3f5f8",
  header_bg: "#ffffff",
  footer_bg: "#ffffff",
  border_color: "#e8edf3",
}

function asObj(v: unknown): Dict {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {}
}

function asList(v: unknown): Dict[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Dict[]) : []
}

function FieldSwitch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function FieldText({
  label,
  value,
  onChange,
  multiline,
  dir,
  type,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  dir?: "ltr" | "rtl"
  type?: string
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-sm">{label}</Label>
      {multiline ? (
        <Textarea value={value} dir={dir} onChange={(e) => onChange(e.target.value)} rows={3} />
      ) : (
        <Input type={type ?? "text"} value={value} dir={dir} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}

function FieldNumber({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-sm">{label}</Label>
      <Input type="number" dir="ltr" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

function FieldColor({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium">{label}</span>
      <Input type="color" dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-sm">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** «متن‌ها» tab: every storefront copy string, grouped, with FA/EN labels and the built-in default as placeholder. */
function TextsEditor({
  texts,
  onChange,
  hint,
  groupLabel,
}: {
  texts: Dict
  onChange: (group: string, key: string, value: string) => void
  hint: string
  groupLabel: string
}) {
  const locale = useLocale()
  const en = locale.startsWith("en")
  const [group, setGroup] = useState(CLASSIC_TEXT_GROUPS[0]?.id ?? "header")
  const entries = CLASSIC_TEXTS.filter((e) => e.group === group)
  const section = asObj(texts[group])
  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm leading-6">{hint}</p>
      <FieldSelect
        label={groupLabel}
        value={group}
        options={CLASSIC_TEXT_GROUPS.map((g) => ({ value: g.id, label: en ? g.labelEn : g.labelFa }))}
        onChange={setGroup}
      />
      {entries.map((e) => (
        <div key={e.key} className="grid gap-1">
          <Label className="text-sm">{en ? e.labelEn : e.labelFa}</Label>
          <Input
            value={String(section[e.key] ?? "")}
            placeholder={e.fa}
            onChange={(ev) => onChange(group, e.key, ev.target.value)}
          />
        </div>
      ))}
    </div>
  )
}

function RepeaterShell({
  title,
  items,
  onAdd,
  onRemove,
  children,
}: {
  title: string
  items: Dict[]
  onAdd: () => void
  onRemove: (index: number) => void
  children: (item: Dict, index: number) => ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{title}</h4>
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          +
        </Button>
      </div>
      {items.map((item, index) => (
        <div key={index} className="grid gap-2 rounded-lg border border-border p-3">
          {children(item, index)}
          <Button type="button" size="sm" variant="ghost" onClick={() => onRemove(index)}>
            حذف
          </Button>
        </div>
      ))}
    </div>
  )
}

export function StorefrontAppearancePanel() {
  const t = useTranslations("settings_hub.storefront_appearance")
  const [draft, setDraft] = useState<Appearance | null>(null)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState("colors")

  useEffect(() => {
    api<Appearance>("/api/v1/shop/storefront-appearance")
      .then((res) => setDraft(res))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "error"))
  }, [])

  async function save() {
    if (!draft) return
    setPending(true)
    try {
      const res = await api<Appearance>("/api/v1/shop/storefront-appearance", {
        method: "PUT",
        json: draft,
      })
      setDraft(res)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "error")
    } finally {
      setPending(false)
    }
  }

  if (!draft) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">{error ? error : t("loading")}</p>
      </div>
    )
  }

  const typography = asObj(draft.typography)
  const general = asObj(draft.general)
  const header = asObj(draft.header)
  const footer = asObj(draft.footer)
  const commerce = asObj(draft.commerce)
  const archive = asObj(draft.archive)
  const home = asObj(draft.home)
  const texts = asObj(draft.texts)
  const bottomMenu = asList(general.mobile_bottom_menu)
  const footerLinks = asList(footer.footer_links)
  const brandLinks = asList(footer.brand_links)
  const serviceBadges = asList(footer.service_badges)
  const popularKeywords = asList(header.popular_search_keywords)
  const features = asList(commerce.features)
  const payments = asList(footer.payment_methods)

  const setSection = (section: string, patch: Dict) => {
    setDraft({ ...draft, [section]: { ...asObj(draft[section]), ...patch } })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="mb-3 flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="colors">{t("tab_colors")}</TabsTrigger>
          <TabsTrigger value="general">{t("tab_general")}</TabsTrigger>
          <TabsTrigger value="header">{t("tab_header")}</TabsTrigger>
          <TabsTrigger value="footer">{t("tab_footer")}</TabsTrigger>
          <TabsTrigger value="commerce">{t("tab_commerce")}</TabsTrigger>
          <TabsTrigger value="archive">{t("tab_archive")}</TabsTrigger>
          <TabsTrigger value="home">{t("tab_home")}</TabsTrigger>
          <TabsTrigger value="texts">{t("tab_texts")}</TabsTrigger>
        </TabsList>

        <TabsContent value="colors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("tab_colors")}</CardTitle>
              <CardDescription>{t("colors_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {COLOR_KEYS.map((key) => (
                <FieldColor
                  key={key}
                  label={t(key)}
                  value={String(draft[key] ?? COLOR_FALLBACKS[key])}
                  onChange={(v) => setDraft({ ...draft, [key]: v })}
                />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("typography_title")}</CardTitle>
            </CardHeader>
            <CardContent className="grid max-w-xl gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label>{t("font_family")}</Label>
                <Select
                  value={String(typography.font_family ?? "yekan-bakh")}
                  onValueChange={(v) => setSection("typography", { font_family: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["yekan-bakh", "vazirmatn", "iran-sans", "system"].map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <FieldNumber
                label={t("font_size")}
                value={Number(typography.font_size ?? 14)}
                onChange={(v) => setSection("typography", { font_size: v })}
              />
              <FieldNumber
                label={t("font_weight")}
                value={Number(typography.font_weight ?? 400)}
                onChange={(v) => setSection("typography", { font_weight: v })}
              />
              <FieldNumber
                label={t("line_height")}
                value={Number(typography.line_height ?? 1.7)}
                onChange={(v) => setSection("typography", { line_height: v })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardContent className="grid max-w-xl gap-3 pt-6">
              <FieldColor
                label={t("rating_color")}
                value={String(typography.rating_color ?? "#f9bc00")}
                onChange={(v) => setSection("typography", { rating_color: v })}
              />
              <FieldNumber
                label={t("logo_height_desktop")}
                value={Number(general.logo_height_desktop ?? 48)}
                onChange={(v) => setSection("general", { logo_height_desktop: v })}
              />
              <FieldNumber
                label={t("logo_height_mobile")}
                value={Number(general.logo_height_mobile ?? 36)}
                onChange={(v) => setSection("general", { logo_height_mobile: v })}
              />
              <MediaPickerField
                label={t("logo_404_url")}
                imageUrl={String(general.logo_404_url ?? "")}
                onPick={(item) => setSection("general", { logo_404_url: item.url })}
                onClear={() => setSection("general", { logo_404_url: "" })}
              />
              <MediaPickerField
                label={t("bg_404")}
                imageUrl={String(general.bg_404 ?? "")}
                onPick={(item) => setSection("general", { bg_404: item.url })}
                onClear={() => setSection("general", { bg_404: "" })}
              />
              <MediaPickerField
                label={t("loading_icon_url")}
                imageUrl={String(general.loading_icon_url ?? "")}
                onPick={(item) => setSection("general", { loading_icon_url: item.url })}
                onClear={() => setSection("general", { loading_icon_url: "" })}
              />
              <FieldSwitch
                label={t("mobile_bottom_menu_enabled")}
                checked={Boolean(general.mobile_bottom_menu_enabled)}
                onChange={(v) => setSection("general", { mobile_bottom_menu_enabled: v })}
              />
              <RepeaterShell
                title={t("mobile_bottom_menu")}
                items={bottomMenu}
                onAdd={() =>
                  setSection("general", {
                    mobile_bottom_menu: [...bottomMenu, { label: "", href: "/", icon: "home" }],
                  })
                }
                onRemove={(index) =>
                  setSection("general", {
                    mobile_bottom_menu: bottomMenu.filter((_, i) => i !== index),
                  })
                }
              >
                {(item, index) => (
                  <>
                    <FieldText
                      label={t("item_label")}
                      value={String(item.label ?? "")}
                      onChange={(v) => {
                        const next = bottomMenu.map((row, i) => (i === index ? { ...row, label: v } : row))
                        setSection("general", { mobile_bottom_menu: next })
                      }}
                    />
                    <FieldText
                      label={t("item_href")}
                      value={String(item.href ?? "")}
                      dir="ltr"
                      onChange={(v) => {
                        const next = bottomMenu.map((row, i) => (i === index ? { ...row, href: v } : row))
                        setSection("general", { mobile_bottom_menu: next })
                      }}
                    />
                  </>
                )}
              </RepeaterShell>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="header" className="space-y-4">
          <Card>
            <CardContent className="grid max-w-xl gap-3 pt-6">
              <FieldSelect
                label={t("header_style")}
                value={String(draft.header_style ?? "classic")}
                options={[
                  { value: "classic", label: t("header_style_classic") },
                  { value: "compact", label: t("header_style_compact") },
                  { value: "centered", label: t("header_style_centered") },
                ]}
                onChange={(v) => setDraft({ ...draft, header_style: v })}
              />
              <FieldSwitch
                label={t("show_top_bar")}
                checked={draft.show_top_bar !== false}
                onChange={(v) => setDraft({ ...draft, show_top_bar: v })}
              />
              <FieldText
                label={t("top_bar_text")}
                value={String(draft.top_bar_text ?? "")}
                onChange={(v) => setDraft({ ...draft, top_bar_text: v })}
              />
              <FieldSelect
                label={t("banner_type")}
                value={String(header.banner_type ?? "image")}
                options={[
                  { value: "image", label: t("banner_type_image") },
                  { value: "text", label: t("banner_type_text") },
                ]}
                onChange={(v) => setSection("header", { banner_type: v })}
              />
              <FieldSwitch
                label={t("ajax_search")}
                checked={Boolean(header.ajax_search ?? true)}
                onChange={(v) => setSection("header", { ajax_search: v })}
              />
              <FieldSwitch
                label={t("ajax_search_mobile")}
                checked={Boolean(header.ajax_search_mobile ?? true)}
                onChange={(v) => setSection("header", { ajax_search_mobile: v })}
              />
              <FieldText
                label={t("search_placeholder")}
                value={String(header.search_placeholder ?? "")}
                onChange={(v) => setSection("header", { search_placeholder: v })}
              />
              <RepeaterShell
                title={t("popular_search_keywords")}
                items={popularKeywords}
                onAdd={() =>
                  setSection("header", {
                    popular_search_keywords: [...popularKeywords, { label: "" }],
                  })
                }
                onRemove={(index) =>
                  setSection("header", {
                    popular_search_keywords: popularKeywords.filter((_, i) => i !== index),
                  })
                }
              >
                {(item, index) => (
                  <FieldText
                    label={t("popular_keyword")}
                    value={String(item.label ?? item.title ?? "")}
                    onChange={(v) => {
                      const next = popularKeywords.map((row, i) => (i === index ? { ...row, label: v } : row))
                      setSection("header", { popular_search_keywords: next })
                    }}
                  />
                )}
              </RepeaterShell>
              <MediaPickerField
                label={t("search_banner_image")}
                imageUrl={String(header.search_banner_image ?? "")}
                onPick={(item) => setSection("header", { search_banner_image: item.url })}
                onClear={() => setSection("header", { search_banner_image: "" })}
              />
              <FieldText
                label={t("search_banner_link")}
                value={String(header.search_banner_link ?? "")}
                dir="ltr"
                onChange={(v) => setSection("header", { search_banner_link: v })}
              />
              <FieldSwitch
                label={t("voice_search")}
                checked={Boolean(header.voice_search)}
                onChange={(v) => setSection("header", { voice_search: v })}
              />
              <FieldSwitch
                label={t("quick_voice_search")}
                checked={Boolean(header.quick_voice_search)}
                onChange={(v) => setSection("header", { quick_voice_search: v })}
              />
              <FieldText
                label={t("voice_excluded_paths")}
                value={Array.isArray(header.voice_excluded_paths)
                  ? header.voice_excluded_paths.join("\n")
                  : String(header.voice_excluded_paths ?? "")}
                multiline
                dir="ltr"
                onChange={(v) => setSection("header", { voice_excluded_paths: v })}
              />
              <FieldSwitch
                label={t("search_sku")}
                checked={Boolean(header.search_sku)}
                onChange={(v) => setSection("header", { search_sku: v })}
              />
              <FieldSwitch
                label={t("search_title_only")}
                checked={Boolean(header.search_title_only)}
                onChange={(v) => setSection("header", { search_title_only: v })}
              />
              <hr className="border-border" />
              <FieldSwitch
                label={t("deals_enabled")}
                checked={Boolean(header.deals_enabled ?? true)}
                onChange={(v) => setSection("header", { deals_enabled: v })}
              />
              <FieldText
                label={t("deals_title")}
                value={String(header.deals_title ?? "")}
                onChange={(v) => setSection("header", { deals_title: v })}
              />
              <FieldText
                label={t("deals_subtitle")}
                value={String(header.deals_subtitle ?? "")}
                onChange={(v) => setSection("header", { deals_subtitle: v })}
              />
              <FieldText
                label={t("deals_link")}
                value={String(header.deals_link ?? "")}
                dir="ltr"
                onChange={(v) => setSection("header", { deals_link: v })}
              />
              <FieldText
                label={t("deals_timer_end")}
                value={String(header.deals_timer_end ?? "")}
                dir="ltr"
                onChange={(v) => setSection("header", { deals_timer_end: v })}
              />
              <FieldText
                label={t("deals_timer_title")}
                value={String(header.deals_timer_title ?? "")}
                onChange={(v) => setSection("header", { deals_timer_title: v })}
              />
              <hr className="border-border" />
              <FieldSwitch
                label={t("mega_menu")}
                checked={Boolean(header.mega_menu ?? draft.mega_menu ?? true)}
                onChange={(v) =>
                  setDraft({
                    ...draft,
                    mega_menu: v,
                    header: { ...header, mega_menu: v },
                  })
                }
              />
              <FieldText
                label={t("mega_menu_title")}
                value={String(header.mega_menu_title ?? "")}
                onChange={(v) => setSection("header", { mega_menu_title: v })}
              />
              <FieldSwitch
                label={t("sticky_desktop")}
                checked={Boolean(header.sticky_desktop ?? true)}
                onChange={(v) => setSection("header", { sticky_desktop: v })}
              />
              <hr className="border-border" />
              <FieldSwitch
                label={t("banner_enabled")}
                checked={Boolean(header.banner_enabled)}
                onChange={(v) => setSection("header", { banner_enabled: v })}
              />
              <FieldText
                label={t("banner_link")}
                value={String(header.banner_link ?? "")}
                dir="ltr"
                onChange={(v) => setSection("header", { banner_link: v })}
              />
              <MediaPickerField
                label={t("banner_image_desktop")}
                imageUrl={String(header.banner_image_desktop ?? "")}
                onPick={(item) => setSection("header", { banner_image_desktop: item.url })}
                onClear={() => setSection("header", { banner_image_desktop: "" })}
              />
              <MediaPickerField
                label={t("banner_image_mobile")}
                imageUrl={String(header.banner_image_mobile ?? "")}
                onPick={(item) => setSection("header", { banner_image_mobile: item.url })}
                onClear={() => setSection("header", { banner_image_mobile: "" })}
              />
              <FieldText
                label={t("banner_text")}
                value={String(header.banner_text ?? "")}
                multiline
                onChange={(v) => setSection("header", { banner_text: v })}
              />
              <div className="grid grid-cols-2 gap-3">
                <FieldColor
                  label={t("banner_bg")}
                  value={String(header.banner_bg ?? "#021959")}
                  onChange={(v) => setSection("header", { banner_bg: v })}
                />
                <FieldColor
                  label={t("banner_text_color")}
                  value={String(header.banner_text_color ?? "#ffffff")}
                  onChange={(v) => setSection("header", { banner_text_color: v })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="footer" className="space-y-4">
          <Card>
            <CardContent className="grid max-w-2xl gap-3 pt-6">
              <p className="text-muted-foreground text-sm leading-6">{t("copyright_fixed_hint")}</p>
              <FieldText
                label={t("copyright_years")}
                value={String(footer.copyright_years ?? "")}
                dir="ltr"
                onChange={(v) => setSection("footer", { copyright_years: v })}
              />
              <FieldNumber
                label={t("footer_columns")}
                value={Number(draft.footer_columns ?? 4)}
                onChange={(v) => setDraft({ ...draft, footer_columns: Math.max(1, Math.min(6, v || 4)) })}
              />
              <FieldText
                label={t("support_email_title")}
                value={String(footer.support_email_title ?? "")}
                onChange={(v) => setSection("footer", { support_email_title: v })}
              />
              <FieldText
                label={t("address_title")}
                value={String(footer.address_title ?? "")}
                onChange={(v) => setSection("footer", { address_title: v })}
              />

              <RepeaterShell
                title={t("service_badges")}
                items={serviceBadges}
                onAdd={() =>
                  setSection("footer", {
                    service_badges: [...serviceBadges, { title: "", text: "", icon: "truck" }],
                  })
                }
                onRemove={(index) =>
                  setSection("footer", { service_badges: serviceBadges.filter((_, i) => i !== index) })
                }
              >
                {(item, index) => (
                  <>
                    <FieldText
                      label={t("item_label")}
                      value={String(item.title ?? "")}
                      onChange={(v) => {
                        const next = serviceBadges.map((row, i) => (i === index ? { ...row, title: v } : row))
                        setSection("footer", { service_badges: next })
                      }}
                    />
                    <FieldText
                      label={t("service_badge_text")}
                      value={String(item.text ?? "")}
                      onChange={(v) => {
                        const next = serviceBadges.map((row, i) => (i === index ? { ...row, text: v } : row))
                        setSection("footer", { service_badges: next })
                      }}
                    />
                    <div className="grid gap-1">
                      <Label className="text-sm">{t("service_badge_icon")}</Label>
                      <Select
                        value={
                          SERVICE_ICON_PRESETS.includes(
                            String(item.icon ?? "truck") as (typeof SERVICE_ICON_PRESETS)[number],
                          )
                            ? String(item.icon)
                            : "custom"
                        }
                        onValueChange={(v) => {
                          const next = serviceBadges.map((row, i) =>
                            i === index
                              ? { ...row, icon: v === "custom" ? String(row.icon ?? "") : v }
                              : row,
                          )
                          setSection("footer", { service_badges: next })
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SERVICE_ICON_PRESETS.map((key) => (
                            <SelectItem key={key} value={key}>
                              {key}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">image</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {!SERVICE_ICON_PRESETS.includes(
                      String(item.icon ?? "") as (typeof SERVICE_ICON_PRESETS)[number],
                    ) || String(item.icon ?? "").startsWith("http") || String(item.icon ?? "").startsWith("/") ? (
                      <MediaPickerField
                        label={t("item_image")}
                        imageUrl={
                          SERVICE_ICON_PRESETS.includes(
                            String(item.icon ?? "") as (typeof SERVICE_ICON_PRESETS)[number],
                          )
                            ? ""
                            : String(item.icon ?? item.image ?? "")
                        }
                        onPick={(picked) => {
                          const next = serviceBadges.map((row, i) =>
                            i === index ? { ...row, icon: picked.url } : row,
                          )
                          setSection("footer", { service_badges: next })
                        }}
                        onClear={() => {
                          const next = serviceBadges.map((row, i) =>
                            i === index ? { ...row, icon: "truck" } : row,
                          )
                          setSection("footer", { service_badges: next })
                        }}
                      />
                    ) : null}
                  </>
                )}
              </RepeaterShell>

              <RepeaterShell
                title={t("footer_links")}
                items={footerLinks}
                onAdd={() =>
                  setSection("footer", {
                    footer_links: [...footerLinks, { title: "", links: [{ label: "", href: "/" }] }],
                  })
                }
                onRemove={(index) =>
                  setSection("footer", { footer_links: footerLinks.filter((_, i) => i !== index) })
                }
              >
                {(item, index) => (
                  <>
                    <FieldText
                      label={t("column_title")}
                      value={String(item.title ?? "")}
                      onChange={(v) => {
                        const next = footerLinks.map((row, i) => (i === index ? { ...row, title: v } : row))
                        setSection("footer", { footer_links: next })
                      }}
                    />
                    <FieldText
                      label={t("column_links_hint")}
                      value={asList(item.links)
                        .map((l) => `${l.label ?? ""}|${l.href ?? ""}`)
                        .join("\n")}
                      multiline
                      onChange={(v) => {
                        const links = v
                          .split("\n")
                          .map((line) => line.trim())
                          .filter(Boolean)
                          .map((line) => {
                            const [label, href] = line.split("|").map((s) => s.trim())
                            return { label: label ?? "", href: href ?? "/" }
                          })
                        const next = footerLinks.map((row, i) => (i === index ? { ...row, links } : row))
                        setSection("footer", { footer_links: next })
                      }}
                    />
                  </>
                )}
              </RepeaterShell>

              <FieldText
                label={t("brands_title")}
                value={String(footer.brands_title ?? "")}
                onChange={(v) => setSection("footer", { brands_title: v })}
              />
              <FieldText
                label={t("brand_links_hint")}
                value={brandLinks.map((l) => `${l.label ?? ""}|${l.href ?? ""}`).join("\n")}
                multiline
                onChange={(v) => {
                  const links = v
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => {
                      const [label, href] = line.split("|").map((s) => s.trim())
                      return { label: label ?? "", href: href ?? "/" }
                    })
                  setSection("footer", { brand_links: links })
                }}
              />

              <FieldText
                label={t("bestsellers_title")}
                value={String(footer.bestsellers_title ?? "")}
                onChange={(v) => setSection("footer", { bestsellers_title: v })}
              />
              <FieldNumber
                label={t("bestsellers_limit")}
                value={Number(footer.bestsellers_limit ?? 6)}
                onChange={(v) => setSection("footer", { bestsellers_limit: Math.max(1, Math.min(20, v || 6)) })}
              />
              <FieldSwitch
                label={t("show_recently_viewed")}
                checked={footer.show_recently_viewed !== false}
                onChange={(v) => setSection("footer", { show_recently_viewed: v })}
              />
              <FieldText
                label={t("recently_viewed_title")}
                value={String(footer.recently_viewed_title ?? "")}
                onChange={(v) => setSection("footer", { recently_viewed_title: v })}
              />

              <FieldText
                label={t("trust_title")}
                value={String(footer.trust_title ?? "")}
                onChange={(v) => setSection("footer", { trust_title: v })}
              />
              <FieldText
                label={t("trust_text")}
                value={String(footer.trust_text ?? "")}
                multiline
                onChange={(v) => setSection("footer", { trust_text: v })}
              />
              <FieldText
                label={t("enamad_html")}
                value={String(footer.enamad_html ?? "")}
                multiline
                dir="ltr"
                onChange={(v) => setSection("footer", { enamad_html: v })}
              />
              <FieldText
                label={t("samandehi_html")}
                value={String(footer.samandehi_html ?? "")}
                multiline
                dir="ltr"
                onChange={(v) => setSection("footer", { samandehi_html: v })}
              />
              <FieldText
                label={t("ecommerce_badge_html")}
                value={String(footer.ecommerce_badge_html ?? "")}
                multiline
                dir="ltr"
                onChange={(v) => setSection("footer", { ecommerce_badge_html: v })}
              />

              <FieldText
                label={t("social_title")}
                value={String(footer.social_title ?? "")}
                onChange={(v) => setSection("footer", { social_title: v })}
              />
              {(
                [
                  "social_instagram",
                  "social_telegram",
                  "social_whatsapp",
                  "social_bale",
                  "social_eitaa",
                  "social_rubika",
                  "social_igap",
                  "social_soroush",
                  "social_facebook",
                  "social_twitter",
                ] as const
              ).map((key) => (
                <FieldText
                  key={key}
                  label={t(key)}
                  value={String(footer[key] ?? "")}
                  dir="ltr"
                  onChange={(v) => setSection("footer", { [key]: v })}
                />
              ))}

              <FieldText
                label={t("contact_title")}
                value={String(footer.contact_title ?? "")}
                onChange={(v) => setSection("footer", { contact_title: v })}
              />
              <FieldText
                label={t("contact_tagline_1")}
                value={String(footer.contact_tagline_1 ?? "")}
                onChange={(v) => setSection("footer", { contact_tagline_1: v })}
              />
              <FieldText
                label={t("contact_tagline_2")}
                value={String(footer.contact_tagline_2 ?? "")}
                onChange={(v) => setSection("footer", { contact_tagline_2: v })}
              />
              <FieldText
                label={t("support_phone")}
                value={String(footer.support_phone ?? "")}
                dir="ltr"
                onChange={(v) => setSection("footer", { support_phone: v })}
              />
              <FieldText
                label={t("support_email")}
                value={String(footer.support_email ?? "")}
                dir="ltr"
                onChange={(v) => setSection("footer", { support_email: v })}
              />
              <FieldText
                label={t("support_hours")}
                value={String(footer.support_hours ?? "")}
                onChange={(v) => setSection("footer", { support_hours: v })}
              />
              <FieldText
                label={t("address")}
                value={String(footer.address ?? "")}
                multiline
                onChange={(v) => setSection("footer", { address: v })}
              />

              <MediaPickerField
                label={t("footer_logo")}
                imageUrl={String(footer.footer_logo ?? "")}
                onPick={(item) => setSection("footer", { footer_logo: item.url })}
                onClear={() => setSection("footer", { footer_logo: "" })}
              />
              <FieldText
                label={t("about")}
                value={String(footer.about ?? "")}
                multiline
                onChange={(v) => setSection("footer", { about: v })}
              />

              <RepeaterShell
                title={t("payment_methods")}
                items={payments}
                onAdd={() =>
                  setSection("footer", { payment_methods: [...payments, { title: "", image: "", href: "" }] })
                }
                onRemove={(index) =>
                  setSection("footer", { payment_methods: payments.filter((_, i) => i !== index) })
                }
              >
                {(item, index) => (
                  <>
                    <FieldText
                      label={t("item_label")}
                      value={String(item.title ?? "")}
                      onChange={(v) => {
                        const next = payments.map((row, i) => (i === index ? { ...row, title: v } : row))
                        setSection("footer", { payment_methods: next })
                      }}
                    />
                    <MediaPickerField
                      label={t("item_image")}
                      imageUrl={String(item.image ?? "")}
                      onPick={(picked) => {
                        const next = payments.map((row, i) => (i === index ? { ...row, image: picked.url } : row))
                        setSection("footer", { payment_methods: next })
                      }}
                      onClear={() => {
                        const next = payments.map((row, i) => (i === index ? { ...row, image: "" } : row))
                        setSection("footer", { payment_methods: next })
                      }}
                    />
                    <FieldText
                      label={t("item_href")}
                      value={String(item.href ?? "")}
                      dir="ltr"
                      onChange={(v) => {
                        const next = payments.map((row, i) => (i === index ? { ...row, href: v } : row))
                        setSection("footer", { payment_methods: next })
                      }}
                    />
                  </>
                )}
              </RepeaterShell>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commerce" className="space-y-4">
          <Card>
            <CardContent className="grid max-w-xl gap-3 pt-6">
              <FieldSelect
                label={t("product_card_style")}
                value={String(draft.product_card_style ?? "classic")}
                options={[
                  { value: "classic", label: t("card_style_classic") },
                  { value: "minimal", label: t("card_style_minimal") },
                  { value: "bordered", label: t("card_style_bordered") },
                  { value: "compact", label: t("card_style_compact") },
                ]}
                onChange={(v) => setDraft({ ...draft, product_card_style: v })}
              />
              <MediaPickerField
                label={t("installment_image")}
                imageUrl={String(commerce.installment_image ?? "")}
                onPick={(item) => setSection("commerce", { installment_image: item.url })}
                onClear={() => setSection("commerce", { installment_image: "" })}
              />
              <MediaPickerField
                label={t("card_installment_image")}
                imageUrl={String(commerce.card_installment_image ?? "")}
                onPick={(item) => setSection("commerce", { card_installment_image: item.url })}
                onClear={() => setSection("commerce", { card_installment_image: "" })}
              />
              <FieldSwitch
                label={t("product_faq_tab")}
                checked={Boolean(commerce.product_faq_tab ?? true)}
                onChange={(v) => setSection("commerce", { product_faq_tab: v })}
              />
              <FieldSwitch
                label={t("product_spec_tab")}
                checked={Boolean(commerce.product_spec_tab ?? true)}
                onChange={(v) => setSection("commerce", { product_spec_tab: v })}
              />
              <FieldSwitch
                label={t("checkout_show_recipient")}
                checked={Boolean(commerce.checkout_show_recipient ?? true)}
                onChange={(v) => setSection("commerce", { checkout_show_recipient: v })}
              />
              <FieldSwitch
                label={t("checkout_show_postcode")}
                checked={Boolean(commerce.checkout_show_postcode ?? true)}
                onChange={(v) => setSection("commerce", { checkout_show_postcode: v })}
              />
              <FieldSwitch
                label={t("checkout_require_postcode")}
                checked={Boolean(commerce.checkout_require_postcode)}
                onChange={(v) => setSection("commerce", { checkout_require_postcode: v })}
              />
              <FieldSwitch
                label={t("checkout_show_note")}
                checked={Boolean(commerce.checkout_show_note ?? true)}
                onChange={(v) => setSection("commerce", { checkout_show_note: v })}
              />
              <FieldSwitch
                label={t("ajax_add_to_cart")}
                checked={Boolean(commerce.ajax_add_to_cart ?? true)}
                onChange={(v) => setSection("commerce", { ajax_add_to_cart: v })}
              />
              <FieldSwitch
                label={t("product_share")}
                checked={Boolean(commerce.product_share ?? true)}
                onChange={(v) => setSection("commerce", { product_share: v })}
              />
              <FieldSwitch
                label={t("gallery_lightbox")}
                checked={Boolean(commerce.gallery_lightbox ?? true)}
                onChange={(v) => setSection("commerce", { gallery_lightbox: v })}
              />
              <div className="grid gap-1">
                <Label>{t("gallery_thumbs")}</Label>
                <Select
                  value={String(commerce.gallery_thumbs ?? "bottom")}
                  onValueChange={(v) => setSection("commerce", { gallery_thumbs: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom">{t("gallery_thumbs_bottom")}</SelectItem>
                    <SelectItem value="side">{t("gallery_thumbs_side")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <FieldNumber
                label={t("important_attrs_count")}
                value={Number(commerce.important_attrs_count ?? 4)}
                onChange={(v) => setSection("commerce", { important_attrs_count: v })}
              />
              <RepeaterShell
                title={t("features")}
                items={features}
                onAdd={() =>
                  setSection("commerce", { features: [...features, { title: "", text: "", icon: "" }] })
                }
                onRemove={(index) =>
                  setSection("commerce", { features: features.filter((_, i) => i !== index) })
                }
              >
                {(item, index) => (
                  <>
                    <FieldText
                      label={t("item_label")}
                      value={String(item.title ?? "")}
                      onChange={(v) => {
                        const next = features.map((row, i) => (i === index ? { ...row, title: v } : row))
                        setSection("commerce", { features: next })
                      }}
                    />
                    <FieldText
                      label={t("item_text")}
                      value={String(item.text ?? "")}
                      onChange={(v) => {
                        const next = features.map((row, i) => (i === index ? { ...row, text: v } : row))
                        setSection("commerce", { features: next })
                      }}
                    />
                  </>
                )}
              </RepeaterShell>
              <FieldSwitch
                label={t("shipping_text_enabled")}
                checked={Boolean(commerce.shipping_text_enabled ?? true)}
                onChange={(v) => setSection("commerce", { shipping_text_enabled: v })}
              />
              <FieldText
                label={t("shipping_text")}
                value={String(commerce.shipping_text ?? "")}
                multiline
                onChange={(v) => setSection("commerce", { shipping_text: v })}
              />
              <hr className="border-border" />
              <FieldSwitch
                label={t("installment_enabled")}
                checked={Boolean(commerce.installment_enabled ?? true)}
                onChange={(v) => setSection("commerce", { installment_enabled: v })}
              />
              <FieldText
                label={t("installment_title")}
                value={String(commerce.installment_title ?? "")}
                onChange={(v) => setSection("commerce", { installment_title: v })}
              />
              <FieldText
                label={t("installment_text")}
                value={String(commerce.installment_text ?? "")}
                multiline
                onChange={(v) => setSection("commerce", { installment_text: v })}
              />
              <FieldText
                label={t("installment_link")}
                value={String(commerce.installment_link ?? "")}
                dir="ltr"
                onChange={(v) => setSection("commerce", { installment_link: v })}
              />
              <FieldSwitch
                label={t("card_installment_enabled")}
                checked={Boolean(commerce.card_installment_enabled ?? true)}
                onChange={(v) => setSection("commerce", { card_installment_enabled: v })}
              />
              <FieldText
                label={t("card_installment_text")}
                value={String(commerce.card_installment_text ?? "")}
                onChange={(v) => setSection("commerce", { card_installment_text: v })}
              />
              <hr className="border-border" />
              <FieldSwitch
                label={t("sticky_cart_mobile")}
                checked={Boolean(commerce.sticky_cart_mobile ?? true)}
                onChange={(v) => setSection("commerce", { sticky_cart_mobile: v })}
              />
              <FieldSwitch
                label={t("sticky_cart_desktop")}
                checked={Boolean(commerce.sticky_cart_desktop)}
                onChange={(v) => setSection("commerce", { sticky_cart_desktop: v })}
              />
              <div className="grid gap-1">
                <Label>{t("sticky_cart_side")}</Label>
                <Select
                  value={String(commerce.sticky_cart_side ?? "bottom")}
                  onValueChange={(v) => setSection("commerce", { sticky_cart_side: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom">{t("sticky_cart_side_bottom")}</SelectItem>
                    <SelectItem value="left">{t("sticky_cart_side_left")}</SelectItem>
                    <SelectItem value="right">{t("sticky_cart_side_right")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <FieldSwitch
                label={t("card_add_to_cart")}
                checked={Boolean(commerce.card_add_to_cart ?? true)}
                onChange={(v) => setSection("commerce", { card_add_to_cart: v })}
              />
              <FieldSwitch
                label={t("compare_enabled")}
                checked={Boolean(commerce.compare_enabled ?? true)}
                onChange={(v) => setSection("commerce", { compare_enabled: v })}
              />
              <FieldSwitch
                label={t("show_rating")}
                checked={Boolean(commerce.show_rating ?? true)}
                onChange={(v) => setSection("commerce", { show_rating: v })}
              />
              <FieldSwitch
                label={t("fake_stats_enabled")}
                checked={Boolean(commerce.fake_stats_enabled)}
                onChange={(v) => setSection("commerce", { fake_stats_enabled: v })}
              />
              <FieldNumber
                label={t("fake_stats_factor")}
                value={Number(commerce.fake_stats_factor ?? 1)}
                onChange={(v) => setSection("commerce", { fake_stats_factor: v })}
              />
              <FieldNumber
                label={t("fake_stats_sensitivity")}
                value={Number(commerce.fake_stats_sensitivity ?? 5)}
                onChange={(v) => setSection("commerce", { fake_stats_sensitivity: v })}
              />
              <div className="border-border col-span-full mt-2 border-t pt-3">
                <p className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                  {t("cart_checkout_section")}
                </p>
              </div>
              <FieldSwitch
                label={t("cart_coupon")}
                checked={Boolean(commerce.cart_coupon ?? true)}
                onChange={(v) => setSection("commerce", { cart_coupon: v })}
              />
              <FieldSwitch
                label={t("cart_sticky_summary")}
                checked={Boolean(commerce.cart_sticky_summary ?? true)}
                onChange={(v) => setSection("commerce", { cart_sticky_summary: v })}
              />
              <FieldSwitch
                label={t("cart_deals_countdown")}
                checked={Boolean(commerce.cart_deals_countdown ?? true)}
                onChange={(v) => setSection("commerce", { cart_deals_countdown: v })}
              />
              <FieldSwitch
                label={t("free_shipping_bar_enabled")}
                checked={Boolean(commerce.free_shipping_bar_enabled)}
                onChange={(v) => setSection("commerce", { free_shipping_bar_enabled: v })}
              />
              <FieldNumber
                label={t("free_shipping_threshold")}
                value={Number(commerce.free_shipping_threshold ?? 500000)}
                onChange={(v) => setSection("commerce", { free_shipping_threshold: v })}
              />
              <FieldSwitch
                label={t("checkout_coupon")}
                checked={Boolean(commerce.checkout_coupon ?? true)}
                onChange={(v) => setSection("commerce", { checkout_coupon: v })}
              />
              <FieldSwitch
                label={t("checkout_shipping_quote")}
                checked={Boolean(commerce.checkout_shipping_quote ?? true)}
                onChange={(v) => setSection("commerce", { checkout_shipping_quote: v })}
              />
              <FieldSwitch
                label={t("checkout_trust_badges")}
                checked={Boolean(commerce.checkout_trust_badges ?? true)}
                onChange={(v) => setSection("commerce", { checkout_trust_badges: v })}
              />
              <FieldSwitch
                label={t("checkout_sticky_summary")}
                checked={Boolean(commerce.checkout_sticky_summary ?? true)}
                onChange={(v) => setSection("commerce", { checkout_sticky_summary: v })}
              />
              <FieldSwitch
                label={t("checkout_require_phone")}
                checked={Boolean(commerce.checkout_require_phone ?? true)}
                onChange={(v) => setSection("commerce", { checkout_require_phone: v })}
              />
              <FieldSwitch
                label={t("wishlist_enabled")}
                checked={Boolean(commerce.wishlist_enabled ?? true)}
                onChange={(v) => setSection("commerce", { wishlist_enabled: v })}
              />
              <FieldSwitch
                label={t("order_tracking_enabled")}
                checked={Boolean(commerce.order_tracking_enabled ?? true)}
                onChange={(v) => setSection("commerce", { order_tracking_enabled: v })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="archive" className="space-y-4">
          <Card>
            <CardContent className="grid max-w-xl gap-3 pt-6">
              <FieldSwitch
                label={t("sidebar_enabled")}
                checked={Boolean(archive.sidebar_enabled ?? true)}
                onChange={(v) => setSection("archive", { sidebar_enabled: v })}
              />
              <FieldSwitch
                label={t("category_slider")}
                checked={Boolean(archive.category_slider ?? true)}
                onChange={(v) => setSection("archive", { category_slider: v })}
              />
              <FieldNumber
                label={t("product_columns")}
                value={Number(archive.product_columns ?? 3)}
                onChange={(v) => setSection("archive", { product_columns: v })}
              />
              <FieldNumber
                label={t("products_per_page")}
                value={Number(archive.products_per_page ?? 12)}
                onChange={(v) => setSection("archive", { products_per_page: v })}
              />
              <div className="grid gap-1">
                <Label>{t("default_sort")}</Label>
                <Select
                  value={String(archive.default_sort ?? "newest")}
                  onValueChange={(v) => setSection("archive", { default_sort: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">{t("sort_newest")}</SelectItem>
                    <SelectItem value="price_asc">{t("sort_price_asc")}</SelectItem>
                    <SelectItem value="price_desc">{t("sort_price_desc")}</SelectItem>
                    <SelectItem value="popular">{t("sort_popular")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <FieldSwitch
                label={t("filters_open_default")}
                checked={Boolean(archive.filters_open_default)}
                onChange={(v) => setSection("archive", { filters_open_default: v })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="home" className="space-y-4">
          <Card>
            <CardContent className="grid max-w-xl gap-3 pt-6">
              <FieldSwitch
                label={t("home_stories_from_products")}
                checked={Boolean(home.stories_from_products)}
                onChange={(v) => setSection("home", { stories_from_products: v })}
              />
              <FieldNumber
                label={t("home_stories_count")}
                value={Number(home.stories_count ?? 14)}
                onChange={(v) => setSection("home", { stories_count: Math.max(1, v || 14) })}
              />
              <FieldNumber
                label={t("home_amazing_limit")}
                value={Number(home.amazing_limit ?? 10)}
                onChange={(v) => setSection("home", { amazing_limit: Math.max(1, v || 10) })}
              />
              <FieldNumber
                label={t("home_promo_limit")}
                value={Number(home.promo_limit ?? 3)}
                onChange={(v) => setSection("home", { promo_limit: Math.max(1, v || 3) })}
              />
              <FieldNumber
                label={t("home_icon_categories_limit")}
                value={Number(home.icon_categories_limit ?? 6)}
                onChange={(v) => setSection("home", { icon_categories_limit: Math.max(1, v || 6) })}
              />
              <FieldNumber
                label={t("home_brands_limit")}
                value={Number(home.brands_limit ?? 12)}
                onChange={(v) => setSection("home", { brands_limit: Math.max(1, v || 12) })}
              />
              <FieldNumber
                label={t("home_blog_limit")}
                value={Number(home.blog_limit ?? 5)}
                onChange={(v) => setSection("home", { blog_limit: Math.max(1, v || 5) })}
              />
              <FieldNumber
                label={t("home_taste_groups")}
                value={Number(home.taste_groups ?? 3)}
                onChange={(v) => setSection("home", { taste_groups: Math.max(1, v || 3) })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="texts" className="space-y-4">
          <Card>
            <CardContent className="max-w-2xl pt-6">
              <TextsEditor
                texts={texts}
                hint={t("texts_hint")}
                groupLabel={t("texts_group")}
                onChange={(group, key, value) =>
                  setSection("texts", { [group]: { ...asObj(texts[group]), [key]: value } })
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SettingsSaveBar onSave={() => void save()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
