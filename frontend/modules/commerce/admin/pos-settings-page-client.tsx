"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useEnumLabel } from "@/lib/enum-labels"

import {
  type PayLinkFieldConfig,
  type PosCardReader,
  type PosPaymentMethod,
  type PosSettings,
  fetchPosSettings,
  savePosSettings,
} from "../lib/pos-commerce"

const FIELD_KEYS = [
  "customer_name",
  "customer_phone",
  "customer_email",
  "province",
  "city",
  "address",
  "plaque",
  "unit",
  "postcode",
  "shipping_method",
  "qty_edit",
] as const

type Gateway = { id: string; label: string }

export default function PosSettingsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("pos_admin")
  const tCommon = useTranslations("common")
  const enumLabel = useEnumLabel()
  const queryClient = useQueryClient()

  const [methods, setMethods] = useState<PosPaymentMethod[]>([])
  const [readers, setReaders] = useState<PosCardReader[]>([])
  const [fields, setFields] = useState<Record<string, PayLinkFieldConfig>>({})
  const [offlineInstructions, setOfflineInstructions] = useState<Record<string, string>>({})
  const [sendSms, setSendSms] = useState(true)
  const [autoCreate, setAutoCreate] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const OFFLINE_INSTRUCTION_KEYS = ["card_to_card", "wallet", "cod", "cash", "other"] as const

  const { data, isLoading } = useQuery({
    queryKey: ["pos-settings"],
    queryFn: fetchPosSettings,
  })

  const { data: gateways = [] } = useQuery({
    queryKey: ["payment-gateways"],
    queryFn: () => api<Gateway[]>("/api/v1/payment-gateways"),
  })

  useEffect(() => {
    if (!data) return
    setMethods(data.payment_methods ?? [])
    setReaders(data.card_readers ?? [])
    setFields(data.pay_link_fields ?? {})
    setOfflineInstructions(data.offline_instructions ?? {})
    setSendSms(Boolean(data.pay_link_send_sms))
    setAutoCreate(Boolean(data.auto_create_customer))
  }, [data])

  const save = useMutation({
    mutationFn: () =>
      savePosSettings({
        payment_methods: methods,
        card_readers: readers.filter((r) => r.name.trim()),
        pay_link_fields: fields,
        pay_link_send_sms: sendSms,
        auto_create_customer: autoCreate,
        offline_instructions: offlineInstructions,
      }),
    onSuccess: async (row: PosSettings) => {
      setSaved(true)
      setError(null)
      setMethods(row.payment_methods ?? [])
      setReaders(row.card_readers ?? [])
      setFields(row.pay_link_fields ?? {})
      setOfflineInstructions(row.offline_instructions ?? {})
      setSendSms(Boolean(row.pay_link_send_sms))
      setAutoCreate(Boolean(row.auto_create_customer))
      await queryClient.invalidateQueries({ queryKey: ["pos-settings"] })
    },
    onError: (e: Error) => {
      setSaved(false)
      setError(getApiErrorMessage(e))
    },
  })

  function patchMethod(id: string, patch: Partial<PosPaymentMethod>) {
    setMethods((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
    setSaved(false)
  }

  function toggleGateway(methodId: string, gatewayId: string, checked: boolean) {
    setMethods((prev) =>
      prev.map((m) => {
        if (m.id !== methodId) return m
        const current = m.gateway_ids ?? []
        const next = checked
          ? [...current.filter((x) => x !== gatewayId), gatewayId]
          : current.filter((x) => x !== gatewayId)
        return { ...m, gateway_ids: next }
      }),
    )
    setSaved(false)
  }

  function patchField(key: string, patch: Partial<PayLinkFieldConfig>) {
    setFields((prev) => ({
      ...prev,
      [key]: {
        visible: prev[key]?.visible ?? true,
        required: prev[key]?.required ?? false,
        customer_editable: prev[key]?.customer_editable ?? true,
        ...patch,
      },
    }))
    setSaved(false)
  }

  function addReader() {
    const id = `reader_${Date.now().toString(36)}`
    setReaders((prev) => [...prev, { id, name: "", enabled: true }])
    setSaved(false)
  }

  const onlineMethods = methods.filter((m) => m.type === "online")

  return (
    <PageShell
      title={t("settings_title")}
      description={t("settings_hint")}
      actions={
        <>
          <Button variant="outline" asChild>
            <Link href="/dashboard/pos">{t("back_pos")}</Link>
          </Button>
          <Button disabled={save.isPending || isLoading} onClick={() => save.mutate()}>
            {tCommon("save")}
          </Button>
        </>
      }
    >
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {saved ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{t("settings_saved")}</p> : null}

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">{t("payment_methods_heading")}</h2>
        <p className="text-muted-foreground text-xs">{t("payment_methods_hint")}</p>
        <ul className="space-y-2">
          {methods.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
              <label className="flex min-w-[160px] flex-1 items-center gap-2">
                <Checkbox
                  checked={m.enabled}
                  onCheckedChange={(v) => patchMethod(m.id, { enabled: v === true })}
                />
                <span>{enumLabel("payment_tender", m.id)}</span>
              </label>
              <Input
                className="max-w-xs"
                value={m.label ?? ""}
                placeholder={t("custom_label_ph")}
                onChange={(e) => patchMethod(m.id, { label: e.target.value })}
              />
              <span className="text-muted-foreground text-xs">{m.type}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{t("gateways_map_heading")}</h2>
            <p className="text-muted-foreground text-xs">{t("gateways_map_hint")}</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/settings/shop/gateways">{t("gateways_hub_link")}</Link>
          </Button>
        </div>
        {gateways.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("no_gateways")}</p>
        ) : (
          <ul className="space-y-4">
            {onlineMethods.map((m) => (
              <li key={m.id} className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">
                  {m.label?.trim() || enumLabel("payment_tender", m.id)}
                </p>
                <p className="text-muted-foreground text-xs">{t("gateways_map_empty_means_all")}</p>
                <div className="flex flex-wrap gap-3">
                  {gateways.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={(m.gateway_ids ?? []).includes(g.id)}
                        onCheckedChange={(v) => toggleGateway(m.id, g.id, v === true)}
                        disabled={!m.enabled}
                      />
                      {g.label}
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{t("card_readers_heading")}</h2>
            <p className="text-muted-foreground text-xs">{t("card_readers_hint")}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addReader}>
            <Plus className="size-4" />
            {t("add_card_reader")}
          </Button>
        </div>
        {readers.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("no_card_readers")}</p>
        ) : (
          <ul className="space-y-2">
            {readers.map((r, idx) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <Checkbox
                  checked={r.enabled}
                  onCheckedChange={(v) => {
                    setReaders((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, enabled: v === true } : x)),
                    )
                    setSaved(false)
                  }}
                />
                <Input
                  className="max-w-sm flex-1"
                  value={r.name}
                  placeholder={t("card_reader_name_ph")}
                  onChange={(e) => {
                    setReaders((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)),
                    )
                    setSaved(false)
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setReaders((prev) => prev.filter((_, i) => i !== idx))
                    setSaved(false)
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">{t("pay_link_fields_heading")}</h2>
        <p className="text-muted-foreground text-xs">{t("pay_link_fields_hint")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b text-start">
                <th className="py-2 pe-2 font-medium">{t("field_name")}</th>
                <th className="py-2 px-2 font-medium">{t("field_visible")}</th>
                <th className="py-2 px-2 font-medium">{t("field_required")}</th>
                <th className="py-2 ps-2 font-medium">{t("field_customer_editable")}</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_KEYS.map((key) => {
                const cfg = fields[key] ?? { visible: true, required: false, customer_editable: true }
                return (
                  <tr key={key} className="border-b border-border/60">
                    <td className="py-2 pe-2">{t(`field_${key}` as "field_customer_name")}</td>
                    <td className="py-2 px-2">
                      <Checkbox
                        checked={cfg.visible}
                        onCheckedChange={(v) => patchField(key, { visible: v === true })}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Checkbox
                        checked={cfg.required}
                        onCheckedChange={(v) => patchField(key, { required: v === true })}
                      />
                    </td>
                    <td className="py-2 ps-2">
                      <Checkbox
                        checked={cfg.customer_editable}
                        onCheckedChange={(v) => patchField(key, { customer_editable: v === true })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">{t("offline_instructions_heading")}</h2>
        <p className="text-muted-foreground text-xs">{t("offline_instructions_hint")}</p>
        <ul className="space-y-3">
          {OFFLINE_INSTRUCTION_KEYS.map((key) => (
            <li key={key} className="space-y-1.5">
              <Label className="text-sm">{t(`offline_key_${key}` as "offline_key_card_to_card")}</Label>
              <textarea
                className="border-input bg-background min-h-[72px] w-full rounded-md border px-3 py-2 text-sm"
                value={offlineInstructions[key] ?? ""}
                placeholder={t("offline_instructions_ph")}
                onChange={(e) => {
                  setOfflineInstructions((prev) => ({ ...prev, [key]: e.target.value }))
                  setSaved(false)
                }}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">{t("general_heading")}</h2>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={autoCreate}
            onCheckedChange={(v) => {
              setAutoCreate(v === true)
              setSaved(false)
            }}
          />
          {t("auto_create_customer")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={sendSms}
            onCheckedChange={(v) => {
              setSendSms(v === true)
              setSaved(false)
            }}
          />
          {t("pay_link_send_sms")}
        </label>
      </section>
    </PageShell>
  )
}
