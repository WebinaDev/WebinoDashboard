"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { isSmsUnavailable, SmsServiceBanner } from "@/components/marketing/SmsServiceBanner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { getApiErrorMessage } from "@/lib/api-helpers"
import {
  fetchSiteSmsSettings,
  fetchSmsPatternRegistry,
  fetchSmsPatterns,
  saveSiteSmsSettings,
  saveSmsTemplates,
  sendSiteOtp,
  syncSmsPattern,
  type SiteSmsSettings,
  type SmsPatternRegistryRow,
} from "../../../../modules/marketing/lib/modirpayamak-api"

const SITE_SCOPE = "site"
const OTP_EVENTS = ["otp_login", "otp_register"] as const

type IppanelPattern = {
  title?: string
  pattern_code?: string
  pattern_message?: string
}

function extractPatterns(raw: unknown): IppanelPattern[] {
  if (Array.isArray(raw)) return raw as IppanelPattern[]
  if (!raw || typeof raw !== "object") return []
  const obj = raw as Record<string, unknown>
  if (Array.isArray(obj.data)) return obj.data as IppanelPattern[]
  if (Array.isArray(obj.patterns)) return obj.patterns as IppanelPattern[]
  if (obj.data && typeof obj.data === "object") {
    const nested = obj.data as Record<string, unknown>
    if (Array.isArray(nested.data)) return nested.data as IppanelPattern[]
    if (Array.isArray(nested.patterns)) return nested.patterns as IppanelPattern[]
    if (Array.isArray(nested.items)) return nested.items as IppanelPattern[]
  }
  if (Array.isArray(obj.items)) return obj.items as IppanelPattern[]
  return []
}

function registryCode(registry: SmsPatternRegistryRow[], eventKey: string): string {
  return (registry.find((r) => r.scope === SITE_SCOPE && r.event_key === eventKey)?.ippanel_code ?? "").trim()
}

function PatternBadge({ status }: { status?: string }) {
  const t = useTranslations("settings_hub.sms")
  if (status === "synced") return <Badge variant="default">{t("pattern_status.synced")}</Badge>
  if (status === "pending") return <Badge variant="secondary">{t("pattern_status.pending")}</Badge>
  if (status === "failed") return <Badge variant="destructive">{t("pattern_status.failed")}</Badge>
  return <Badge variant="outline">{t("pattern_status.none")}</Badge>
}

const defaultSettings = (): SiteSmsSettings => ({
  enabled: false,
  sender_line_service: "",
  sender_line_dedicated: "",
  otp_login_enabled: false,
  otp_register_enabled: false,
  otp_expiry_minutes: 5,
  otp_max_attempts: 3,
  otp_length: 5,
  otp_login_template: "",
  otp_register_template: "",
  use_pattern_for_otp: false,
})

