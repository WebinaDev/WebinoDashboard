"use client"

import { useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { usePathname } from "next/navigation"

import { MediaPickerField } from "@/components/content/MediaPickerField"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"
import { SettingsSaveBar } from "@/views/settings/use-tenant-settings"

type SeoSettings = Record<string, string | boolean | number>

type RedirectRow = {
  id: number
  from_path: string
  to_path: string
  status_code: number
  enabled: boolean
  note?: string | null
}

const TITLE_MAX = 60
const DESCRIPTION_MAX = 160

const TABS = [
  "titles",
  "social",
  "robots",
  "sitemap",
  "schema",
  "canonical",
  "redirects",
  "search_console",
] as const

type TabId = (typeof TABS)[number]

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
}: {
  title: string
  description: string
  url: string
}) {
  const t = useTranslations("settings_hub.seo_native")
  const displayTitle = title.trim() || t("serp_title_placeholder")
  const displayDesc = description.trim() || t("serp_desc_placeholder")
  const displayUrl = url.trim() || "example.com"

  return (
    <div className="bg-muted/40 space-y-1 rounded-lg border p-3 text-start">
      <p className="text-muted-foreground text-xs">{t("serp_preview")}</p>
      <p className="truncate text-sm text-[#1a0dab]" dir="ltr">
        {displayUrl}
      </p>
      <p className="line-clamp-1 text-base text-[#1a0dab]">{displayTitle}</p>
      <p className="text-muted-foreground line-clamp-2 text-sm">{displayDesc}</p>
    </div>
  )
}

function FieldSwitch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <Label className="text-sm">{label}</Label>
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function tabFromPath(pathname: string): TabId {
  if (pathname.replace(/\/$/, "").endsWith("/site/seo-redirects")) return "redirects"
  return "titles"
}

