"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type FieldDef =
  | { key: string; type: "text" | "password" | "number" | "textarea" | "readonly"; label: string; hint?: string }
  | { key: string; type: "switch"; label: string; hint?: string }
  | { key: string; type: "select"; label: string; options: { value: string; label: string }[] }

const PROVIDER_FIELDS: Record<string, FieldDef[]> = {
  zarinpal: [
    { key: "merchant_id", type: "password", label: "merchant_id" },
    { key: "access_token", type: "password", label: "access_token" },
    { key: "sandbox", type: "switch", label: "sandbox" },
    { key: "title", type: "text", label: "title" },
    { key: "description", type: "textarea", label: "description" },
    { key: "instructions", type: "textarea", label: "instructions" },
    { key: "payment_description", type: "text", label: "payment_description" },
    { key: "order_button_text", type: "text", label: "order_button_text" },
    { key: "success_message", type: "text", label: "success_message" },
    { key: "failed_message", type: "text", label: "failed_message" },
    { key: "cancelled_message", type: "text", label: "cancelled_message" },
    { key: "invalid_token_message", type: "text", label: "invalid_token_message" },
    { key: "fee_label", type: "text", label: "fee_label" },
    {
      key: "fee_payer",
      type: "select",
      label: "fee_payer",
      options: [
        { value: "merchant", label: "merchant" },
        { value: "customer", label: "customer" },
      ],
    },
    { key: "icon_url", type: "text", label: "icon_url" },
    { key: "redact_logs", type: "switch", label: "redact_logs" },
    { key: "callback_url", type: "readonly", label: "callback_url" },
  ],
  digipay: [
    {
      key: "environment",
      type: "select",
      label: "environment",
      options: [
        { value: "staging", label: "staging" },
        { value: "live", label: "live" },
      ],
    },
    { key: "client_id", type: "text", label: "client_id" },
    { key: "client_secret", type: "password", label: "client_secret" },
    { key: "username", type: "text", label: "username" },
    { key: "password", type: "password", label: "password" },
    { key: "digipay_version", type: "text", label: "digipay_version" },
    { key: "seller_id", type: "text", label: "seller_id" },
    { key: "supplier_id", type: "text", label: "supplier_id" },
    { key: "category_id", type: "text", label: "category_id" },
    { key: "product_type", type: "number", label: "product_type" },
    { key: "preferred_gateway", type: "number", label: "preferred_gateway", hint: "0=wallet 2=ipg" },
    { key: "title_ipg", type: "text", label: "title_ipg" },
    { key: "description_ipg", type: "textarea", label: "description_ipg" },
    { key: "title_wallet", type: "text", label: "title_wallet" },
    { key: "description_wallet", type: "textarea", label: "description_wallet" },
    { key: "title_cpg", type: "text", label: "title_cpg" },
    { key: "description_cpg", type: "textarea", label: "description_cpg" },
    { key: "title_bpg", type: "text", label: "title_bpg" },
    { key: "description_bpg", type: "textarea", label: "description_bpg" },
    { key: "order_button_text", type: "text", label: "order_button_text" },
    { key: "success_message", type: "text", label: "success_message" },
    { key: "failed_message", type: "text", label: "failed_message" },
    { key: "cancelled_message", type: "text", label: "cancelled_message" },
    { key: "icon_url", type: "text", label: "icon_url" },
    { key: "callback_url", type: "readonly", label: "callback_url" },
  ],
  snapppay: [
    { key: "base_url", type: "text", label: "base_url" },
    { key: "client_id", type: "text", label: "client_id" },
    { key: "client_secret", type: "password", label: "client_secret" },
    { key: "client_username", type: "text", label: "client_username" },
    { key: "client_password", type: "password", label: "client_password" },
    { key: "title", type: "text", label: "title" },
    { key: "description", type: "textarea", label: "description" },
    { key: "mobile_enabled", type: "switch", label: "mobile_enabled" },
    { key: "postal_enabled", type: "switch", label: "postal_enabled" },
    { key: "default_gateway", type: "switch", label: "default_gateway" },
    { key: "has_comission", type: "switch", label: "has_comission" },
    { key: "has_pdp", type: "switch", label: "has_pdp" },
    { key: "dark_pdp", type: "switch", label: "dark_pdp" },
    { key: "direct_payment", type: "switch", label: "direct_payment" },
    { key: "success_message", type: "text", label: "success_message" },
    { key: "failed_message", type: "text", label: "failed_message" },
    { key: "cancelled_message", type: "text", label: "cancelled_message" },
    { key: "server_ip", type: "readonly", label: "server_ip" },
    { key: "callback_url", type: "readonly", label: "callback_url" },
  ],
  torobpay: [
    { key: "base_url", type: "text", label: "base_url" },
    { key: "client_id", type: "text", label: "client_id" },
    { key: "client_secret", type: "password", label: "client_secret" },
    { key: "client_username", type: "text", label: "client_username" },
    { key: "client_password", type: "password", label: "client_password" },
    { key: "title", type: "text", label: "title" },
    { key: "description", type: "textarea", label: "description" },
    { key: "mobile_enabled", type: "switch", label: "mobile_enabled" },
    { key: "postal_enabled", type: "switch", label: "postal_enabled" },
    { key: "default_gateway", type: "switch", label: "default_gateway" },
    { key: "direct_payment", type: "switch", label: "direct_payment" },
    { key: "disable_payment_retry", type: "switch", label: "disable_payment_retry" },
    { key: "utm_torob_enabled", type: "switch", label: "utm_torob_enabled" },
    { key: "utm_exclude_others", type: "switch", label: "utm_exclude_others" },
    { key: "dns_smart_resolve_enabled", type: "switch", label: "dns_smart_resolve_enabled" },
    { key: "dns_ip_override", type: "text", label: "dns_ip_override" },
    { key: "settle_enabled", type: "switch", label: "settle_enabled" },
    { key: "widget_enabled", type: "switch", label: "widget_enabled" },
    { key: "badge_enabled", type: "switch", label: "badge_enabled" },
    { key: "marquee_enabled", type: "switch", label: "marquee_enabled" },
    { key: "topbar_enabled", type: "switch", label: "topbar_enabled" },
    { key: "slider_enabled", type: "switch", label: "slider_enabled" },
    { key: "success_message", type: "text", label: "success_message" },
    { key: "failed_message", type: "text", label: "failed_message" },
    { key: "server_ip", type: "readonly", label: "server_ip" },
    { key: "callback_url", type: "readonly", label: "callback_url" },
  ],
  bale_pay: [
    { key: "title", type: "text", label: "title" },
    { key: "description", type: "textarea", label: "description" },
    { key: "instructions", type: "textarea", label: "instructions" },
    { key: "order_button_text", type: "text", label: "order_button_text" },
    { key: "success_message", type: "text", label: "success_message" },
    { key: "failed_message", type: "text", label: "failed_message" },
    { key: "icon_url", type: "text", label: "icon_url" },
  ],
  wallet: [
    { key: "enabled", type: "switch", label: "enabled" },
    { key: "title", type: "text", label: "title" },
    { key: "description", type: "textarea", label: "description" },
    { key: "order_button_text", type: "text", label: "order_button_text" },
    { key: "login_prompt", type: "text", label: "login_prompt" },
    { key: "balance_label", type: "text", label: "balance_label" },
    { key: "icon_url", type: "text", label: "icon_url" },
    { key: "min_topup", type: "number", label: "min_topup" },
  ],
  c2c: [
    { key: "enabled", type: "switch", label: "enabled" },
    { key: "title", type: "text", label: "title" },
    { key: "description", type: "textarea", label: "description" },
    { key: "instructions", type: "textarea", label: "instructions" },
    { key: "order_button_text", type: "text", label: "order_button_text" },
    { key: "icon_url", type: "text", label: "icon_url" },
    { key: "iban", type: "text", label: "iban" },
    { key: "deadline_h", type: "number", label: "deadline_h" },
  ],
}

