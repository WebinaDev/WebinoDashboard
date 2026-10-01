"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { ScrollTable } from "@/components/ScrollTable"

type Row = {
  slug: string
  enabled: boolean
  licensed: boolean
  requires_license: boolean
  installed_version?: string | null
  distribution?: string
  git_repo?: string | null
}

type ErpModule = {
  id: number
  slug: string
  name: string
  description?: string | null
  price: number
  currency?: string
  is_free?: boolean
  version?: string | null
}

const SETTINGS_SHORTCUTS: Record<string, string> = {
  accounting: "/dashboard/accounting",
  bots: "/dashboard/settings/shop/bots/telegram",
  marketplace: "/dashboard/settings/shop/marketplace",
  analytics: "/dashboard/settings/site/analytics",
  ai: "/dashboard/settings/site/ai",
  cafe: "/dashboard/settings/shop/general",
}

export default function ModulesPage({ mode = "installed" }: { mode?: "catalog" | "installed" }) {
  const t = useTranslations("modules")
  const tCommon = useTranslations("common")
  const [rows, setRows] = useState<Row[]>([])
  const [erpModules, setErpModules] = useState<ErpModule[]>([])
  const [erpUnavailable, setErpUnavailable] = useState(false)
  const [buying, setBuying] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [installProgress, setInstallProgress] = useState<Record<string, number>>({})

  function reload() {
    api<Row[]>("/api/v1/modules")
      .then((r) => {
        const list = Array.isArray(r) ? r : []
        setRows(mode === "installed" ? list.filter((x) => x.enabled) : list)
      })
      .catch(() => setRows([]))
  }

  function reloadErpCatalog() {
    if (mode !== "catalog") return
    api<{ modules?: ErpModule[] }>("/api/v1/modules/marketplace/catalog", { method: "POST", json: {} })
      .then((r) => {
        setErpUnavailable(false)
        setErpModules(Array.isArray(r?.modules) ? r.modules : [])
      })
      .catch(() => {
        setErpUnavailable(true)
        setErpModules([])
      })
  }

  useEffect(() => {
    reload()
    reloadErpCatalog()
  }, [mode])

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.slug.localeCompare(b.slug)),
    [rows]
  )

  async function toggle(slug: string, enabled: boolean) {
    setMsg(null)
    try {
      await api(`/api/v1/modules/${slug}`, {
        method: "PATCH",
        json: { enabled },
      })
      reload()
    } catch (e) {
      setMsg(getApiErrorMessage(e) || tCommon("error_generic"))
    }
  }

  async function syncLicense() {
    setMsg(null)
    try {
      await api("/api/v1/license/sync", { method: "POST" })
      reload()
    } catch (e) {
      setMsg(getApiErrorMessage(e) || tCommon("error_generic"))
    }
  }

  async function install(slug: string) {
    setMsg(null)
    setInstallProgress((p) => ({ ...p, [slug]: 15 }))
    const tick = window.setInterval(() => {
      setInstallProgress((p) => {
        const cur = p[slug] ?? 15
        return { ...p, [slug]: Math.min(90, cur + 10) }
      })
    }, 400)
    try {
      await api(`/api/v1/modules/${slug}/install`, { method: "POST" })
      setInstallProgress((p) => ({ ...p, [slug]: 100 }))
      reload()
    } catch (e) {
      setMsg(getApiErrorMessage(e) || tCommon("error_generic"))
      setInstallProgress((p) => {
        const next = { ...p }
        delete next[slug]
        return next
      })
    } finally {
      window.clearInterval(tick)
      window.setTimeout(() => {
        setInstallProgress((p) => {
          const next = { ...p }
          delete next[slug]
          return next
        })
      }, 800)
    }
  }

  async function purchase(slug: string) {
    setMsg(null)
    setBuying(slug)
    try {
      const res = await api<{ payment?: { redirect_url?: string }; order?: unknown }>("/api/v1/modules/marketplace/purchase", {
        method: "POST",
        json: { module_slug: slug, pay: true },
      })
      const redirect = res?.payment?.redirect_url
      if (typeof redirect === "string" && redirect) {
        window.location.href = redirect
        return
      }
      reload()
      reloadErpCatalog()
    } catch (e) {
      setMsg(getApiErrorMessage(e) || t("marketplace_unavailable"))
    } finally {
      setBuying(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {mode === "catalog" ? t("catalog_title") : t("title")}
      </h1>
      {mode === "installed" && sorted.some((r) => r.slug === "accounting") ? (
        <p className="text-muted-foreground max-w-2xl text-sm">{t("accounting_hint")}</p>
      ) : (
        <p className="text-muted-foreground max-w-2xl text-sm">
          {mode === "catalog" ? t("catalog_hint") : t("installed_hint")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void syncLicense()}>
          {t("sync_license")}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/dashboard/license">{t("open_license")}</Link>
        </Button>
      </div>
      {msg ? <p className="text-destructive text-sm">{msg}</p> : null}
      {mode === "catalog" ? (
        <div className="space-y-3">
          <h2 className="text-lg font-medium">{t("erp_catalog")}</h2>
          {erpUnavailable ? (
            <p className="text-muted-foreground text-sm">{t("marketplace_unavailable")}</p>
          ) : erpModules.length === 0 ? (
            <p className="text-muted-foreground text-sm">—</p>
          ) : (
            <ScrollTable className="border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="p-3 text-start font-medium">{t("col_slug")}</th>
                    <th className="p-3 text-start font-medium">{t("price")}</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {erpModules.map((m) => (
                    <tr key={m.slug} className="border-b last:border-0">
                      <td className="p-3">
                        <div className="font-medium">{m.name}</div>
                        <div className="text-muted-foreground font-mono text-xs" dir="ltr">
                          {m.slug}
                        </div>
                      </td>
                      <td className="p-3" dir="ltr">
                        {m.is_free || m.price <= 0 ? tCommon("yes") : `${m.price} ${m.currency || "IRT"}`}
                      </td>
                      <td className="p-3 text-end">
                        <Button
                          type="button"
                          size="sm"
                          disabled={buying === m.slug}
                          onClick={() => void purchase(m.slug)}
                        >
                          {buying === m.slug ? t("purchasing") : t("purchase")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          )}
        </div>
      ) : null}
      <ScrollTable className="border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="p-3 text-start font-medium">{t("col_slug")}</th>
              <th className="p-3 text-start font-medium">{t("col_version")}</th>
              <th className="p-3 text-start font-medium">{t("enabled")}</th>
              <th className="p-3 text-start font-medium">{t("col_licensed")}</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const progress = installProgress[r.slug]
              const settingsHref = SETTINGS_SHORTCUTS[r.slug]
              return (
                <tr key={r.slug} className="border-b last:border-0">
                  <td className="p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>
                        {t.has(`names.${r.slug}` as never)
                          ? t(`names.${r.slug}` as never)
                          : r.slug}
                      </span>
                      {r.distribution ? (
                        <Badge variant="outline">{r.distribution}</Badge>
                      ) : null}
                    </div>
                    {progress != null ? (
                      <div className="mt-2 max-w-xs">
                        <Progress value={progress} />
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3 font-mono text-xs" dir="ltr">
                    {r.installed_version || "—"}
                  </td>
                  <td className="p-3">
                    {r.enabled ? tCommon("yes") : tCommon("no")}
                  </td>
                  <td className="p-3">
                    {r.requires_license
                      ? r.licensed
                        ? tCommon("yes")
                        : tCommon("no")
                      : "—"}
                  </td>
                  <td className="p-3 text-end">
                    <div className="inline-flex flex-wrap justify-end gap-2">
                      {settingsHref ? (
                        <Button type="button" size="sm" variant="ghost" asChild>
                          <Link href={settingsHref}>{t("open_settings")}</Link>
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void toggle(r.slug, !r.enabled)}
                      >
                        {t("action_toggle")}
                      </Button>
                      {mode === "catalog" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={progress != null}
                          onClick={() => void install(r.slug)}
                        >
                          {t("install")}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollTable>
    </div>
  )
}
