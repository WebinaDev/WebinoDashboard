"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { MediaPickerField } from "@/components/content/MediaPickerField"
import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type FieldDef = {
  key: string
  type?: string
  secret?: boolean
  hint?: string
}

type GatewayMeta = {
  id: string
  status?: string
  category?: string
  label_fa?: string
  label_en?: string
  docs_url?: string | null
  fields?: FieldDef[]
  coming_soon?: boolean
}

type CardRow = { number: string; name: string; bank: string }

const LEGACY_FIELDS: Record<string, FieldDef[]> = {
  zarinpal: [
    { key: "merchant_id", type: "password", secret: true },
    { key: "access_token", type: "password", secret: true },
    { key: "sandbox", type: "switch" },
    { key: "cash_enabled", type: "switch" },
    { key: "installment_enabled", type: "switch" },
    { key: "fee_percent", type: "number" },
    { key: "title", type: "text" },
    { key: "fee_payer", type: "select" },
    { key: "callback_url", type: "readonly" },
  ],
  zibal: [
    { key: "merchant_id", type: "password", secret: true },
    { key: "cash_enabled", type: "switch" },
    { key: "fee_percent", type: "number" },
    { key: "title", type: "text" },
    { key: "callback_url", type: "readonly" },
  ],
  digipay: [
    { key: "environment", type: "select" },
    { key: "client_id", type: "text" },
    { key: "client_secret", type: "password", secret: true },
    { key: "username", type: "text" },
    { key: "password", type: "password", secret: true },
    { key: "cash_enabled", type: "switch" },
    { key: "installment_enabled", type: "switch" },
    { key: "fee_percent", type: "number" },
    { key: "callback_url", type: "readonly" },
  ],
  snapppay: [
    { key: "base_url", type: "text" },
    { key: "client_id", type: "text" },
    { key: "client_secret", type: "password", secret: true },
    { key: "client_username", type: "text" },
    { key: "client_password", type: "password", secret: true },
    { key: "installment_enabled", type: "switch" },
    { key: "fee_percent", type: "number" },
    { key: "callback_url", type: "readonly" },
    { key: "server_ip", type: "readonly" },
  ],
  torobpay: [
    { key: "base_url", type: "text" },
    { key: "client_id", type: "text" },
    { key: "client_secret", type: "password", secret: true },
    { key: "client_username", type: "text" },
    { key: "client_password", type: "password", secret: true },
    { key: "installment_enabled", type: "switch" },
    { key: "settle_enabled", type: "switch" },
    { key: "callback_url", type: "readonly" },
  ],
  bale_pay: [
    { key: "title", type: "text" },
    { key: "description", type: "textarea" },
    { key: "instructions", type: "textarea" },
  ],
  wallet: [
    { key: "title", type: "text" },
    { key: "description", type: "textarea" },
    { key: "min_topup", type: "number" },
  ],
  c2c: [
    { key: "title", type: "text" },
    { key: "description", type: "textarea" },
    { key: "instructions", type: "textarea" },
    { key: "iban", type: "text" },
    { key: "deadline_h", type: "number" },
    { key: "smart_verify", type: "switch" },
  ],
}

const SECRET_HINT_KEYS = [
  "access_token",
  "client_secret",
  "password",
  "client_password",
  "merchant_id",
  "api_key",
  "api_token",
  "secret_key",
  "terminal_key",
  "private_key",
  "public_key",
  "pin",
  "login_account",
  "webhook_secret",
  "ipn_secret",
  "publishable_key",
  "passphrase",
  "alternate_passphrase",
]

