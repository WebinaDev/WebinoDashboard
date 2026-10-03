"use client"

import { useQuery } from "@tanstack/react-query"
import { LayoutTemplate, LogOut, Palette } from "lucide-react"
import { useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import { useState } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type SiteLink = {
  provision_id: number
  domain: string
  name: string
  customer_name: string
  current?: boolean
}

type Impersonation = {
  staff_name?: string
  customer_name?: string
  site_name?: string
  domain?: string
  provision_id?: number
  return_url?: string
  expires_at?: string | null
  sites?: SiteLink[]
}

type PageRow = { id: number; title: string; slug?: string }
type TemplateRow = { id: number; title: string; kind: string }

function safeDashboardPath(path: string): string {
  if (!path.startsWith("/dashboard") || path.startsWith("//") || path.includes("..")) {
    return "/dashboard"
  }
  return path
}

function hopTarget(pathname: string, explicit?: string): string {
  if (explicit) return safeDashboardPath(explicit)
  if (pathname.includes("/theme-builder")) return "/dashboard/theme-builder"
  if (pathname.includes("/builder")) return "/dashboard/builder"
  if (pathname.startsWith("/dashboard")) return safeDashboardPath(pathname.split("?")[0] || "/dashboard")
  return "/dashboard"
}

export function ImpersonationBar() {
  const t = useTranslations("impersonation")
  const pathname = usePathname() ?? ""
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pagesOpen, setPagesOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: () => api<{ impersonation?: Impersonation | null }>("/api/v1/auth/user"),
  })

  const session = user?.impersonation
  const pages = useQuery({
    queryKey: ["impersonation-pages"],
    enabled: Boolean(session) && pagesOpen,
    queryFn: () => api<{ pages?: PageRow[] }>("/api/v1/builder"),
  })
  const templates = useQuery({
    queryKey: ["impersonation-templates"],
    enabled: Boolean(session) && templatesOpen,
    queryFn: () => api<{ kinds?: { kind: string; label?: string; templates?: TemplateRow[] }[] }>("/api/v1/theme-builder"),
  })

  if (!session) return null

  const staff = session.staff_name || "…"
  const customer = session.customer_name || session.site_name || session.domain || "…"
  const siteLabel = session.site_name && session.domain && session.site_name !== session.domain
    ? `${session.site_name} (${session.domain})`
    : session.domain || session.site_name || "…"
  const sites = session.sites ?? []
  const minutesLeft = session.expires_at
    ? Math.max(0, Math.round((Date.parse(session.expires_at) - Date.now()) / 60000))
    : null

  async function hop(provisionId: number, next: string, current: boolean) {
    const target = safeDashboardPath(next)
    if (current) {
      window.location.assign(target)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ url?: string }>("/api/v1/auth/impersonation/switch", {
        method: "POST",
        json: { provision_id: provisionId, next: target },
      })
      if (!result?.url) {
        setError(t("switch_failed"))
        setBusy(false)
        return
      }
      window.location.assign(result.url)
    } catch (err) {
      setError(getApiErrorMessage(err) || t("switch_failed"))
      setBusy(false)
    }
  }

  async function exitImpersonation() {
    if (!window.confirm(t("exit_confirm"))) return
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ return_url?: string | null }>("/api/v1/auth/impersonation/exit", {
        method: "POST",
      })
      window.location.assign(result?.return_url || "/login")
    } catch (err) {
      setError(getApiErrorMessage(err) || t("switch_failed"))
      setBusy(false)
    }
  }

  const templateRows = (templates.data?.kinds ?? []).flatMap((group) =>
    (group.templates ?? []).map((row) => ({
      ...row,
      kind: row.kind || group.kind,
      label: group.label,
    })),
  )

  return (
    <div
      className="sticky top-0 z-[80] flex shrink-0 flex-wrap items-center gap-2 bg-zinc-950 px-3 py-2 text-sm text-zinc-50"
      data-testid="impersonation-bar"
      role="region"
      aria-label={t("label")}
    >
      <p className="min-w-0 flex-1 leading-6">
        {t("banner", { staff, site: siteLabel, customer })}
        {minutesLeft !== null && minutesLeft <= 5 ? (
          <span className="ms-2 text-amber-200">{t("expires", { minutes: Math.max(1, minutesLeft) })}</span>
        ) : null}
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
          disabled={busy}
          data-testid="impersonation-sites"
        >
          {t("sites")}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 w-80 overflow-y-auto p-2">
          {sites.length === 0 ? <p className="px-2 py-1 text-xs text-muted-foreground">{t("no_sites")}</p> : null}
          {sites.map((site) => (
            <div key={site.provision_id} className="border-b px-1 py-2 last:border-b-0">
              <p className="truncate text-sm font-medium">
                {site.name || site.domain}
                {site.current ? <span className="ms-1 text-xs text-muted-foreground">{t("current")}</span> : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">{site.domain}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                <button type="button" className="rounded bg-muted px-2 py-0.5 text-xs" disabled={busy} onClick={() => void hop(site.provision_id, "/dashboard", Boolean(site.current))}>
                  {t("dashboard")}
                </button>
                <button type="button" className="rounded bg-muted px-2 py-0.5 text-xs" disabled={busy} onClick={() => void hop(site.provision_id, "/dashboard/builder", Boolean(site.current))}>
                  {t("builder")}
                </button>
                <button type="button" className="rounded bg-muted px-2 py-0.5 text-xs" disabled={busy} onClick={() => void hop(site.provision_id, "/dashboard/theme-builder", Boolean(site.current))}>
                  {t("theme_builder")}
                </button>
              </div>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu open={pagesOpen} onOpenChange={setPagesOpen}>
        <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20" disabled={busy}>
          <LayoutTemplate className="size-3.5" aria-hidden />
          {t("pages")}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto p-2">
          <p className="px-1 pb-1 text-xs text-muted-foreground">{t("pages_here")}</p>
          {(pages.data?.pages ?? []).map((page) => (
            <button
              key={page.id}
              type="button"
              className="block w-full truncate rounded px-2 py-1 text-start text-sm hover:bg-muted"
              onClick={() => window.location.assign(`/dashboard/builder/${page.id}`)}
            >
              {page.title}
            </button>
          ))}
          {pages.isLoading ? <p className="px-2 text-xs">{t("loading")}</p> : null}
          {!pages.isLoading && (pages.data?.pages ?? []).length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">{t("no_pages")}</p>
          ) : null}
          <p className="mt-2 border-t px-1 pt-2 text-xs text-muted-foreground">{t("pages_other_sites")}</p>
          {sites.filter((site) => !site.current).map((site) => (
            <button
              key={site.provision_id}
              type="button"
              className="block w-full truncate rounded px-2 py-1 text-start text-sm hover:bg-muted"
              disabled={busy}
              onClick={() => void hop(site.provision_id, hopTarget(pathname, "/dashboard/builder"), false)}
            >
              {site.name || site.domain}
            </button>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20" disabled={busy}>
          <Palette className="size-3.5" aria-hidden />
          {t("templates")}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto p-2">
          <p className="px-1 pb-1 text-xs text-muted-foreground">{t("templates_here")}</p>
          {templateRows.map((row) => (
            <button
              key={`${row.kind}-${row.id}`}
              type="button"
              className="block w-full truncate rounded px-2 py-1 text-start text-sm hover:bg-muted"
              onClick={() => window.location.assign(`/dashboard/theme-builder/${row.kind}/${row.id}`)}
            >
              {row.title}
            </button>
          ))}
          {templates.isLoading ? <p className="px-2 text-xs">{t("loading")}</p> : null}
          <p className="mt-2 border-t px-1 pt-2 text-xs text-muted-foreground">{t("templates_other_sites")}</p>
          {sites.filter((site) => !site.current).map((site) => (
            <button
              key={site.provision_id}
              type="button"
              className="block w-full truncate rounded px-2 py-1 text-start text-sm hover:bg-muted"
              disabled={busy}
              onClick={() => void hop(site.provision_id, "/dashboard/theme-builder", false)}
            >
              {site.name || site.domain}
            </button>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-2 py-1 text-xs font-medium text-zinc-950 hover:bg-amber-300 disabled:opacity-60"
        disabled={busy}
        data-testid="impersonation-exit"
        onClick={() => void exitImpersonation()}
      >
        <LogOut className="size-3.5" aria-hidden />
        {t("exit")}
      </button>
      {error ? <p className="w-full text-xs text-amber-200">{error}</p> : null}
    </div>
  )
}