type CardRow = { number: string; name: string; bank: string }

export function GatewayProviderSettingsPanel({
  provider,
}: {
  provider: keyof typeof PROVIDER_FIELDS
}) {
  const t = useTranslations("payments_gateway")
  const tHub = useTranslations("payments_hub")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const fields = PROVIDER_FIELDS[provider] ?? []
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const [cards, setCards] = useState<CardRow[]>([{ number: "", name: "", bank: "" }])

  const q = useQuery({
    queryKey: ["payment-gateway", provider],
    queryFn: () =>
      api<{ settings: Record<string, unknown> }>(`/api/v1/payments/gateways/${provider}`),
  })

  useEffect(() => {
    if (!q.data?.settings) return
    const s = { ...q.data.settings }
    for (const key of ["access_token", "client_secret", "password", "client_password", "merchant_id"]) {
      if (s[`has_${key}`]) s[key] = ""
      delete s[`has_${key}`]
    }
    setDraft(s)
    if (provider === "c2c") {
      const raw = Array.isArray(s.cards) ? (s.cards as CardRow[]) : []
      setCards(raw.length ? raw : [{ number: "", name: "", bank: "" }])
    }
  }, [q.data, provider])

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...(draft ?? {}) }
      if (provider === "c2c") {
        payload.cards = cards.filter((c) => c.number.trim() !== "")
      }
      return api(`/api/v1/payments/gateways/${provider}`, {
        method: "POST",
        json: { settings: payload },
      })
    },
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await qc.invalidateQueries({ queryKey: ["payment-gateway", provider] })
      await qc.invalidateQueries({ queryKey: ["payments-hub"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (!draft && q.isLoading) {
    return <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
  }
  if (!draft) return null

  const titleKey = provider === "bale_pay" ? "bale_pay" : provider

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/settings/shop/payments">{tHub("back_to_hub")}</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tHub(titleKey as "zarinpal")}</CardTitle>
          <CardDescription>{tHub(`${titleKey}_desc` as "zarinpal_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
              const label = t(`fields.${field.label}` as "fields.title")
              if (field.type === "switch") {
                return (
                  <div
                    key={field.key}
                    className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3 sm:col-span-2"
                  >
                    <div>
                      <Label>{label}</Label>
                      {"hint" in field && field.hint ? (
                        <p className="text-muted-foreground text-xs">{field.hint}</p>
                      ) : null}
                    </div>
                    <Switch
                      checked={Boolean(draft[field.key])}
                      onCheckedChange={(v) => setDraft({ ...draft, [field.key]: v })}
                    />
                  </div>
                )
              }
              if (field.type === "textarea") {
                return (
                  <div key={field.key} className="space-y-2 sm:col-span-2">
                    <Label>{label}</Label>
                    <Textarea
                      rows={2}
                      value={String(draft[field.key] ?? "")}
                      onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                    />
                  </div>
                )
              }
              if (field.type === "select") {
                return (
                  <div key={field.key} className="space-y-2">
                    <Label>{label}</Label>
                    <select
                      className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                      value={String(draft[field.key] ?? field.options[0]?.value ?? "")}
                      onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                    >
                      {field.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {t(`fields.${o.label}` as "fields.merchant")}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              }
              return (
                <div key={field.key} className="space-y-2">
                  <Label>{label}</Label>
                  <Input
                    type={field.type === "number" ? "number" : field.type === "password" ? "password" : "text"}
                    readOnly={field.type === "readonly"}
                    className={field.type === "readonly" ? "bg-muted font-mono" : field.type === "password" ? "font-mono" : undefined}
                    dir={field.type === "readonly" || field.type === "password" ? "ltr" : undefined}
                    placeholder={
                      field.type === "password" && q.data?.settings?.[`has_${field.key}`]
                        ? "••••••••"
                        : undefined
                    }
                    value={String(draft[field.key] ?? "")}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [field.key]:
                          field.type === "number" ? Number(e.target.value) : e.target.value,
                      })
                    }
                  />
                  {"hint" in field && field.hint ? (
                    <p className="text-muted-foreground text-xs">{field.hint}</p>
                  ) : null}
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

          <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? tCommon("saving") : tCommon("save")}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