/** Full site SMS panel — dashboard SMS service / ERP proxy only (no local module_settings). */
export function SmsSettingsPanel() {
  const t = useTranslations("settings_hub.sms")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ["site-sms-settings"],
    queryFn: fetchSiteSmsSettings,
    retry: false,
  })
  const patternsQ = useQuery({
    queryKey: ["sms-patterns-site"],
    queryFn: () => fetchSmsPatterns(1, 100),
    retry: false,
  })
  const registryQ = useQuery({
    queryKey: ["sms-pattern-registry-site"],
    queryFn: fetchSmsPatternRegistry,
    retry: false,
  })

  const [draft, setDraft] = useState<SiteSmsSettings | null>(null)
  const [bindLogin, setBindLogin] = useState("")
  const [bindRegister, setBindRegister] = useState("")
  const [testPhone, setTestPhone] = useState("")
  const [registry, setRegistry] = useState<SmsPatternRegistryRow[]>([])

  const unavailable = Boolean(q.data?.unavailable) || isSmsUnavailable(q.data)
  const patterns = useMemo(
    () => extractPatterns(patternsQ.data?.data ?? patternsQ.data),
    [patternsQ.data],
  )

  useEffect(() => {
    if (q.data?.settings) {
      setDraft({ ...defaultSettings(), ...q.data.settings })
    }
  }, [q.data])

  useEffect(() => {
    const rows = (registryQ.data?.registry ?? []) as SmsPatternRegistryRow[]
    setRegistry(rows)
    setBindLogin(registryCode(rows, "otp_login"))
    setBindRegister(registryCode(rows, "otp_register"))
  }, [registryQ.data])

  const save = useMutation({
    mutationFn: async () => {
      const res = (await saveSiteSmsSettings(draft ?? {})) as { ok?: boolean; unavailable?: boolean; message?: string }
      if (res?.unavailable || res?.ok === false) {
        throw new Error(res.message || t("unavailable"))
      }
      return res
    },
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await qc.invalidateQueries({ queryKey: ["site-sms-settings"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const bindPattern = useMutation({
    mutationFn: async (opts: { event_key: "otp_login" | "otp_register"; code: string; body: string }) => {
      const code = opts.code.trim()
      if (!code) throw new Error(t("pattern_code_required"))
      await saveSmsTemplates([
        {
          scope: SITE_SCOPE,
          event_key: opts.event_key,
          body: opts.body || "{code}",
          enabled: true,
          pattern_code: code,
        },
      ])
      const res = (await syncSmsPattern({
        scope: SITE_SCOPE,
        event_key: opts.event_key,
        pattern_code: code,
        bind_only: true,
      })) as { ok?: boolean; unavailable?: boolean; message?: string }
      if (res?.unavailable || res?.ok === false) {
        throw new Error(res.message || t("pattern_code_required"))
      }
      return res
    },
    onSuccess: async (_data, vars) => {
      toast.success(t("pattern_synced"))
      setRegistry((prev) => {
        const rest = prev.filter((r) => !(r.scope === SITE_SCOPE && r.event_key === vars.event_key))
        return [
          ...rest,
          {
            scope: SITE_SCOPE,
            event_key: vars.event_key,
            ippanel_code: vars.code.trim(),
            sync_status: "synced",
          },
        ]
      })
      await qc.invalidateQueries({ queryKey: ["sms-pattern-registry-site"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const testOtp = useMutation({
    mutationFn: async (purpose: "login" | "register") => {
      const res = (await sendSiteOtp({
        phone: testPhone.trim(),
        purpose,
      })) as { ok?: boolean; unavailable?: boolean; message?: string }
      if (res?.unavailable || res?.ok === false) {
        throw new Error(res.message || tCommon("error_generic"))
      }
      return res
    },
    onSuccess: () => toast.success(t("test_sent")),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (!draft && q.isLoading) {
    return <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
  }
  if (q.isError && !draft) {
    return (
      <SmsServiceBanner
        message={getApiErrorMessage(q.error as Error)}
        onRetry={() => void q.refetch()}
      />
    )
  }
  if (!draft) return null

  const patternOptions = patterns.map((p) => {
    const code = (p.pattern_code ?? "").trim()
    if (!code) return null
    return (
      <SelectItem key={code} value={code}>
        {p.title ? `${p.title} (${code})` : code}
      </SelectItem>
    )
  })

  const renderOtpBlock = (eventKey: (typeof OTP_EVENTS)[number]) => {
    const isLogin = eventKey === "otp_login"
    const enabledKey = isLogin ? "otp_login_enabled" : "otp_register_enabled"
    const templateKey = isLogin ? "otp_login_template" : "otp_register_template"
    const bindValue = isLogin ? bindLogin : bindRegister
    const setBind = isLogin ? setBindLogin : setBindRegister
    const row = registry.find((r) => r.scope === SITE_SCOPE && r.event_key === eventKey)

    return (
      <div className="bg-background/50 space-y-3 rounded-xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Label>{isLogin ? t("otp_login") : t("otp_register")}</Label>
            <PatternBadge status={row?.sync_status} />
          </div>
          <Switch
            checked={!!draft[enabledKey]}
            onCheckedChange={(v) => setDraft({ ...draft, [enabledKey]: v })}
          />
        </div>
        <div className="space-y-2">
          <Label>{isLogin ? t("otp_login_template") : t("otp_register_template")}</Label>
          <Textarea
            rows={2}
            value={(draft[templateKey] as string) ?? ""}
            onChange={(e) => setDraft({ ...draft, [templateKey]: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("pattern_code")}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              className="font-mono"
              dir="ltr"
              value={bindValue}
              onChange={(e) => setBind(e.target.value)}
              placeholder={t("pattern_code_placeholder")}
            />
            <Select value={bindValue || undefined} onValueChange={setBind}>
              <SelectTrigger className="sm:w-56">
                <SelectValue placeholder={t("pick_pattern")} />
              </SelectTrigger>
              <SelectContent>{patternOptions}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={unavailable || bindPattern.isPending || !bindValue.trim()}
            onClick={() =>
              bindPattern.mutate({
                event_key: eventKey,
                code: bindValue,
                body: String(draft[templateKey] ?? ""),
              })
            }
          >
            {t("bind_pattern")}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/marketing/sms/patterns">{t("open_patterns")}</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {unavailable ? (
        <SmsServiceBanner message={t("unavailable")} onRetry={() => void q.refetch()} />
      ) : null}

      <Card variant="hero">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription className="mt-1">{t("hint")}</CardDescription>
          </div>
          <Switch
            checked={!!draft.enabled}
            onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            disabled={unavailable || save.isPending}
          />
        </CardHeader>
      </Card>

      <Card variant="glass">
        <CardContent className="space-y-4 pt-6">
          <fieldset disabled={unavailable || save.isPending} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("service_line")}</Label>
                <Input
                  value={draft.sender_line_service ?? ""}
                  readOnly
                  className="bg-muted"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("dedicated_line")}</Label>
                <Input
                  value={draft.sender_line_dedicated ?? ""}
                  readOnly
                  className="bg-muted"
                  dir="ltr"
                />
              </div>
            </div>
            <p className="text-muted-foreground text-xs">{t("lines_from_crm")}</p>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("otp_length")}</Label>
                <Input
                  type="number"
                  min={4}
                  max={8}
                  value={draft.otp_length ?? 5}
                  onChange={(e) =>
                    setDraft({ ...draft, otp_length: Number(e.target.value) || 5 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t("otp_expiry")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={15}
                  value={draft.otp_expiry_minutes ?? 5}
                  onChange={(e) =>
                    setDraft({ ...draft, otp_expiry_minutes: Number(e.target.value) || 5 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t("otp_max_attempts")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={draft.otp_max_attempts ?? 3}
                  onChange={(e) =>
                    setDraft({ ...draft, otp_max_attempts: Number(e.target.value) || 3 })
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border p-4">
              <div>
                <Label>{t("use_pattern_for_otp")}</Label>
                <p className="text-muted-foreground text-xs">{t("use_pattern_for_otp_hint")}</p>
              </div>
              <Switch
                checked={!!draft.use_pattern_for_otp}
                onCheckedChange={(v) => setDraft({ ...draft, use_pattern_for_otp: v })}
              />
            </div>

            {renderOtpBlock("otp_login")}
            {renderOtpBlock("otp_register")}

            <p className="text-muted-foreground text-xs">{t("shortcode_hint", { code: "{code}" })}</p>

            <div className="space-y-3 rounded-xl border p-4">
              <Label>{t("test_phone")}</Label>
              <Input
                className="font-mono"
                dir="ltr"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="09xxxxxxxxx"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={unavailable || testOtp.isPending || !testPhone.trim()}
                  onClick={() => testOtp.mutate("login")}
                >
                  {t("test_login")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={unavailable || testOtp.isPending || !testPhone.trim()}
                  onClick={() => testOtp.mutate("register")}
                >
                  {t("test_register")}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={unavailable || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? tCommon("saving") : tCommon("save")}
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard/marketing/sms">{t("open_marketing")}</Link>
              </Button>
            </div>
          </fieldset>
        </CardContent>
      </Card>
    </div>
  )
}
