"use client"

import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"

import { api } from "@/lib/api"

import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type SecurityPayload = {
  general?: Record<string, unknown>
  privacy?: Record<string, unknown>
  login?: Record<string, unknown>
  waf?: Record<string, unknown>
  headers?: Record<string, unknown>
  notify?: Record<string, unknown>
  geo?: Record<string, unknown>
  rate?: Record<string, unknown>
  forensics?: Record<string, unknown>
}

function SettingSwitch({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex max-w-lg items-center justify-between gap-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer font-normal">
          {label}
        </Label>
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export function SecuritySettingsPanel() {
  const t = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error, refetchError } =
    useDraftSettings<SecurityPayload>("site", "security")

  if (loading || !draft) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>
  }

  const g = (draft.general ?? {}) as Record<string, unknown>
  const priv = (draft.privacy ?? {}) as Record<string, unknown>
  const login = (draft.login ?? {}) as Record<string, unknown>
  const waf = (draft.waf ?? {}) as Record<string, unknown>
  const headers = (draft.headers ?? {}) as Record<string, unknown>
  const notify = (draft.notify ?? {}) as Record<string, unknown>
  const geo = (draft.geo ?? {}) as Record<string, unknown>
  const rate = (draft.rate ?? {}) as Record<string, unknown>
  const forensics = (draft.forensics ?? {}) as Record<string, unknown>
  const current = draft

  function patch(
    section: keyof SecurityPayload,
    key: string,
    value: unknown
  ) {
    setDraft({
      ...current,
      [section]: { ...(current[section] ?? {}), [key]: value },
    })
  }

  return (
    <div className="space-y-4">
      {refetchError ? <p className="text-sm text-destructive">{refetchError}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("security.general")}</CardTitle>
          <CardDescription>{t("security.general_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid max-w-sm gap-2">
            <Label>{t("security.profile")}</Label>
            <Select
              value={String(g.profile ?? "recommended")}
              onValueChange={(v) => patch("general", "profile", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">{t("security.profile_beginner")}</SelectItem>
                <SelectItem value="recommended">{t("security.profile_recommended")}</SelectItem>
                <SelectItem value="store">{t("security.profile_store")}</SelectItem>
                <SelectItem value="paranoid">{t("security.profile_paranoid")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <SettingSwitch
            id="sec-enabled"
            label={t("security.enabled")}
            checked={Boolean(g.enabled)}
            onCheckedChange={(v) => patch("general", "enabled", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("security.privacy")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingSwitch
            id="hide-fingerprint"
            label={t("security.hide_app_fingerprint")}
            hint={t("security.hide_app_fingerprint_hint")}
            checked={Boolean(priv.hide_app_fingerprint ?? priv.hide_wp_version)}
            onCheckedChange={(v) => patch("privacy", "hide_app_fingerprint", v)}
          />
          <SettingSwitch
            id="disable-debug"
            label={t("security.disable_dangerous_debug")}
            hint={t("security.disable_dangerous_debug_hint")}
            checked={Boolean(priv.disable_dangerous_debug ?? priv.disable_file_edit)}
            onCheckedChange={(v) => patch("privacy", "disable_dangerous_debug", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("security.login")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingSwitch
            id="limit-attempts"
            label={t("security.limit_attempts")}
            checked={Boolean(login.limit_attempts)}
            onCheckedChange={(v) => patch("login", "limit_attempts", v)}
          />
          <div className="grid max-w-xs gap-2 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>{t("security.max_attempts")}</Label>
              <Input
                type="number"
                value={Number(login.max_attempts ?? 5)}
                onChange={(e) => patch("login", "max_attempts", Number(e.target.value))}
              />
            </div>
            <div className="grid gap-1">
              <Label>{t("security.lockout_minutes")}</Label>
              <Input
                type="number"
                value={Number(login.lockout_minutes ?? 15)}
                onChange={(e) => patch("login", "lockout_minutes", Number(e.target.value))}
              />
            </div>
          </div>
          <SettingSwitch
            id="force-2fa"
            label={t("security.force_2fa")}
            hint={t("security.force_2fa_hint")}
            checked={Boolean(login.force_2fa_admins)}
            onCheckedChange={(v) => patch("login", "force_2fa_admins", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("security.waf")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingSwitch
            id="waf-on"
            label={t("security.waf_enabled")}
            checked={Boolean(waf.enabled)}
            onCheckedChange={(v) => patch("waf", "enabled", v)}
          />
          <SettingSwitch
            id="waf-enforce"
            label={t("security.waf_enforce")}
            hint={t("security.waf_enforce_hint")}
            checked={Boolean(waf.enforce)}
            onCheckedChange={(v) => patch("waf", "enforce", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("security.geo")}</CardTitle>
          <CardDescription>{t("security.geo_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-md gap-3">
          <SettingSwitch
            id="geo-on"
            label={t("security.geo_enabled")}
            checked={Boolean(geo.enabled)}
            onCheckedChange={(v) => patch("geo", "enabled", v)}
          />
          <div className="grid gap-1">
            <Label>{t("security.geo_mode")}</Label>
            <select
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              value={String(geo.mode ?? "block")}
              onChange={(e) => patch("geo", "mode", e.target.value)}
            >
              <option value="block">{t("security.geo_mode_block")}</option>
              <option value="allow">{t("security.geo_mode_allow")}</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label>{t("security.geo_countries")}</Label>
            <Input
              dir="ltr"
              value={Array.isArray(geo.countries) ? (geo.countries as string[]).join(", ") : String(geo.countries ?? "")}
              onChange={(e) => patch("geo", "countries", e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label>{t("security.geo_header")}</Label>
            <Input dir="ltr" className="font-mono" value={String(geo.header ?? "CF-IPCountry")} onChange={(e) => patch("geo", "header", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("security.rate")}</CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-md gap-3">
          <div className="grid gap-1">
            <Label>{t("security.rate_checkout")}</Label>
            <Input type="number" min={1} value={Number(rate.checkout_per_min ?? 10)} onChange={(e) => patch("rate", "checkout_per_min", Number(e.target.value) || 1)} />
          </div>
          <div className="grid gap-1">
            <Label>{t("security.rate_public")}</Label>
            <Input type="number" min={1} value={Number(rate.public_writes_per_min ?? 30)} onChange={(e) => patch("rate", "public_writes_per_min", Number(e.target.value) || 1)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("security.forensics")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingSwitch
            id="forensics-log"
            label={t("security.forensics_log")}
            checked={forensics.log_events !== false}
            onCheckedChange={(v) => patch("forensics", "log_events", v)}
          />
          <div className="grid max-w-md gap-1">
            <Label>{t("security.forensics_retention")}</Label>
            <Input type="number" min={1} max={365} value={Number(forensics.retention_days ?? 30)} onChange={(e) => patch("forensics", "retention_days", Number(e.target.value) || 30)} />
          </div>
          <SecurityEventsList />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("security.headers")}</CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-md gap-3">
          <div className="grid gap-1">
            <Label>{t("security.x_frame_options")}</Label>
            <Input
              value={String(headers.x_frame_options ?? "SAMEORIGIN")}
              onChange={(e) => patch("headers", "x_frame_options", e.target.value)}
              dir="ltr"
              className="font-mono"
            />
          </div>
          <div className="grid gap-1">
            <Label>{t("security.referrer_policy")}</Label>
            <Input
              value={String(headers.referrer_policy ?? "")}
              onChange={(e) => patch("headers", "referrer_policy", e.target.value)}
              dir="ltr"
              className="font-mono"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("security.notify")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingSwitch
            id="notify-email"
            label={t("security.notify_email")}
            checked={Boolean(notify.email)}
            onCheckedChange={(v) => patch("notify", "email", v)}
          />
          <SettingSwitch
            id="notify-site"
            label={t("security.notify_site")}
            checked={Boolean(notify.site)}
            onCheckedChange={(v) => patch("notify", "site", v)}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <SettingsSaveBar
          onSave={() => void persist()}
          pending={pending}
          saved={saved}
          error={error}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => patch("general", "wizard_completed", true)}
        >
          {t("security.complete_wizard")}
        </Button>
      </div>
    </div>
  )
}

type SecurityEventRow = { id: number; type: string; ip: string | null; country: string | null; path: string | null; created_at: string }

function SecurityEventsList() {
  const t = useTranslations("settings_hub")
  const q = useQuery({
    queryKey: ["security-events"],
    queryFn: () => api<{ data: SecurityEventRow[] }>("/api/v1/security/events?per_page=20"),
  })
  const rows = q.data?.data ?? []
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{t("security.events")}</p>
      {rows.length ? (
        <ul className="divide-y text-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap justify-between gap-2 py-1">
              <span>{t(`security.event_types.${r.type}` as never)}</span>
              <span dir="ltr" className="text-muted-foreground font-mono">
                {r.ip ?? "—"} {r.country ?? ""} {r.path ?? ""} · {new Date(r.created_at).toLocaleString("fa-IR")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">{t("security.events_empty")}</p>
      )}
    </div>
  )
}
