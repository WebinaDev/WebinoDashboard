"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { toLocaleDigits, normalizeUiLocale } from "@/lib/locale"
import { MoneyText } from "@/components/currency/MoneyDisplay"

import { CafeAdminShell, CafeEmptyState, cafeSelectClass } from "./cafe-admin-ui"

type Zone = {
  id: number
  name_fa: string
  name_en?: string | null
  areas?: string[] | null
  delivery_fee_minor: number
  minimum_order_minor: number
  eta_minutes?: number | null
  is_active: boolean
  sort_order: number
}

type Branch = { id: number; name: string }

type Draft = {
  name_fa: string
  name_en: string
  areas: string
  delivery_fee_minor: string
  minimum_order_minor: string
  eta_minutes: string
  is_active: boolean
}

const EMPTY: Draft = {
  name_fa: "",
  name_en: "",
  areas: "",
  delivery_fee_minor: "0",
  minimum_order_minor: "0",
  eta_minutes: "",
  is_active: true,
}

/**
 * Delivery zones: a fee and a minimum order per area.
 *
 * This table already existed and already priced nothing — the till stored a zone id and then
 * charged the flat fee from menu settings, so a shop that set up districts was charging
 * everybody the same. The screen is what makes the fee real.
 *
 * Areas are free-text tokens ("ولنجک", "سعادت‌آباد"); the resolver matches them as substrings
 * of the delivery address, so a district name is enough and no geocoding is required.
 */
export default function DeliveryZonesPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.delivery_zones")
  const tCommon = useTranslations("common")
  const locale = normalizeUiLocale(useLocale())
  const qc = useQueryClient()

  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [editing, setEditing] = useState<number | null>(null)
  const [branchId, setBranchId] = useState<string>("")

  const zonesQ = useQuery({
    queryKey: ["cafe-delivery-zones"],
    queryFn: () => api<Zone[]>("/api/v1/cafe/delivery-zones"),
  })

  const branchesQ = useQuery({
    queryKey: ["cafe-branches"],
    queryFn: () => api<Branch[]>("/api/v1/cafe/branches"),
    retry: false,
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["cafe-delivery-zones"] })
  }

  const toPayload = () => ({
    name_fa: draft.name_fa.trim(),
    name_en: draft.name_en.trim() || null,
    branch_id: branchId === "" ? null : Number(branchId),
    // Comma or newline separated; the resolver only needs the words.
    areas: draft.areas
      .split(/[,،\n]/)
      .map((a) => a.trim())
      .filter(Boolean),
    delivery_fee_minor: Number(draft.delivery_fee_minor || 0),
    minimum_order_minor: Number(draft.minimum_order_minor || 0),
    eta_minutes: draft.eta_minutes === "" ? null : Number(draft.eta_minutes),
    is_active: draft.is_active,
  })

  const save = useMutation({
    mutationFn: () =>
      editing === null
        ? api("/api/v1/cafe/delivery-zones", { method: "POST", json: toPayload() })
        : api(`/api/v1/cafe/delivery-zones/${editing}`, { method: "PATCH", json: toPayload() }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setDraft(EMPTY)
      setEditing(null)
      invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/v1/cafe/delivery-zones/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const startEdit = (zone: Zone) => {
    setEditing(zone.id)
    setDraft({
      name_fa: zone.name_fa,
      name_en: zone.name_en ?? "",
      areas: (zone.areas ?? []).join(locale === "fa" ? "، " : ", "),
      delivery_fee_minor: String(zone.delivery_fee_minor),
      minimum_order_minor: String(zone.minimum_order_minor),
      eta_minutes: zone.eta_minutes === null || zone.eta_minutes === undefined ? "" : String(zone.eta_minutes),
      is_active: zone.is_active,
    })
  }

  const zones = zonesQ.data ?? []
  const money = (n: number) => <MoneyText amount={n} currency="IRR" fallback="-" />

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editing === null ? t("new_zone") : t("edit_zone")}
            </CardTitle>
            <CardDescription>{t("hint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>{t("name")}</Label>
              <Input
                value={draft.name_fa}
                onChange={(e) => setDraft({ ...draft, name_fa: e.target.value })}
                placeholder={t("name_placeholder")}
              />
            </div>

            <div className="space-y-1">
              <Label>{t("areas")}</Label>
              <textarea
                className={`${cafeSelectClass} min-h-20 w-full py-2`}
                value={draft.areas}
                onChange={(e) => setDraft({ ...draft, areas: e.target.value })}
                placeholder={t("areas_placeholder")}
              />
              <p className="text-muted-foreground text-xs">{t("areas_hint")}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>{t("fee")}</Label>
                <Input
                  inputMode="numeric"
                  value={draft.delivery_fee_minor}
                  onChange={(e) => setDraft({ ...draft, delivery_fee_minor: e.target.value.replace(/\D/g, "") })}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("minimum")}</Label>
                <Input
                  inputMode="numeric"
                  value={draft.minimum_order_minor}
                  onChange={(e) => setDraft({ ...draft, minimum_order_minor: e.target.value.replace(/\D/g, "") })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>{t("eta")}</Label>
                <Input
                  inputMode="numeric"
                  value={draft.eta_minutes}
                  onChange={(e) => setDraft({ ...draft, eta_minutes: e.target.value.replace(/\D/g, "") })}
                />
              </div>
              {(branchesQ.data ?? []).length > 1 ? (
                <div className="space-y-1">
                  <Label>{t("branch")}</Label>
                  <select
                    className={cafeSelectClass}
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                  >
                    <option value="">{t("all_branches")}</option>
                    {(branchesQ.data ?? []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
              />
              {t("active")}
            </label>

            <div className="flex gap-2">
              <Button
                type="button"
                disabled={!draft.name_fa.trim() || save.isPending}
                onClick={() => void save.mutateAsync()}
              >
                {tCommon("save")}
              </Button>
              {editing !== null ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(null)
                    setDraft(EMPTY)
                  }}
                >
                  {tCommon("cancel")}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {zonesQ.isPending ? <p className="text-muted-foreground text-sm">{t("loading")}</p> : null}
          {!zonesQ.isPending && zones.length === 0 ? (
            <CafeEmptyState message={`${t("empty")} — ${t("empty_hint")}`} />
          ) : null}

          {zones.map((zone) => (
            <Card key={zone.id} className={zone.is_active ? undefined : "opacity-60"}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {locale === "en" && zone.name_en ? zone.name_en : zone.name_fa}
                    {!zone.is_active ? (
                      <span className="text-muted-foreground"> · {t("inactive")}</span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {(zone.areas ?? []).join(locale === "fa" ? "، " : ", ") || t("no_areas")}
                  </p>
                  <p className="text-sm">
                    {t("fee")}: {money(zone.delivery_fee_minor)} · {t("minimum")}:{" "}
                    {money(zone.minimum_order_minor)}
                    {zone.eta_minutes ? (
                      <>
                        {" · "}
                        {t("eta_value", { minutes: toLocaleDigits(String(zone.eta_minutes), locale) })}
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => startEdit(zone)}>
                    {tCommon("edit")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => void remove.mutateAsync(zone.id)}
                  >
                    {t("delete")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </CafeAdminShell>
  )
}
