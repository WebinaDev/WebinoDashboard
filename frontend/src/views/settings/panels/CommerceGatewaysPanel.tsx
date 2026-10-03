"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { toLocaleDigits } from "@/lib/locale"

type GatewayId = "zarinpal" | "digipay" | "snapppay" | "torobpay"

const GATEWAYS: GatewayId[] = ["zarinpal", "digipay", "snapppay", "torobpay"]

type Settings = Record<string, unknown>

const SECRET_KEYS = ["access_token", "client_secret", "password", "client_password"]

function blankSecrets(settings: Settings): Settings {
  const next = { ...settings }
  for (const key of SECRET_KEYS) {
    if (next[`has_${key}`]) next[key] = ""
    delete next[`has_${key}`]
  }
  return next
}

export function CommerceGatewaysPanel() {
  const t = useTranslations("commerce_gateways")
  const tHub = useTranslations("payments_hub")
  const locale = useLocale()

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("hint")}</p>
      </div>
      <p className="text-muted-foreground text-xs">{t("fee_hint")}</p>
      {GATEWAYS.map((id) => (
        <GatewayCard key={id} id={id} title={tHub(id)} locale={locale} />
      ))}
    </div>
  )
}

function GatewayCard({ id, title, locale }: { id: GatewayId; title: string; locale: string }) {
  const t = useTranslations("commerce_gateways")
  const tHub = useTranslations("payments_hub")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Settings | null>(null)
  const [enabled, setEnabled] = useState(false)

  const q = useQuery({
    queryKey: ["payment-gateway", id],
    queryFn: () => api<{ settings: Settings; enabled?: boolean }>(`/api/v1/payments/gateways/${id}`),
  })

  const hubQ = useQuery({
    queryKey: ["payments-hub"],
    queryFn: () => api<{ items: Array<{ id: string; enabled: boolean }> }>("/api/v1/payments/hub"),
  })

  useEffect(() => {
    if (!q.data?.settings) return
    setDraft(blankSecrets(q.data.settings))
  }, [q.data])

  useEffect(() => {
    const item = hubQ.data?.items?.find((row) => row.id === id)
    if (item) setEnabled(item.enabled)
    else if (typeof q.data?.enabled === "boolean") setEnabled(q.data.enabled)
  }, [hubQ.data, q.data, id])

  const save = useMutation({
    mutationFn: async () => {
      const settings = { ...(draft ?? {}) }
      if (id === "digipay") {
        settings.environment = settings.environment === "live" ? "live" : "staging"
      }
      return api(`/api/v1/payments/gateways/${id}`, {
        method: "POST",
        json: { settings, enabled },
      })
    },
    onSuccess: async () => {
      toast.success(t("saved"))
      await qc.invalidateQueries({ queryKey: ["payment-gateway", id] })
      await qc.invalidateQueries({ queryKey: ["payments-hub"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (!draft) {
    return <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
  }

  const sandboxOn = id === "digipay" ? draft.environment !== "live" : Boolean(draft.sandbox)
  const fee = Number(draft.fee_percent ?? 0)

  function set<K extends string>(key: K, value: unknown) {
    setDraft((prev) => ({ ...(prev ?? {}), [key]: value }))
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{tHub(`${id}_desc` as "zarinpal_desc")}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`${id}-enabled`}>{t("enabled")}</Label>
          <Switch id={`${id}-enabled`} checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Flag label={t("cash")} checked={Boolean(draft.cash_enabled)} onChange={(v) => set("cash_enabled", v)} />
          <Flag
            label={t("installment")}
            checked={Boolean(draft.installment_enabled)}
            onChange={(v) => set("installment_enabled", v)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${id}-fee`}>{t("fee_percent")}</Label>
            <Input
              id={`${id}-fee`}
              type="number"
              min={0}
              max={100}
              step="0.01"
              dir="ltr"
              value={String(draft.fee_percent ?? 0)}
              onChange={(e) => set("fee_percent", e.target.value === "" ? 0 : Number(e.target.value))}
            />
            <p className="text-muted-foreground text-xs">
              {fee > 0 ? toLocaleDigits(String(fee), locale) + (locale === "fa" ? "٪" : "%") : t("empty")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-payer`}>{t("fee_payer")}</Label>
            <select
              id={`${id}-payer`}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={String(draft.fee_payer ?? "merchant")}
              onChange={(e) => set("fee_payer", e.target.value)}
            >
              <option value="merchant">{t("payer_merchant")}</option>
              <option value="customer">{t("payer_customer")}</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3">
          <div>
            <p className="text-sm font-medium">{t("environment")}</p>
            <p className="text-muted-foreground text-xs">{sandboxOn ? t("sandbox") : t("production")}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">{t("production")}</span>
            <Switch
              checked={sandboxOn}
              onCheckedChange={(on) => {
                if (id === "digipay") set("environment", on ? "staging" : "live")
                else set("sandbox", on)
              }}
              aria-label={t("sandbox")}
            />
            <span className="text-xs">{t("sandbox")}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {fieldsFor(id).map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`${id}-${field.key}`}>{t(field.label)}</Label>
              <Input
                id={`${id}-${field.key}`}
                type={field.secret ? "password" : "text"}
                dir="ltr"
                className="font-mono"
                autoComplete="off"
                placeholder={field.secret && q.data?.settings?.[`has_${field.key}`] ? "••••••••" : undefined}
                value={String(draft[field.key] ?? "")}
                onChange={(e) => set(field.key, e.target.value)}
              />
            </div>
          ))}
        </div>

        <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? tCommon("saving") : t("save")}
        </Button>
      </CardContent>
    </Card>
  )
}

function Flag({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function fieldsFor(id: GatewayId): Array<{ key: string; label: "merchant_id" | "access_token" | "client_id" | "client_secret" | "username" | "password" | "client_username" | "client_password" | "base_url"; secret?: boolean }> {
  if (id === "zarinpal") {
    return [
      { key: "merchant_id", label: "merchant_id" },
      { key: "access_token", label: "access_token", secret: true },
    ]
  }
  if (id === "digipay") {
    return [
      { key: "client_id", label: "client_id" },
      { key: "client_secret", label: "client_secret", secret: true },
      { key: "username", label: "username" },
      { key: "password", label: "password", secret: true },
    ]
  }
  return [
    { key: "base_url", label: "base_url" },
    { key: "client_id", label: "client_id" },
    { key: "client_secret", label: "client_secret", secret: true },
    { key: "client_username", label: "client_username" },
    { key: "client_password", label: "client_password", secret: true },
  ]
}
