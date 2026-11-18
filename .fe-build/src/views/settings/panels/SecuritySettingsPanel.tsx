"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { ShieldCheck, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react"

import { api } from "@/lib/api"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

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
  ssl?: Record<string, unknown>
  edge?: Record<string, unknown>
  captcha?: {
    provider?: string
    site_key?: string
    secret_key?: string
    v3_threshold?: number
    protect?: Record<string, boolean>
  }
  spam?: Record<string, unknown>
}

type AuditCheck = {
  id: string
  ok: boolean
  weight: number
  label: string
  setting?: string | null
  actionable: boolean
}

type AuditAction = {
  id: string
  priority: string
  title: string
  hint: string
  setting?: string | null
  href?: string | null
  actionable: boolean
}

type Insights = {
  score: number
  grade: string
  checklist: AuditCheck[]
  actions: AuditAction[]
  meta: { cdn_provider: string; forms_without_captcha: number; forms_total: number }
}

const TABS = ["audit", "captcha", "hardening", "forensics"] as const
type TabId = (typeof TABS)[number]

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
  const locale = normalizeUiLocale(useLocale())
  const { loading, draft, setDraft, persist, pending, saved, error, refetchError } =
    useDraftSettings<SecurityPayload>("site", "security")

  const [tab, setTab] = useState<TabId>("audit")
  const [insights, setInsights] = useState<Insights | null>(null)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)

  const loadAudit = useCallback(async () => {
    try {
      const res = await api<{ insights: Insights; settings: SecurityPayload }>("/api/v1/security/audit")
      setInsights(res.insights)
      setAuditError(null)
    } catch (e: unknown) {
      setAuditError(e instanceof Error ? e.message : "error")
    }
  }, [])

  useEffect(() => {
    void loadAudit()
  }, [loadAudit, saved])

  async function applyFix(checkId: string) {
    setApplying(checkId)
    try {
      const res = await api<{
        insights: Insights
        settings: SecurityPayload
        applied: boolean
        message?: string
      }>("/api/v1/security/audit/apply", {
        method: "POST",
        json: { check_id: checkId },
      })
      setInsights(res.insights)
      if (res.applied && res.settings) {
        setDraft(res.settings)
      }
    } catch (e: unknown) {
      setAuditError(e instanceof Error ? e.message : "error")
    } finally {
      setApplying(null)
    }
  }

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
  const ssl = (draft.ssl ?? {}) as Record<string, unknown>
  const edge = (draft.edge ?? {}) as Record<string, unknown>
  const captcha = draft.captcha ?? {}
  const protect = captcha.protect ?? {}
  const spam = (draft.spam ?? {}) as Record<string, unknown>
  const current = draft

  function patch(section: keyof SecurityPayload, key: string, value: unknown) {
    setDraft({
      ...current,
      [section]: { ...(current[section] ?? {}), [key]: value },
    })
  }

  function patchCaptcha(partial: Partial<NonNullable<SecurityPayload["captcha"]>>) {
    setDraft({
      ...current,
      captcha: { ...(current.captcha ?? {}), ...partial },
    })
  }

  function patchProtect(key: string, value: boolean) {
    patchCaptcha({
      protect: { ...(current.captcha?.protect ?? {}), [key]: value },
    })
  }

  const score = insights?.score ?? 0
  const grade = insights?.grade ?? "—"

  return (
    <div className="space-y-4">
      {refetchError ? <p className="text-sm text-destructive">{refetchError}</p> : null}
      {auditError ? <p className="text-sm text-destructive">{auditError}</p> : null}

      <div>
        <h2 className="text-base font-semibold">{t("security.hub_title")}</h2>
        <p className="text-muted-foreground text-sm">{t("security.hub_hint")}</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="w-full">
        <TabsList className="mb-3 flex h-auto w-full flex-wrap justify-start gap-1">
          {TABS.map((id) => (
            <TabsTrigger key={id} value={id}>
              {t(`security.tab_${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">{t("security.score_title")}</CardTitle>
                <CardDescription>{t("security.score_hint")}</CardDescription>
              </div>
              <div className="text-end">
                <p
                  className={cn(
                    "text-3xl font-semibold tabular-nums",
                    score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-destructive"
                  )}
                >
                  {formatNumber(score, locale)}
                  <span className="text-muted-foreground ms-1 text-sm font-normal">/ 100</span>
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("security.grade")}: {grade}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {insights ? (
                <>
                  <p className="text-muted-foreground">
                    {t("security.meta_cdn", { provider: insights.meta.cdn_provider || "none" })}
                  </p>
                  <p className="text-muted-foreground">
                    {t("security.meta_forms", {
                      unprotected: formatNumber(insights.meta.forms_without_captcha, locale),
                      total: formatNumber(insights.meta.forms_total, locale),
                    })}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">{t("loading")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("security.checklist_title")}</CardTitle>
              <CardDescription>{t("security.checklist_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(insights?.checklist ?? []).map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    {row.ok ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t(`security.checks.${row.label}` as never)}</p>
                      {!row.ok ? (
                        <p className="text-muted-foreground text-xs">
                          {t(`security.actions.${row.id}_hint` as never)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {!row.ok && row.actionable ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={applying === row.id}
                      onClick={() => void applyFix(row.id)}
                    >
                      {applying === row.id ? t("loading") : t("security.fix_now")}
                    </Button>
                  ) : null}
                  {!row.ok && row.id === "cdn_present" ? (
                    <Button type="button" size="sm" variant="outline" asChild>
                      <Link href="/dashboard/settings/site/performance">
                        {t("security.open_performance")}
                        <ExternalLink className="ms-1 size-3.5" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          {(insights?.actions?.length ?? 0) > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4" />
                  {t("security.recommendations")}
                </CardTitle>
                <CardDescription>{t("security.recommendations_hint")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights!.actions.map((action) => (
                  <div key={action.id} className="rounded-lg border px-3 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          <span className="text-muted-foreground me-2 text-xs uppercase">
                            {t(`security.priority.${action.priority}` as never)}
                          </span>
                          {t(`security.actions.${action.title}` as never)}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {t(`security.actions.${action.hint}` as never)}
                        </p>
                      </div>
                      {action.actionable ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={applying === action.id}
                          onClick={() => void applyFix(action.id)}
                        >
                          {t("security.fix_now")}
                        </Button>
                      ) : action.href ? (
                        <Button type="button" size="sm" variant="outline" asChild>
                          <Link href={action.href}>{t("security.open_performance")}</Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="captcha" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("security.captcha_title")}</CardTitle>
              <CardDescription>{t("security.captcha_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid max-w-xl gap-4">
              <div className="grid gap-2">
                <Label>{t("security.captcha_provider")}</Label>
                <Select
                  value={String(captcha.provider ?? "none")}
                  onValueChange={(v) => patchCaptcha({ provider: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("security.captcha_none")}</SelectItem>
                    <SelectItem value="numeric">{t("security.captcha_numeric")}</SelectItem>
                    <SelectItem value="recaptcha_v2">{t("security.captcha_recaptcha_v2")}</SelectItem>
                    <SelectItem value="recaptcha_v3">{t("security.captcha_recaptcha_v3")}</SelectItem>
                    <SelectItem value="hcaptcha">{t("security.captcha_hcaptcha")}</SelectItem>
                    <SelectItem value="turnstile">{t("security.captcha_turnstile")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {String(captcha.provider ?? "none") !== "none" &&
              String(captcha.provider) !== "numeric" ? (
                <>
                  <div className="grid gap-1">
                    <Label>{t("security.captcha_site_key")}</Label>
                    <Input
                      dir="ltr"
                      className="font-mono"
                      value={String(captcha.site_key ?? "")}
                      onChange={(e) => patchCaptcha({ site_key: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label>{t("security.captcha_secret_key")}</Label>
                    <Input
                      dir="ltr"
                      className="font-mono"
                      type="password"
                      autoComplete="new-password"
                      value={String(captcha.secret_key ?? "")}
                      onChange={(e) => patchCaptcha({ secret_key: e.target.value })}
                      placeholder={t("security.captcha_secret_placeholder")}
                    />
                  </div>
                </>
              ) : null}
              {String(captcha.provider) === "recaptcha_v3" ? (
                <div className="grid gap-1">
                  <Label>{t("security.captcha_v3_threshold")}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    max={1}
                    dir="ltr"
                    value={Number(captcha.v3_threshold ?? 0.5)}
                    onChange={(e) => patchCaptcha({ v3_threshold: Number(e.target.value) })}
                  />
                </div>
              ) : null}
              <div className="space-y-3 border-t pt-3">
                <p className="text-sm font-medium">{t("security.captcha_protect")}</p>
                {(["forms", "login", "checkout", "comments"] as const).map((surface) => (
                  <SettingSwitch
                    key={surface}
                    id={`cap-${surface}`}
                    label={t(`security.captcha_protect_${surface}`)}
                    checked={Boolean(protect[surface])}
                    onCheckedChange={(v) => patchProtect(surface, v)}
                  />
                ))}
              </div>
              <div className="space-y-3 border-t pt-3">
                <SettingSwitch
                  id="spam-hp"
                  label={t("security.spam_honeypot")}
                  hint={t("security.spam_honeypot_hint")}
                  checked={spam.honeypot !== false}
                  onCheckedChange={(v) => patch("spam", "honeypot", v)}
                />
                <div className="grid max-w-xs gap-1">
                  <Label>{t("security.spam_min_ms")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={Number(spam.min_submit_ms ?? 1500)}
                    onChange={(e) => patch("spam", "min_submit_ms", Number(e.target.value) || 0)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hardening" className="space-y-4">
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
              <CardTitle className="text-base">{t("security.ssl_title")}</CardTitle>
              <CardDescription>{t("security.ssl_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingSwitch
                id="force-https"
                label={t("security.force_https")}
                hint={t("security.force_https_hint")}
                checked={Boolean(ssl.force_https)}
                onCheckedChange={(v) => patch("ssl", "force_https", v)}
              />
              <SettingSwitch
                id="hsts"
                label={t("security.hsts")}
                hint={t("security.hsts_hint")}
                checked={Boolean(ssl.hsts)}
                onCheckedChange={(v) => patch("ssl", "hsts", v)}
              />
              <SettingSwitch
                id="hsts-sub"
                label={t("security.hsts_subdomains")}
                checked={Boolean(ssl.hsts_include_subdomains)}
                onCheckedChange={(v) => patch("ssl", "hsts_include_subdomains", v)}
              />
              <div className="grid max-w-xs gap-1">
                <Label>{t("security.hsts_max_age")}</Label>
                <Input
                  type="number"
                  value={Number(ssl.hsts_max_age ?? 31536000)}
                  onChange={(e) => patch("ssl", "hsts_max_age", Number(e.target.value) || 0)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("security.edge_title")}</CardTitle>
              <CardDescription>{t("security.edge_hint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingSwitch
                id="hide-origin"
                label={t("security.hide_origin_ip")}
                hint={t("security.hide_origin_ip_hint")}
                checked={Boolean(edge.hide_origin_ip)}
                onCheckedChange={(v) => patch("edge", "hide_origin_ip", v)}
              />
              <p className="text-muted-foreground text-xs">
                {t("security.cdn_perf_link_hint")}{" "}
                <Link className="underline" href="/dashboard/settings/site/performance">
                  {t("security.open_performance")}
                </Link>
              </p>
              <div className="grid gap-1">
                <Label>{t("security.edge_notes")}</Label>
                <Textarea
                  rows={2}
                  value={String(edge.notes ?? "")}
                  onChange={(e) => patch("edge", "notes", e.target.value)}
                />
              </div>
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
                  value={
                    Array.isArray(geo.countries)
                      ? (geo.countries as string[]).join(", ")
                      : String(geo.countries ?? "")
                  }
                  onChange={(e) => patch("geo", "countries", e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label>{t("security.geo_header")}</Label>
                <Input
                  dir="ltr"
                  className="font-mono"
                  value={String(geo.header ?? "CF-IPCountry")}
                  onChange={(e) => patch("geo", "header", e.target.value)}
                />
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
                <Input
                  type="number"
                  min={1}
                  value={Number(rate.checkout_per_min ?? 10)}
                  onChange={(e) =>
                    patch("rate", "checkout_per_min", Number(e.target.value) || 1)
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label>{t("security.rate_public")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={Number(rate.public_writes_per_min ?? 30)}
                  onChange={(e) =>
                    patch("rate", "public_writes_per_min", Number(e.target.value) || 1)
                  }
                />
              </div>
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
        </TabsContent>

        <TabsContent value="forensics" className="space-y-4">
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
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={Number(forensics.retention_days ?? 30)}
                  onChange={(e) =>
                    patch("forensics", "retention_days", Number(e.target.value) || 30)
                  }
                />
              </div>
              <SecurityEventsList />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap gap-2">
        <SettingsSaveBar
          onSave={() => void persist().then(() => loadAudit())}
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

type SecurityEventRow = {
  id: number
  type: string
  ip: string | null
  country: string | null
  path: string | null
  created_at: string
}

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
                {r.ip ?? "—"} {r.country ?? ""} {r.path ?? ""} ·{" "}
                {new Date(r.created_at).toLocaleString("fa-IR")}
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
