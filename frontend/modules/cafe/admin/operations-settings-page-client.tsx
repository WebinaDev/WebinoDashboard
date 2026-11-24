"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { CafeAdminShell, CafeSection } from "./cafe-admin-ui"

/**
 * Shift and service thresholds.
 *
 * The backend has served these since the operations work landed, but no screen ever
 * called it — the only way to change the "paid order can be edited for N minutes" window
 * was curl. That is the kind of setting an owner changes while standing at the counter,
 * so it needs a form.
 */

type OperationsSettings = {
  service_mode: "table" | "pager" | "none"
  paid_edit_window_minutes: number
  paid_edit_requires_approval: boolean
  kds_warn_after_minutes: number
  kds_late_after_minutes: number
  table_overdue_after_minutes: number
  queue_stale_after_minutes: number
  enforce_delivery_minimum: boolean
  default_delivery_eta_minutes: number
}

type Payload = { settings: Partial<OperationsSettings> | null; defaults: OperationsSettings }

/** The numeric fields, in the order they should read on screen. */
const NUMERIC: { key: keyof OperationsSettings; min: number; max: number }[] = [
  { key: "paid_edit_window_minutes", min: 0, max: 1440 },
  { key: "kds_warn_after_minutes", min: 1, max: 180 },
  { key: "kds_late_after_minutes", min: 1, max: 240 },
  { key: "table_overdue_after_minutes", min: 5, max: 600 },
  { key: "queue_stale_after_minutes", min: 1, max: 120 },
  { key: "default_delivery_eta_minutes", min: 5, max: 180 },
]

/** The boolean fields, each with the sentence it explains. */
const FLAGS: { key: keyof OperationsSettings; labelKey: string }[] = [
  { key: "paid_edit_requires_approval", labelKey: "flag_requires_approval" },
  { key: "enforce_delivery_minimum", labelKey: "flag_delivery_minimum" },
]

export default function OperationsSettingsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.operations_settings")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["cafe-operations-settings"],
    queryFn: () => api<Payload>("/api/v1/cafe/operations-settings"),
  })

  // Local draft so typing a number does not fire a request per keystroke. Seeded from
  // the tenant's stored values, falling back per-field to the backend's own defaults —
  // a tenant created before a key existed has no value for it.
  const [draft, setDraft] = useState<Partial<OperationsSettings> | null>(null)
  const values: Partial<OperationsSettings> = draft ?? data?.settings ?? data?.defaults ?? {}

  const save = useMutation({
    mutationFn: (body: Partial<OperationsSettings>) =>
      api<{ data: unknown }>("/api/v1/cafe/operations-settings", { method: "PUT", json: body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cafe-operations-settings"] })
      setDraft(null)
      toast.success(tCommon("saved"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const setNumber = (key: keyof OperationsSettings, raw: string, min: number, max: number) => {
    const parsed = Number(raw)
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : min
    setDraft({ ...values, [key]: next })
  }

  const toggle = (key: keyof OperationsSettings) => {
    setDraft({ ...values, [key]: !values[key] })
  }

  const dirty = draft !== null

  return (
    <CafeAdminShell
      title={t("title")}
      description={t("description")}
      actions={
        <Button
          onClick={() => save.mutate(draft ?? values)}
          disabled={!dirty || save.isPending}
        >
          {save.isPending ? tCommon("saving") : tCommon("save")}
        </Button>
      }
    >
      {isLoading ? <p className="text-muted-foreground text-sm">{tCommon("loading")}</p> : null}

      <CafeSection title={t("section_timing")} description={t("section_timing_hint")}>
        <div className="grid gap-4 sm:grid-cols-2">
          {NUMERIC.map(({ key, min, max }) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`op-${key}`}>{t(key)}</Label>
              <Input
                id={`op-${key}`}
                type="number"
                min={min}
                max={max}
                value={String(values[key] ?? min)}
                onChange={(e) => setNumber(key, e.target.value, min, max)}
              />
              <p className="text-muted-foreground text-xs">{t(`${key}_hint`, { min, max })}</p>
            </div>
          ))}
        </div>
      </CafeSection>

      <CafeSection title={t("section_service")} description={t("section_service_hint")}>
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="op-service-mode">{t("service_mode")}</Label>
          <select
            id="op-service-mode"
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            value={values.service_mode ?? "table"}
            onChange={(e) =>
              setDraft({
                ...values,
                service_mode: e.target.value as OperationsSettings["service_mode"],
              })
            }
          >
            <option value="table">{t("service_mode_table")}</option>
            <option value="pager">{t("service_mode_pager")}</option>
            <option value="none">{t("service_mode_none")}</option>
          </select>
          <p className="text-muted-foreground text-xs">{t(`service_mode_${values.service_mode ?? "table"}_hint`)}</p>
        </div>
      </CafeSection>

      <CafeSection title={t("section_rules")}>
        <div className="space-y-3">
          {FLAGS.map(({ key, labelKey }) => (
            <label key={key} className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={Boolean(values[key])}
                onChange={() => toggle(key)}
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{t(labelKey)}</span>
                <span className="text-muted-foreground block text-xs">{t(`${labelKey}_hint`)}</span>
              </span>
            </label>
          ))}
        </div>
      </CafeSection>
    </CafeAdminShell>
  )
}
