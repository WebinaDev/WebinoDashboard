"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { isSmsUnavailable, SmsServiceBanner } from "@/components/marketing/SmsServiceBanner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import {
  calculateSmsPrice,
  fetchSmsNumbers,
  fetchSmsPatterns,
  sendSms,
  sendSmsP2p,
  smsQueryOptions,
  type SmsAttachedNumber,
} from "../lib/modirpayamak-api"
import { SmsPanelShell } from "../lib/sms-panel-shell"

type SendMode = "webservice" | "pattern" | "p2p"
type MessageKind = "transactional" | "marketing"

type IppanelPattern = {
  title?: string
  pattern_code?: string
  pattern_message?: string
  variable?: Array<{ name?: string; type?: string }> | null
}

function unwrapNumbers(payload: { data?: SmsAttachedNumber[]; numbers?: SmsAttachedNumber[] } | undefined): SmsAttachedNumber[] {
  const list = payload?.numbers ?? payload?.data
  return Array.isArray(list) ? list : []
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

function varsFromPattern(p: IppanelPattern | undefined): string[] {
  if (!p) return []
  const fromVars = (p.variable ?? [])
    .map((v) => (v.name ?? "").replace(/%/g, "").trim())
    .filter(Boolean)
  if (fromVars.length) return [...new Set(fromVars)]
  const found = (p.pattern_message ?? "").match(/%([a-zA-Z0-9_]+)%/g) ?? []
  return [...new Set(found.map((m) => m.slice(1, -1)))]
}

function normalizeIranPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (/^09\d{9}$/.test(digits)) return digits
  if (/^989\d{9}$/.test(digits)) return `0${digits.slice(2)}`
  if (/^9\d{9}$/.test(digits)) return `0${digits}`
  return null
}

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")
  const [kind, setKind] = useState<MessageKind>("marketing")
  const [mode, setMode] = useState<SendMode>("webservice")
  const [phone, setPhone] = useState("")
  const [phones, setPhones] = useState("")
  const [message, setMessage] = useState("")
  const [from, setFrom] = useState("")
  const [patternCode, setPatternCode] = useState("")
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [sendTime, setSendTime] = useState("")
  const [priceHint, setPriceHint] = useState("")
  const [loading, setLoading] = useState(false)

  const numbersQ = useQuery({ queryKey: ["sms-numbers"], queryFn: fetchSmsNumbers, ...smsQueryOptions })
  const patternsQ = useQuery({
    queryKey: ["sms-patterns-send"],
    queryFn: () => fetchSmsPatterns(1, 100),
    ...smsQueryOptions,
  })

  const unavailable = numbersQ.data ? isSmsUnavailable(numbersQ.data) : false
  const numbers = useMemo(() => unwrapNumbers(numbersQ.data), [numbersQ.data])
  const patterns = useMemo(() => extractPatterns(patternsQ.data?.data ?? patternsQ.data), [patternsQ.data])
  const selectedPattern = useMemo(
    () => patterns.find((p) => (p.pattern_code ?? "").trim() === patternCode.trim()),
    [patterns, patternCode],
  )
  const patternVars = useMemo(() => varsFromPattern(selectedPattern), [selectedPattern])

  const serviceLine = numbers.find((n) => n.role === "service")?.number ?? ""
  const personalLine =
    numbers.find((n) => n.role === "personal")?.number ??
    numbers.find((n) => n.role === "marketing")?.number ??
    ""

  useEffect(() => {
    if (kind === "transactional") {
      setMode("pattern")
      if (serviceLine) setFrom(serviceLine)
    } else {
      setMode("webservice")
      if (personalLine) setFrom(personalLine)
    }
  }, [kind, serviceLine, personalLine])

  useEffect(() => {
    setParamValues((prev) => {
      const next: Record<string, string> = {}
      for (const key of patternVars) next[key] = prev[key] ?? ""
      return next
    })
  }, [patternVars])

  const estimate = async () => {
    try {
      const recipients =
        mode === "p2p"
          ? phones
              .split(/[\n,;]+/)
              .map((p) => p.trim())
              .filter(Boolean)
          : [phone].map((p) => p.trim()).filter(Boolean)
      const res = await calculateSmsPrice({
        sending_type: mode === "pattern" ? "pattern" : mode === "p2p" ? "peer_to_peer" : "webservice",
        from_number: from || undefined,
        message: message || "",
        recipients,
        recipient_count: Math.max(1, recipients.length),
        params:
          mode === "pattern"
            ? { code: patternCode, values: paramValues }
            : mode === "p2p"
              ? { groups: [{ message, recipients }] }
              : { message },
      })
      if (res.customer_cost != null) {
        const parts = res.parts
        setPriceHint(parts && parts > 1 ? `${res.customer_cost} (${parts}×)` : String(res.customer_cost))
      }
    } catch {
      setPriceHint("")
    }
  }

  const submit = async () => {
    if (mode === "p2p") {
      const list = phones
        .split(/[\n,;]+/)
        .map((p) => normalizeIranPhone(p.trim()))
        .filter((p): p is string => !!p)
      if (!list.length) {
        toast.error(t("invalidPhone"))
        return
      }
      setLoading(true)
      try {
        const res = await sendSmsP2p({
          sending_type: "peer_to_peer",
          from_number: from || undefined,
          params: { groups: [{ message, recipients: list }] },
        })
        if (res.ok) toast.success(t("sent"))
        else toast.error(t("sendFailed"))
      } catch (e) {
        toast.error(getApiErrorMessage(e as Error))
      }
      setLoading(false)
      return
    }

    const normalized = normalizeIranPhone(phone)
    if (!normalized) {
      toast.error(t("invalidPhone"))
      return
    }

    setLoading(true)
    try {
      if (mode === "pattern") {
        if (!patternCode.trim()) {
          toast.error(t("patternCodeRequired"))
          setLoading(false)
          return
        }
        const params: Record<string, string> = {}
        for (const key of patternVars) params[key] = paramValues[key] ?? ""
        const res = await sendSms({
          sending_type: "pattern",
          from_number: from || serviceLine || undefined,
          code: patternCode.trim(),
          recipients: [normalized],
          params,
          send_time: sendTime || undefined,
        })
        if (res.ok) toast.success(t("sent"))
        else toast.error(t("sendFailed"))
      } else {
        if (!message.trim()) {
          toast.error(t("messageRequired"))
          setLoading(false)
          return
        }
        const res = await sendSms({
          phone: normalized,
          message,
          from_number: from || personalLine || undefined,
          send_time: sendTime || undefined,
        })
        if (res.ok) toast.success(t("sent"))
        else toast.error(t("sendFailed"))
      }
    } catch (e) {
      toast.error(getApiErrorMessage(e as Error))
    }
    setLoading(false)
  }

  return (
    <SmsPanelShell title={t("sendTitle")} description={t("sendHint")}>
      {numbersQ.isError ? (
        <SmsServiceBanner message={getApiErrorMessage(numbersQ.error)} onRetry={() => void numbersQ.refetch()} />
      ) : null}
      {unavailable ? (
        <SmsServiceBanner message={String(numbersQ.data?.message ?? "")} onRetry={() => void numbersQ.refetch()} />
      ) : null}

      <Card className="max-w-xl shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">{t("sendTitle")}</CardTitle>
          <CardDescription>{t("lineHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset disabled={unavailable} className="space-y-4">
            <div className="space-y-1">
              <Label>{t("messageKind")}</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as MessageKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transactional">{t("kindTransactional")}</SelectItem>
                  <SelectItem value="marketing">{t("kindMarketing")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("sendMode")}</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as SendMode)} disabled={kind === "transactional"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="webservice">{t("modeWebservice")}</SelectItem>
                  <SelectItem value="pattern">{t("modePattern")}</SelectItem>
                  <SelectItem value="p2p">{t("modeP2p")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("fromNumber")}</Label>
              {numbers.length > 0 ? (
                <Select value={from} onValueChange={setFrom}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("fromNumber")} />
                  </SelectTrigger>
                  <SelectContent>
                    {numbers.map((n) => (
                      <SelectItem key={`${n.role}-${n.number}`} value={n.number}>
                        {n.number} ({n.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="+983000505" dir="ltr" />
              )}
            </div>
            {mode === "p2p" ? (
              <div className="space-y-1">
                <Label>{t("phonesList")}</Label>
                <Textarea className="font-mono text-sm" rows={4} value={phones} onChange={(e) => setPhones(e.target.value)} />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>{t("phone")}</Label>
                <Input className="font-mono" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxxxx" />
              </div>
            )}
            {mode === "pattern" ? (
              <>
                <div className="space-y-1">
                  <Label>{t("patternCode")}</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input className="font-mono" dir="ltr" value={patternCode} onChange={(e) => setPatternCode(e.target.value)} />
                    <Select value={patternCode || undefined} onValueChange={setPatternCode}>
                      <SelectTrigger className="sm:w-56">
                        <SelectValue placeholder={t("pickPattern")} />
                      </SelectTrigger>
                      <SelectContent>
                        {patterns.map((p) => {
                          const code = (p.pattern_code ?? "").trim()
                          if (!code) return null
                          return (
                            <SelectItem key={code} value={code}>
                              {p.title ? `${p.title} (${code})` : code}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedPattern?.pattern_message ? (
                    <p className="text-muted-foreground mt-2 text-xs" dir="auto">
                      {selectedPattern.pattern_message}
                    </p>
                  ) : null}
                </div>
                {patternVars.length > 0 ? (
                  <div className="space-y-3 rounded-xl border p-3">
                    <Label>{t("patternParams")}</Label>
                    {patternVars.map((key) => (
                      <div key={key} className="space-y-1">
                        <Label className="font-mono text-xs" dir="ltr">
                          %{key}%
                        </Label>
                        <Input
                          value={paramValues[key] ?? ""}
                          onChange={(e) => setParamValues((prev) => ({ ...prev, [key]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">{t("noPatternVars")}</p>
                )}
              </>
            ) : (
              <div className="space-y-1">
                <Label>{t("message")}</Label>
                <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
            )}
            {priceHint ? <p className="text-muted-foreground text-sm">{t("estimatedCost", { cost: priceHint })}</p> : null}
            <div className="space-y-1">
              <Label>{t("sendTime")}</Label>
              <Input type="datetime-local" value={sendTime} onChange={(e) => setSendTime(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void estimate()}>
                {t("estimatePrice")}
              </Button>
              <Button type="button" disabled={loading} onClick={() => void submit()}>
                {loading ? <Loader2 className="me-2 size-4 animate-spin" /> : null}
                {t("send")}
              </Button>
            </div>
          </fieldset>
        </CardContent>
      </Card>
    </SmsPanelShell>
  )
}