export function GatewayProviderSettingsPanel({ provider }: { provider: string }) {
  const t = useTranslations("payments_gateway")
  const tHub = useTranslations("payments_hub")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [cards, setCards] = useState<CardRow[]>([{ number: "", name: "", bank: "" }])
  const [meta, setMeta] = useState<GatewayMeta | null>(null)

  const q = useQuery({
    queryKey: ["payment-gateway", provider],
    queryFn: () =>
      api<{ settings: Record<string, unknown>; enabled?: boolean }>(
        `/api/v1/payments/gateways/${provider}`,
      ),
  })

  useEffect(() => {
    if (!q.data?.settings) return
    const s = { ...q.data.settings }
    const m = (s._meta as GatewayMeta | undefined) ?? null
    setMeta(m)
    delete s._meta
    for (const key of SECRET_HINT_KEYS) {
      if (s[`has_${key}`]) s[key] = ""
      delete s[`has_${key}`]
    }
    setDraft(s)
    if (typeof q.data.enabled === "boolean") setEnabled(q.data.enabled)
    if (provider === "c2c") {
      const raw = Array.isArray(s.cards) ? (s.cards as CardRow[]) : []
      setCards(raw.length ? raw : [{ number: "", name: "", bank: "" }])
    }
  }, [q.data, provider])

  const fields = useMemo(() => {
    if (meta?.fields?.length) return meta.fields
    return LEGACY_FIELDS[provider] ?? []
  }, [meta, provider])

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...(draft ?? {}) }
      if (provider === "c2c") {
        payload.cards = cards.filter((c) => c.number.trim() !== "")
      }
      return api(`/api/v1/payments/gateways/${provider}`, {
        method: "POST",
        json: { settings: payload, enabled },
      })
    },
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await qc.invalidateQueries({ queryKey: ["payment-gateway", provider] })
      await qc.invalidateQueries({ queryKey: ["payments-hub"] })
      await qc.invalidateQueries({ queryKey: ["payment-gateways"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const test = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; message: string }>(`/api/v1/payments/gateways/${provider}/test`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      if (res.ok) toast.success(res.message || t("test_ok"))
      else toast.error(res.message || t("test_fail"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (!draft && q.isLoading) {
    return <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
  }
  if (!draft) return null

  const title =
    (locale.startsWith("fa") ? meta?.label_fa : meta?.label_en) ||
    (() => {
      try {
        return tHub(provider as "zarinpal")
      } catch {
        return provider
      }
    })()
  const soon = Boolean(meta?.coming_soon) || meta?.status === "scaffold"
  const desc = soon ? tHub("coming_soon_desc") : tHub("configure_hint")

  return (
    <PageShell
      title={title}
      description={desc}
      eyebrow={tHub("eyebrow")}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/settings/shop/payments">{tHub("back_to_hub")}</Link>
        </Button>
      }
    >
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {title}
              {soon ? <Badge variant="secondary">{tHub("coming_soon")}</Badge> : null}
            </CardTitle>
            <CardDescription>{desc}</CardDescription>
            {meta?.docs_url ? (
              <a
                href={meta.docs_url}
                target="_blank"
                rel="noreferrer"
                className="text-primary text-xs underline"
              >
                {tHub("docs")}
              </a>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`${provider}-enabled`}>{t("fields.enabled")}</Label>
            <Switch id={`${provider}-enabled`} checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {soon ? (
            <p className="bg-muted/40 rounded-lg border border-dashed px-3 py-2 text-xs">
              {tHub("scaffold_hint")}
            </p>
          ) : null}

          {provider === "bale_pay" && draft.status && typeof draft.status === "object" ? (
            <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
              {t("bale_status", {
                active: (draft.status as { bot_active?: boolean }).bot_active ? t("yes") : t("no"),
                token: (draft.status as { has_provider_token?: boolean }).has_provider_token
                  ? t("yes")
                  : t("no"),
              })}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => {
              const type = field.type ?? (field.secret ? "password" : "text")
              let label = field.key
              try {
                label = t(`fields.${field.key}` as "fields.title")
              } catch {
                label = field.key
              }
              if (type === "switch") {
                return (
                  <div
                    key={field.key}
                    className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3 sm:col-span-2"
                  >
                    <div>
                      <Label>{label}</Label>
                      {field.hint ? <p className="text-muted-foreground text-xs">{field.hint}</p> : null}
                    </div>
                    <Switch
                      checked={Boolean(draft[field.key])}
                      onCheckedChange={(v) => setDraft({ ...draft, [field.key]: v })}
                    />
                  </div>
                )
              }
              if (type === "textarea") {
                return (
                  <div key={field.key} className="space-y-2 sm:col-span-2">
                    <Label>{label}</Label>
                    <Textarea
                      rows={3}
                      className={field.secret ? "font-mono" : undefined}
                      dir={field.secret ? "ltr" : undefined}
                      value={String(draft[field.key] ?? "")}
                      onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                    />
                  </div>
                )
              }
              if (type === "select") {
                const options =
                  field.key === "environment"
                    ? [
                        { value: "staging", label: "staging" },
                        { value: "live", label: "live" },
                      ]
                    : field.key === "fee_payer"
                      ? [
                          { value: "merchant", label: "merchant" },
                          { value: "customer", label: "customer" },
                        ]
                      : []
                return (
                  <div key={field.key} className="space-y-2">
                    <Label>{label}</Label>
                    <select
                      className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                      value={String(draft[field.key] ?? options[0]?.value ?? "")}
                      onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                    >
                      {options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {t(`fields.${o.label}` as "fields.merchant")}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              }
              if (field.key === "icon_url") {
                return (
                  <div key={field.key} className="space-y-2 sm:col-span-2">
                    <MediaPickerField
                      label={label}
                      imageUrl={String(draft[field.key] ?? "")}
                      onPick={(item) => setDraft({ ...draft, [field.key]: item.url })}
                      onClear={() => setDraft({ ...draft, [field.key]: "" })}
                    />
                  </div>
                )
              }
              const isPassword = type === "password" || Boolean(field.secret)
              return (
                <div key={field.key} className="space-y-2">
                  <Label>{label}</Label>
                  <Input
                    type={type === "number" ? "number" : isPassword ? "password" : "text"}
                    readOnly={type === "readonly"}
                    className={
                      type === "readonly" ? "bg-muted font-mono" : isPassword ? "font-mono" : undefined
                    }
                    dir={type === "readonly" || isPassword ? "ltr" : undefined}
                    placeholder={
                      isPassword && q.data?.settings?.[`has_${field.key}`] ? "••••••••" : undefined
                    }
                    value={String(draft[field.key] ?? "")}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [field.key]: type === "number" ? Number(e.target.value) : e.target.value,
                      })
                    }
                  />
                  {field.hint ? <p className="text-muted-foreground text-xs">{field.hint}</p> : null}
                </div>
              )
            })}
          </div>

          {provider === "c2c" ? (
            <div className="space-y-3 rounded-xl border p-3">
              <Label>{t("fields.cards")}</Label>
              {cards.map((card, idx) => (
                <div key={idx} className="grid gap-2 sm:grid-cols-3">
                  <Input
                    dir="ltr"
                    className="font-mono"
                    placeholder={t("fields.card_number")}
                    value={card.number}
                    onChange={(e) => {
                      const next = [...cards]
                      next[idx] = { ...card, number: e.target.value }
                      setCards(next)
                    }}
                  />
                  <Input
                    placeholder={t("fields.card_name")}
                    value={card.name}
                    onChange={(e) => {
                      const next = [...cards]
                      next[idx] = { ...card, name: e.target.value }
                      setCards(next)
                    }}
                  />
                  <Input
                    placeholder={t("fields.card_bank")}
                    value={card.bank}
                    onChange={(e) => {
                      const next = [...cards]
                      next[idx] = { ...card, bank: e.target.value }
                      setCards(next)
                    }}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCards([...cards, { number: "", name: "", bank: "" }])}
              >
                {t("add_card")}
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? tCommon("saving") : tCommon("save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={test.isPending}
              onClick={() => test.mutate()}
            >
              {test.isPending ? tCommon("loading") : t("test_connection")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  )
}
