"use client"

import { useQuery } from "@tanstack/react-query"
import { Check, ChevronDown, LayoutTemplate, LogOut, Palette, Shield } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { dashboardPath } from "@/kernel/paths"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import {
  safeNavigationUrl,
  type StaffImpersonationSession,
} from "@/lib/staff-impersonation"

type Props = {
  /** Pass null to hide. Omit to load the session from the API. */
  session?: StaffImpersonationSession | null
}

export function StaffImpersonationBar({ session: sessionProp }: Props) {
  const t = useTranslations("impersonation")
  const remote = useQuery({
    queryKey: ["staff-impersonation"],
    enabled: sessionProp === undefined,
    queryFn: () =>
      api<StaffImpersonationSession | { active: false }>("/api/v1/auth/impersonation"),
    staleTime: 30_000,
  })
  const session =
    sessionProp !== undefined
      ? sessionProp
      : remote.data && remote.data.active
        ? remote.data
        : null

  const [busy, setBusy] = useState<"switch" | "exit" | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!session?.active) return null

  const others = session.sites.filter((site) => !site.current && site.site_id !== session.site_id)
  const customerName = session.customer?.name?.trim() ?? ""

  async function onSwitch(siteId: string) {
    setBusy("switch")
    setError(null)
    try {
      const result = await api<{ switch_url?: string }>("/api/v1/auth/impersonation/switch", {
        method: "POST",
        json: { site_id: siteId },
      })
      const next = safeNavigationUrl(result.switch_url)
      if (!next) {
        setError(t("switch_failed"))
        setBusy(null)
        return
      }
      window.location.assign(next)
    } catch (err) {
      setError(getApiErrorMessage(err) || t("switch_failed"))
      setBusy(null)
    }
  }

  async function onExit() {
    setBusy("exit")
    setError(null)
    try {
      const result = await api<{ return_url?: string | null }>("/api/v1/auth/impersonation/exit", {
        method: "POST",
        json: {},
      })
      window.location.assign(safeNavigationUrl(result.return_url) ?? "/login")
    } catch (err) {
      setError(getApiErrorMessage(err) || t("exit_failed"))
      setBusy(null)
    }
  }

  return (
    <div
      role="status"
      data-testid="staff-impersonation-bar"
      className="sticky top-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-amber-800/30 bg-amber-400 px-3 py-1.5 text-xs text-amber-950 sm:text-sm"
    >
      <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1 font-semibold">
          <Shield className="size-3.5 shrink-0" aria-hidden />
          {t("banner_label")}
        </span>
        <span>{t("staff", { name: session.staff_name })}</span>
        <span className="inline-flex min-w-0 items-center gap-1">
          <span className="truncate">{t("site", { name: session.site_name || session.domain })}</span>
          <span dir="ltr" className="truncate font-mono text-[11px] opacity-80 sm:text-xs">
            {session.domain}
          </span>
        </span>
        {customerName ? <span className="truncate">{t("customer", { name: customerName })}</span> : null}
      </p>

      <div className="ms-auto flex flex-wrap items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 border-amber-950/20 bg-white/80 text-amber-950 hover:bg-white"
              disabled={busy !== null}
            >
              {t("switch_site")}
              <ChevronDown className="size-3.5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>{t("switch_site")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {session.sites.length === 0 ? (
              <DropdownMenuItem disabled>{t("no_other_sites")}</DropdownMenuItem>
            ) : (
              session.sites.map((site) => {
                const current = Boolean(site.current) || site.site_id === session.site_id
                return (
                  <DropdownMenuItem
                    key={site.site_id}
                    disabled={current || busy !== null}
                    onSelect={() => {
                      if (!current) void onSwitch(site.site_id)
                    }}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{site.name}</span>
                      <span dir="ltr" className="truncate text-xs text-muted-foreground">
                        {site.domain}
                      </span>
                    </span>
                    {current ? <Check className="size-4 shrink-0" aria-label={t("current_site")} /> : null}
                  </DropdownMenuItem>
                )
              })
            )}
            {others.length === 0 && session.sites.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>{t("no_other_sites")}</DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button asChild size="sm" variant="outline" className="h-7 border-amber-950/20 bg-white/80 text-amber-950 hover:bg-white">
          <Link href={dashboardPath("builder")}>
            <LayoutTemplate className="size-3.5" aria-hidden />
            {t("page_builder")}
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-7 border-amber-950/20 bg-white/80 text-amber-950 hover:bg-white">
          <Link href={dashboardPath("themes")}>
            <Palette className="size-3.5" aria-hidden />
            {t("theme_builder")}
          </Link>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 border-amber-950/20 bg-amber-950 text-amber-50 hover:bg-amber-900 hover:text-amber-50"
          disabled={busy !== null}
          onClick={() => void onExit()}
        >
          <LogOut className="size-3.5" aria-hidden />
          {t("exit")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="basis-full text-red-900">
          {error}
        </p>
      ) : null}
    </div>
  )
}
