"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
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

export function SeoSettingsPanel() {
  const t = useTranslations("settings_hub.seo_native")
  const [draft, setDraft] = useState<SeoSettings | null>(null)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [redirects, setRedirects] = useState<RedirectRow[]>([])
  const [fromPath, setFromPath] = useState("")
  const [toPath, setToPath] = useState("")
  const [statusCode, setStatusCode] = useState("301")

  useEffect(() => {
    void Promise.all([
      api<{ data: SeoSettings }>("/api/v1/seo/settings"),
      api<{ data: RedirectRow[] }>("/api/v1/seo/redirects"),
    ])
      .then(([settings, list]) => {
        setDraft(settings.data)
        setRedirects(list.data ?? [])
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "error"))
  }, [])

  async function save() {
    if (!draft) return
    setPending(true)
    setError(null)
    try {
      const res = await api<{ data: SeoSettings }>("/api/v1/seo/settings", { method: "POST", json: draft })
      setDraft(res.data)
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
      const res = await api<{ data: RedirectRow }>("/api/v1/seo/redirects", {
        method: "POST",
        json: { from_path: fromPath, to_path: toPath, status_code: Number(statusCode), enabled: true },
      })
      setRedirects((rows) => [res.data, ...rows])
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

  if (!draft) return <p className="text-muted-foreground text-sm">{t("loading")}</p>

  const boolKeys = [
    "noindex_search",
    "noindex_archives",
    "sitemap_enabled",
    "sitemap_include_products",
    "sitemap_include_posts",
    "sitemap_include_pages",
    "sitemap_include_news",
    "sitemap_include_videos",
    "schema_organization_enabled",
    "schema_website_enabled",
  ] as const

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-2xl gap-3">
          {(["home_title", "home_description", "title_template", "separator", "og_image", "organization_name", "organization_logo", "news_publication_name", "robots_default"] as const).map((key) => (
            <div key={key} className="grid gap-1">
              <Label>{t(key)}</Label>
              {key === "home_description" || key === "organization_logo" ? (
                <Textarea value={String(draft[key] ?? "")} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
              ) : (
                <Input value={String(draft[key] ?? "")} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
              )}
            </div>
          ))}
          <div className="grid gap-1">
            <Label>{t("organization_same_as")}</Label>
            <Textarea
              value={String(draft.organization_same_as ?? "")}
              onChange={(e) => setDraft({ ...draft, organization_same_as: e.target.value })}
            />
          </div>
          {boolKeys.map((key) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <Label>{t(key)}</Label>
              <Switch checked={Boolean(draft[key])} onCheckedChange={(v) => setDraft({ ...draft, [key]: v })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("redirects_title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-4">
            <Input dir="ltr" placeholder="/old" value={fromPath} onChange={(e) => setFromPath(e.target.value)} />
            <Input dir="ltr" placeholder="/new" value={toPath} onChange={(e) => setToPath(e.target.value)} />
            <Input dir="ltr" value={statusCode} onChange={(e) => setStatusCode(e.target.value)} />
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
            {redirects.length === 0 ? <li className="text-muted-foreground px-3 py-4 text-sm">{t("no_redirects")}</li> : null}
          </ul>
        </CardContent>
      </Card>

      <SettingsSaveBar onSave={() => void save()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
