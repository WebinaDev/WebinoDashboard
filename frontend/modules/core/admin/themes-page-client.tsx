"use client"

import Image from "next/image"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ExternalLink, Palette, RotateCcw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import type { SiteBranding, ThemeCatalogResponse } from "@/kernel/theme-types"
import { api } from "@/lib/api"

type Props = {
  route: ResolvedAdminRoute
}

export default function ThemesPageClient({ route }: Props) {
  const t = useTranslations("themes")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["themes"],
    queryFn: () => api<ThemeCatalogResponse>("/api/v1/themes"),
  })

  const [form, setForm] = useState<SiteBranding | null>(null)

  const branding = form ?? data?.branding ?? null

  const setBrandingField = useCallback(
    <K extends keyof SiteBranding>(key: K, value: SiteBranding[K]) => {
      setForm((prev) => ({
        ...(prev ?? data?.branding ?? {
          logo_url: null,
          logo_dark_url: null,
          favicon_url: null,
          accent: "zinc",
          font: "yekan-bakh",
        }),
        [key]: value,
      }))
    },
    [data?.branding],
  )

  async function activateTheme(slug: string) {
    setPending(slug)
    setError(null)
    setMessage(null)
    try {
      await api(`/api/v1/themes/${slug}/activate`, { method: "POST" })
      setMessage(t("activated"))
      await queryClient.invalidateQueries({ queryKey: ["themes"] })
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error_generic"))
    } finally {
      setPending(null)
    }
  }

  async function saveBranding(reset = false) {
    setPending("branding")
    setError(null)
    setMessage(null)
    try {
      const payload = reset
        ? { reset: true }
        : {
            logo_url: branding?.logo_url ?? null,
            logo_dark_url: branding?.logo_dark_url ?? null,
            favicon_url: branding?.favicon_url ?? null,
            accent: branding?.accent ?? "zinc",
            font: branding?.font ?? "yekan-bakh",
          }
      const res = await api<{ branding: SiteBranding }>("/api/v1/themes/branding", {
        method: "PATCH",
        json: payload,
      })
      setForm(res.branding)
      setMessage(reset ? t("branding_reset") : t("branding_saved"))
      await queryClient.invalidateQueries({ queryKey: ["themes"] })
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon("error_generic"))
    } finally {
      setPending(null)
    }
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div className="bg-muted h-8 w-48 animate-pulse rounded" />
        <div className="bg-muted h-40 w-full animate-pulse rounded" />
      </div>
    )
  }

  const activeSlug = data.active_theme_slug

  return (
    <div className="flex flex-col gap-8 p-6">
      <div>
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          {route.moduleSlug} / {route.submodule}
        </p>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">{t("subtitle")}</p>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="size-5" />
          <h2 className="text-lg font-medium">{t("demos_heading")}</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.themes.map((theme) => {
            const isActive = theme.slug === activeSlug
            const name = locale === "fa" ? theme.name_fa : theme.name_en
            return (
              <Card key={theme.slug} className={isActive ? "border-primary" : undefined}>
                <CardHeader className="space-y-3">
                  <div className="bg-muted relative aspect-[16/10] overflow-hidden rounded-md border">
                    <Image
                      src={theme.preview}
                      alt={name}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{name}</CardTitle>
                      <CardDescription className="font-mono text-xs">{theme.slug}</CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {isActive ? <Badge>{t("active_badge")}</Badge> : null}
                      {theme.is_demo ? <Badge variant="secondary">{t("demo_badge")}</Badge> : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={isActive || pending === theme.slug}
                    onClick={() => activateTheme(theme.slug)}
                  >
                    {isActive ? t("active_badge") : t("activate")}
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href="/" target="_blank" rel="noreferrer">
                      <ExternalLink className="me-1 size-4" />
                      {t("preview_site")}
                    </a>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">{t("branding_heading")}</h2>
        <Card>
          <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="logo_url">{t("logo_url")}</Label>
              <Input
                id="logo_url"
                value={branding?.logo_url ?? ""}
                onChange={(e) => setBrandingField("logo_url", e.target.value || null)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo_dark_url">{t("logo_dark_url")}</Label>
              <Input
                id="logo_dark_url"
                value={branding?.logo_dark_url ?? ""}
                onChange={(e) => setBrandingField("logo_dark_url", e.target.value || null)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="favicon_url">{t("favicon_url")}</Label>
              <Input
                id="favicon_url"
                value={branding?.favicon_url ?? ""}
                onChange={(e) => setBrandingField("favicon_url", e.target.value || null)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>{t("accent")}</Label>
              <div className="flex flex-wrap gap-2">
                {data.accents.map((accent) => (
                  <Button
                    key={accent}
                    type="button"
                    size="sm"
                    variant={branding?.accent === accent ? "default" : "outline"}
                    onClick={() => setBrandingField("accent", accent)}
                  >
                    {tCommon(`accent_${accent}` as never)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{t("font")}</Label>
              <div className="flex flex-wrap gap-2">
                {data.fonts.map((font) => (
                  <Button
                    key={font}
                    type="button"
                    size="sm"
                    variant={branding?.font === font ? "default" : "outline"}
                    onClick={() => setBrandingField("font", font)}
                  >
                    {t(`font_${font}` as never)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button onClick={() => saveBranding(false)} disabled={pending === "branding"}>
                {tCommon("save")}
              </Button>
              <Button
                variant="outline"
                onClick={() => saveBranding(true)}
                disabled={pending === "branding"}
              >
                <RotateCcw className="me-1 size-4" />
                {t("reset_branding")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  )
}
