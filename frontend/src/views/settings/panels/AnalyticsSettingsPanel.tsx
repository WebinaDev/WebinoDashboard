"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { AnalyticsSourceBadge } from "../../../../modules/analytics/components/analytics/AnalyticsSourceBadge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

type AnalyticsPayload = {
  tracking_enabled?: boolean
  anonymize_ip?: boolean
  exclude_roles?: string[]
  exclude_ips?: string
  exclude_urls?: string
  online_timeout?: number
  retention_days?: number
  record_logged_in?: boolean
  enabled?: boolean
  provider?: string
  track_admin?: boolean
}

type AnalyticsSettingsMeta = {
  settings?: AnalyticsPayload
  editable_roles?: string[]
  source?: string
}

export function AnalyticsSettingsPanel() {
  const t = useTranslations("settings_hub")
  const tA = useTranslations("analytics")
  const tRoles = useTranslations("rbac.roles")
  const locale = normalizeUiLocale(useLocale())
  const { loading, draft, setDraft, persist, pending, saved, error } =
    useDraftSettings<AnalyticsPayload>("site", "analytics")

  const meta = useQuery({
    queryKey: ["analytics", "settings-meta"],
    queryFn: () => api<AnalyticsSettingsMeta>("/api/v1/analytics/settings"),
    retry: false,
  })

  const purge = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; days_rebuilt: number }>("/api/v1/analytics/purge-cache", {
        method: "POST",
        json: {},
      }),
    onSuccess: (data) => {
      toast.success(tA("settings.purgeDone", { count: formatNumber(Number(data?.days_rebuilt ?? 0), locale) }))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (loading || !draft) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>
  }

  const roles = Array.isArray(draft.exclude_roles) ? draft.exclude_roles : []
  const editableRoles = meta.data?.editable_roles ?? []
  const roleOptions = [...editableRoles, ...roles.filter((r) => !editableRoles.includes(r))]
  const roleLabel = (slug: string) => (tRoles.has(slug as never) ? tRoles(slug as never) : slug)

  const toggleRole = (role: string, checked: boolean) => {
    const next = checked ? [...new Set([...roles, role])] : roles.filter((r) => r !== role)
    setDraft({ ...draft, exclude_roles: next })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">{t("analytics.title")}</CardTitle>
          <AnalyticsSourceBadge source={meta.data?.source} />
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{t("analytics.hint")}</p>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("analytics.tracking_enabled")}</Label>
            <Switch
              checked={Boolean(draft.tracking_enabled ?? draft.enabled)}
              onCheckedChange={(v) => setDraft({ ...draft, tracking_enabled: v, enabled: v })}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("analytics.anonymize_ip")}</Label>
            <Switch
              checked={draft.anonymize_ip !== false}
              onCheckedChange={(v) => setDraft({ ...draft, anonymize_ip: v })}
            />
          </div>
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("analytics.record_logged_in")}</Label>
            <Switch
              checked={Boolean(draft.record_logged_in)}
              onCheckedChange={(v) => setDraft({ ...draft, record_logged_in: v })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("analytics.online_timeout")}</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={draft.online_timeout ?? 5}
              onChange={(e) => setDraft({ ...draft, online_timeout: Number(e.target.value) || 5 })}
            />
          </div>
          <div className="grid max-w-md gap-2">
            <Label>{t("analytics.retention_days")}</Label>
            <Input
              type="number"
              min={7}
              max={730}
              value={draft.retention_days ?? 90}
              onChange={(e) => setDraft({ ...draft, retention_days: Number(e.target.value) || 90 })}
            />
          </div>
          <div className="grid max-w-lg gap-2">
            <Label>{t("analytics.exclude_roles")}</Label>
            {meta.isLoading ? (
              <p className="text-muted-foreground text-sm">{t("loading")}</p>
            ) : roleOptions.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {roleOptions.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={roles.includes(role)}
                      onCheckedChange={(v) => toggleRole(role, v)}
                    />
                    {roleLabel(role)}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{t("analytics.no_roles")}</p>
            )}
          </div>
          <div className="grid max-w-lg gap-2">
            <Label>{t("analytics.exclude_ips")}</Label>
            <Textarea
              value={draft.exclude_ips ?? ""}
              onChange={(e) => setDraft({ ...draft, exclude_ips: e.target.value })}
              rows={3}
              dir="ltr"
              className="font-mono text-sm"
            />
          </div>
          <div className="grid max-w-lg gap-2">
            <Label>{t("analytics.exclude_urls")}</Label>
            <Textarea
              value={draft.exclude_urls ?? ""}
              onChange={(e) => setDraft({ ...draft, exclude_urls: e.target.value })}
              rows={4}
              dir="ltr"
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("analytics.maintenance")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">{t("analytics.purge_hint")}</p>
          <Button
            type="button"
            variant="outline"
            disabled={purge.isPending}
            onClick={() => purge.mutate()}
          >
            {purge.isPending ? t("analytics.purge_running") : tA("settings.purgeRebuild")}
          </Button>
        </CardContent>
      </Card>
      <SettingsSaveBar pending={pending} saved={saved} error={error} onSave={() => void persist()} />
    </div>
  )
}