export function SeoSettingsPanel() {
  const t = useTranslations("settings_hub.seo_native")
  const locale = normalizeUiLocale(useLocale())
  const pathname = usePathname() ?? ""
  const [tab, setTab] = useState<TabId>(() => tabFromPath(pathname))
  const [draft, setDraft] = useState<SeoSettings | null>(null)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [redirects, setRedirects] = useState<RedirectRow[]>([])
  const [fromPath, setFromPath] = useState("")
  const [toPath, setToPath] = useState("")
  const [statusCode, setStatusCode] = useState("301")

  useEffect(() => {
    setTab(tabFromPath(pathname))
  }, [pathname])

  useEffect(() => {
    void Promise.all([
      api<SeoSettings>("/api/v1/seo/settings"),
      api<RedirectRow[] | { data: RedirectRow[] }>("/api/v1/seo/redirects"),
    ])
      .then(([settings, list]) => {
        setDraft(settings)
        const rows = Array.isArray(list) ? list : Array.isArray(list?.data) ? list.data : []
        setRedirects(rows)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "error"))
  }, [])

  const patch = (partial: Partial<SeoSettings>) => {
    if (!draft) return
    setDraft({ ...draft, ...partial })
  }

  const homeSerpTitle = useMemo(() => {
    if (!draft) return ""
    const home = String(draft.home_title ?? "").trim()
    if (home) return home
    return String(draft.title_template ?? "")
      .replace("{title}", t("serp_title_placeholder"))
      .replace("{separator}", String(draft.separator ?? "|"))
      .replace("{site}", "Site")
  }, [draft, t])

  async function save() {
    if (!draft) return
    setPending(true)
    setError(null)
    try {
      const res = await api<SeoSettings>("/api/v1/seo/settings", { method: "POST", json: draft })
      setDraft(res)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "error")
    } finally {
      setPending(false)
    }
  }

  async function addRedirect() {
    setPending(true)
    try {
      const res = await api<RedirectRow>("/api/v1/seo/redirects", {
        method: "POST",
        json: { from_path: fromPath, to_path: toPath, status_code: Number(statusCode), enabled: true },
      })
      setRedirects((rows) => [res, ...rows])
      setFromPath("")
      setToPath("")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "error")
    } finally {
      setPending(false)
    }
  }

  async function removeRedirect(id: number) {
    await api(`/api/v1/seo/redirects/${id}`, { method: "DELETE" })
    setRedirects((rows) => rows.filter((r) => r.id !== id))
  }

  if (!draft) {
    return <p className="text-muted-foreground text-sm">{error ? error : t("loading")}</p>
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("hub_hint")}</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="w-full">
        <TabsList className="mb-3 flex h-auto w-full flex-wrap justify-start gap-1">
          {TABS.map((id) => (
            <TabsTrigger key={id} value={id}>
              {t(`tab_${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="titles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("section_home")}</CardTitle>
              <CardDescription>{t("section_home_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid max-w-2xl gap-3">
              <SerpPreview
                title={homeSerpTitle}
                description={String(draft.home_description ?? "")}
                url="example.com/"
              />
              <div className="grid gap-1">
                <div className="flex items-center justify-between gap-2">
                  <Label>{t("home_title")}</Label>
                  <Counter value={String(draft.home_title ?? "")} max={TITLE_MAX} locale={locale} />
                </div>
                <Input
                  value={String(draft.home_title ?? "")}
                  onChange={(e) => patch({ home_title: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <div className="flex items-center justify-between gap-2">
                  <Label>{t("home_description")}</Label>
                  <Counter value={String(draft.home_description ?? "")} max={DESCRIPTION_MAX} locale={locale} />
                </div>
                <Textarea
                  rows={3}
                  value={String(draft.home_description ?? "")}
                  onChange={(e) => patch({ home_description: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("section_templates")}</CardTitle>
              <CardDescription>{t("templates_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid max-w-2xl gap-3">
              <div className="grid gap-1">
                <Label>{t("separator")}</Label>
                <Input
                  dir="ltr"
                  className="max-w-[6rem]"
                  value={String(draft.separator ?? "|")}
                  onChange={(e) => patch({ separator: e.target.value })}
                />
              </div>
              {(
                [
                  "title_template",
                  "title_template_product",
                  "title_template_post",
                  "title_template_page",
                ] as const
              ).map((key) => (
                <div key={key} className="grid gap-1">
                  <Label>{t(key)}</Label>
                  <Input
                    dir="ltr"
                    className="font-mono text-sm"
                    value={String(draft[key] ?? "")}
                    onChange={(e) => patch({ [key]: e.target.value })}
                    placeholder="{title} {separator} {site}"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="social" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("section_social")}</CardTitle>
              <CardDescription>{t("section_social_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid max-w-2xl gap-3">
              <div className="grid gap-1">
                <Label>{t("og_title")}</Label>
                <Input value={String(draft.og_title ?? "")} onChange={(e) => patch({ og_title: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label>{t("og_description")}</Label>
                <Textarea
                  rows={2}
                  value={String(draft.og_description ?? "")}
                  onChange={(e) => patch({ og_description: e.target.value })}
                />
              </div>
              <MediaPickerField
                label={t("og_image")}
                imageUrl={String(draft.og_image ?? "")}
                onPick={(item) => patch({ og_image: item.url })}
                onClear={() => patch({ og_image: "" })}
              />
              <div className="grid gap-1">
                <Label>{t("twitter_card")}</Label>
                <Select
                  value={String(draft.twitter_card ?? "summary_large_image")}
                  onValueChange={(v) => patch({ twitter_card: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="summary_large_image">summary_large_image</SelectItem>
                    <SelectItem value="summary">summary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="robots" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("section_robots")}</CardTitle>
            </CardHeader>
            <CardContent className="grid max-w-2xl gap-3">
              <div className="grid gap-1">
                <Label>{t("robots_default")}</Label>
                <Input
                  dir="ltr"
                  className="font-mono text-sm"
                  value={String(draft.robots_default ?? "index,follow")}
                  onChange={(e) => patch({ robots_default: e.target.value })}
                />
              </div>
              {(
                [
                  "noindex_search",
                  "noindex_archives",
                  "noindex_tags",
                  "noindex_authors",
                  "noindex_attachments",
                  "noindex_paginated",
                ] as const
              ).map((key) => (
                <FieldSwitch
                  key={key}
                  label={t(key)}
                  checked={Boolean(draft[key])}
                  onChange={(v) => patch({ [key]: v })}
                />
              ))}
              <div className="grid gap-1">
                <Label>{t("robots_txt_extra")}</Label>
                <Textarea
                  dir="ltr"
                  rows={6}
                  className="font-mono text-sm"
                  value={String(draft.robots_txt_extra ?? "")}
                  onChange={(e) => patch({ robots_txt_extra: e.target.value })}
                  placeholder={"User-agent: *\nDisallow: /private"}
                />
                <p className="text-muted-foreground text-xs">{t("robots_txt_extra_hint")}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sitemap" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("section_sitemap")}</CardTitle>
            </CardHeader>
            <CardContent className="grid max-w-2xl gap-3">
              {(
                [
                  "sitemap_enabled",
                  "sitemap_include_products",
                  "sitemap_include_posts",
                  "sitemap_include_pages",
                  "sitemap_include_news",
                  "sitemap_include_videos",
                ] as const
              ).map((key) => (
                <FieldSwitch
                  key={key}
                  label={t(key)}
                  checked={Boolean(draft[key])}
                  onChange={(v) => patch({ [key]: v })}
                />
              ))}
              <div className="grid gap-1">
                <Label>{t("news_publication_name")}</Label>
                <Input
                  value={String(draft.news_publication_name ?? "")}
                  onChange={(e) => patch({ news_publication_name: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <Label>{t("news_language")}</Label>
                <Input
                  dir="ltr"
                  className="max-w-[8rem]"
                  value={String(draft.news_language ?? "fa")}
                  onChange={(e) => patch({ news_language: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schema" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("section_schema")}</CardTitle>
              <CardDescription>{t("section_schema_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid max-w-2xl gap-3">
              <FieldSwitch
                label={t("schema_organization_enabled")}
                checked={Boolean(draft.schema_organization_enabled)}
                onChange={(v) => patch({ schema_organization_enabled: v })}
              />
              <FieldSwitch
                label={t("schema_website_enabled")}
                checked={Boolean(draft.schema_website_enabled)}
                onChange={(v) => patch({ schema_website_enabled: v })}
              />
              <FieldSwitch
                label={t("schema_breadcrumb_enabled")}
                checked={Boolean(draft.schema_breadcrumb_enabled)}
                onChange={(v) => patch({ schema_breadcrumb_enabled: v })}
              />
              <div className="grid gap-1">
                <Label>{t("organization_name")}</Label>
                <Input
                  value={String(draft.organization_name ?? "")}
                  onChange={(e) => patch({ organization_name: e.target.value })}
                />
              </div>
              <MediaPickerField
                label={t("organization_logo")}
                imageUrl={String(draft.organization_logo ?? "")}
                onPick={(item) => patch({ organization_logo: item.url })}
                onClear={() => patch({ organization_logo: "" })}
              />
              <div className="grid gap-1">
                <Label>{t("organization_same_as")}</Label>
                <Textarea
                  dir="ltr"
                  rows={3}
                  value={String(draft.organization_same_as ?? "")}
                  onChange={(e) => patch({ organization_same_as: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="canonical" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("section_canonical")}</CardTitle>
            </CardHeader>
            <CardContent className="grid max-w-2xl gap-3">
              <FieldSwitch
                label={t("canonical_force_https")}
                checked={Boolean(draft.canonical_force_https)}
                onChange={(v) => patch({ canonical_force_https: v })}
              />
              <FieldSwitch
                label={t("canonical_strip_params")}
                hint={t("canonical_strip_params_hint")}
                checked={Boolean(draft.canonical_strip_params)}
                onChange={(v) => patch({ canonical_strip_params: v })}
              />
              <FieldSwitch
                label={t("redirect_trailing_slash")}
                checked={Boolean(draft.redirect_trailing_slash)}
                onChange={(v) => patch({ redirect_trailing_slash: v })}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("section_breadcrumbs")}</CardTitle>
            </CardHeader>
            <CardContent className="grid max-w-2xl gap-3">
              <FieldSwitch
                label={t("breadcrumbs_enabled")}
                checked={Boolean(draft.breadcrumbs_enabled)}
                onChange={(v) => patch({ breadcrumbs_enabled: v })}
              />
              <FieldSwitch
                label={t("breadcrumbs_show_home")}
                checked={Boolean(draft.breadcrumbs_show_home)}
                onChange={(v) => patch({ breadcrumbs_show_home: v })}
              />
              <div className="grid gap-1">
                <Label>{t("breadcrumbs_home_label")}</Label>
                <Input
                  value={String(draft.breadcrumbs_home_label ?? "")}
                  onChange={(e) => patch({ breadcrumbs_home_label: e.target.value })}
                  placeholder={t("breadcrumbs_home_placeholder")}
                />
              </div>
              <div className="grid gap-1">
                <Label>{t("breadcrumbs_separator")}</Label>
                <Input
                  dir="ltr"
                  className="max-w-[6rem]"
                  value={String(draft.breadcrumbs_separator ?? "›")}
                  onChange={(e) => patch({ breadcrumbs_separator: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="redirects" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("redirects_title")}</CardTitle>
              <CardDescription>{t("redirects_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-4">
                <Input
                  dir="ltr"
                  placeholder="/old"
                  value={fromPath}
                  onChange={(e) => setFromPath(e.target.value)}
                />
                <Input dir="ltr" placeholder="/new" value={toPath} onChange={(e) => setToPath(e.target.value)} />
                <Select value={statusCode} onValueChange={setStatusCode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["301", "302", "307", "308"].map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" onClick={() => void addRedirect()} disabled={pending || !fromPath || !toPath}>
                  {t("add_redirect")}
                </Button>
              </div>
              <ul className="divide-y rounded-md border">
                {redirects.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span dir="ltr" className="truncate">
                      {row.from_path} → {row.to_path} ({row.status_code})
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void removeRedirect(row.id)}>
                      {t("delete")}
                    </Button>
                  </li>
                ))}
                {redirects.length === 0 ? (
                  <li className="text-muted-foreground px-3 py-4 text-sm">{t("no_redirects")}</li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search_console" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("section_search_console")}</CardTitle>
              <CardDescription>{t("section_search_console_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid max-w-2xl gap-3">
              {(
                [
                  "google_site_verification",
                  "bing_site_verification",
                  "yandex_verification",
                  "pinterest_verification",
                ] as const
              ).map((key) => (
                <div key={key} className="grid gap-1">
                  <Label>{t(key)}</Label>
                  <Input
                    dir="ltr"
                    className="font-mono text-sm"
                    value={String(draft[key] ?? "")}
                    onChange={(e) => patch({ [key]: e.target.value })}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {tab !== "redirects" ? (
        <SettingsSaveBar onSave={() => void save()} pending={pending} saved={saved} error={error} />
      ) : error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : null}
    </div>
  )
}
