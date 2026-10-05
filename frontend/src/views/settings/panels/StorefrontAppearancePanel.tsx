"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"

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
import { api } from "@/lib/api"
import { SettingsSaveBar } from "@/views/settings/use-tenant-settings"

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
    api<{ data: Appearance }>("/api/v1/shop/storefront-appearance")
      .then((res) => setDraft(res.data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "error"))
  }, [])

  async function save() {
    if (!draft) return
    setPending(true)
    try {
      const res = await api<{ data: Appearance }>("/api/v1/shop/storefront-appearance", {
        method: "PUT",
        json: draft,
      })
      setDraft(res.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "error")
    } finally {
      setPending(false)
    }
  }

  if (!draft) return <p className="text-muted-foreground text-sm">{t("loading")}</p>

  const typography = asObj(draft.typography)
  const general = asObj(draft.general)
  const header = asObj(draft.header)
  const footer = asObj(draft.footer)
  const commerce = asObj(draft.commerce)
  const archive = asObj(draft.archive)
  const bottomMenu = asList(general.mobile_bottom_menu)
  const footerLinks = asList(footer.footer_links)
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
              <FieldText
                label={t("logo_404_url")}
                value={String(general.logo_404_url ?? "")}
                dir="ltr"
                onChange={(v) => setSection("general", { logo_404_url: v })}
              />
              <FieldText
                label={t("bg_404")}
                value={String(general.bg_404 ?? "")}
                dir="ltr"
                onChange={(v) => setSection("general", { bg_404: v })}
              />
              <FieldText
                label={t("loading_icon_url")}
                value={String(general.loading_icon_url ?? "")}
                dir="ltr"
                onChange={(v) => setSection("general", { loading_icon_url: v })}
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
              <FieldText
                label={t("banner_image_desktop")}
                value={String(header.banner_image_desktop ?? "")}
                dir="ltr"
                onChange={(v) => setSection("header", { banner_image_desktop: v })}
              />
              <FieldText
                label={t("banner_image_mobile")}
                value={String(header.banner_image_mobile ?? "")}
                dir="ltr"
                onChange={(v) => setSection("header", { banner_image_mobile: v })}
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
              <FieldText
                label={t("about")}
                value={String(footer.about ?? "")}
                multiline
                onChange={(v) => setSection("footer", { about: v })}
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
                label={t("copyright")}
                value={String(footer.copyright ?? "")}
                multiline
                onChange={(v) => setSection("footer", { copyright: v })}
              />
              <FieldText
                label={t("copyright_sub")}
                value={String(footer.copyright_sub ?? "")}
                multiline
                onChange={(v) => setSection("footer", { copyright_sub: v })}
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
                label={t("address")}
                value={String(footer.address ?? "")}
                multiline
                onChange={(v) => setSection("footer", { address: v })}
              />
              {(
                [
                  "social_telegram",
                  "social_twitter",
                  "social_whatsapp",
                  "social_facebook",
                  "social_igap",
                  "social_rubika",
                  "social_soroush",
                  "social_bale",
                  "social_eitaa",
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
              <RepeaterShell
                title={t("payment_methods")}
                items={payments}
                onAdd={() => setSection("footer", { payment_methods: [...payments, { title: "", image: "" }] })}
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
                    <FieldText
                      label={t("item_image")}
                      value={String(item.image ?? "")}
                      dir="ltr"
                      onChange={(v) => {
                        const next = payments.map((row, i) => (i === index ? { ...row, image: v } : row))
                        setSection("footer", { payment_methods: next })
                      }}
                    />
                  </>
                )}
              </RepeaterShell>
              <FieldSwitch
                label={t("show_developer_credit")}
                checked={Boolean(footer.show_developer_credit ?? true)}
                onChange={(v) => setSection("footer", { show_developer_credit: v })}
              />
              <FieldText
                label={t("developer_title")}
                value={String(footer.developer_title ?? "")}
                onChange={(v) => setSection("footer", { developer_title: v })}
              />
              <FieldText
                label={t("developer_name")}
                value={String(footer.developer_name ?? "")}
                onChange={(v) => setSection("footer", { developer_name: v })}
              />
              <FieldText
                label={t("developer_link")}
                value={String(footer.developer_link ?? "")}
                dir="ltr"
                onChange={(v) => setSection("footer", { developer_link: v })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commerce" className="space-y-4">
          <Card>
            <CardContent className="grid max-w-xl gap-3 pt-6">
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
      </Tabs>

      <SettingsSaveBar onSave={() => void save()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
