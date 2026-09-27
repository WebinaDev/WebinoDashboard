"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Location = { type: "country" | "state" | "postcode"; code: string }
type Method = {
  instance_id: number
  method_id: string
  title: string
  enabled: boolean
  settings: Record<string, unknown>
}
type Zone = {
  id: number
  name: string
  locations: Location[]
  methods: Method[]
}
type ZonesPayload = {
  zones: Zone[]
  global: { enable_shipping: boolean; default_method: string; free_shipping_min: number }
  method_types: { id: string; title: string; description: string }[]
  states: { code: string; name: string }[]
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export function ShippingZonesPanel() {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const t = useTranslations("settings_hub")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<number | null>(null)
  const [newZoneName, setNewZoneName] = useState("")
  const [postcodeDraft, setPostcodeDraft] = useState<Record<number, string>>({})

  const q = useQuery({
    queryKey: ["shipping-zones"],
    queryFn: () => api<ZonesPayload>("/api/v1/shipping/zones"),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["shipping-zones"] })

  const saveGlobal = useMutation({
    mutationFn: (global: ZonesPayload["global"]) =>
      api("/api/v1/shipping/zones/global", { method: "POST", json: global }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const createZone = useMutation({
    mutationFn: (name: string) => api("/api/v1/shipping/zones", { method: "POST", json: { name } }),
    onSuccess: async () => {
      setNewZoneName("")
      toast.success(tCommon("saved"))
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const updateZone = useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; locations?: Location[] }) =>
      api(`/api/v1/shipping/zones/${id}`, { method: "PUT", json: body }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const deleteZone = useMutation({
    mutationFn: (id: number) => api(`/api/v1/shipping/zones/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const addMethod = useMutation({
    mutationFn: ({ zoneId, method_id }: { zoneId: number; method_id: string }) =>
      api(`/api/v1/shipping/zones/${zoneId}/methods`, { method: "POST", json: { method_id } }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const updateMethod = useMutation({
    mutationFn: ({
      zoneId,
      instanceId,
      ...body
    }: {
      zoneId: number
      instanceId: number
      enabled?: boolean
      title?: string
      settings?: Record<string, unknown>
    }) =>
      api(`/api/v1/shipping/zones/${zoneId}/methods/${instanceId}`, {
        method: "PUT",
        json: body,
      }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const deleteMethod = useMutation({
    mutationFn: ({ zoneId, instanceId }: { zoneId: number; instanceId: number }) =>
      api(`/api/v1/shipping/zones/${zoneId}/methods/${instanceId}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const data = q.data
  const global = data?.global
  const states = data?.states ?? []
  const methodTypes = data?.method_types ?? []

  const stateMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of states) m.set(s.code, s.name)
    return m
  }, [states])

  if (q.isLoading || !data || !global) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>
  }

  function locationLabel(loc: Location): string {
    if (loc.type === "country") return t("shipping.loc_country")
    if (loc.type === "state") return stateMap.get(loc.code) || loc.code
    return `${t("shipping.loc_postcode")}: ${loc.code}`
  }

  function setLocations(zone: Zone, next: Location[]) {
    updateZone.mutate({ id: zone.id, locations: next })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("shipping.zones")}</CardTitle>
          <CardDescription>{t("shipping.zones_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("shipping.enabled")}</Label>
            <Switch
              checked={Boolean(global.enable_shipping)}
              onCheckedChange={(v) => saveGlobal.mutate({ ...global, enable_shipping: v })}
            />
          </div>
          <div className="grid max-w-lg gap-2">
            <Label>{t("shipping.default_method")}</Label>
            <select
              className={selectClass}
              value={global.default_method}
              onChange={(e) => saveGlobal.mutate({ ...global, default_method: e.target.value })}
            >
              {methodTypes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid max-w-lg gap-2">
            <Label>{t("shipping.free_min")}</Label>
            <Input
              type="number"
              min={0}
              defaultValue={global.free_shipping_min}
              onBlur={(e) =>
                saveGlobal.mutate({
                  ...global,
                  free_shipping_min: Number(e.target.value) || 0,
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{t("shipping.zone_list")}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-48"
              placeholder={t("shipping.zone_name_ph")}
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!newZoneName.trim() || createZone.isPending}
              onClick={() => createZone.mutate(newZoneName.trim())}
            >
              <Plus className="size-4" />
              {t("shipping.add_zone")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data.zones ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("shipping.no_zones")}</p>
          ) : (
            data.zones.map((zone) => {
              const open = expanded === zone.id
              const selectedStates = new Set(
                (zone.locations ?? []).filter((l) => l.type === "state").map((l) => l.code),
              )
              const hasCountry = (zone.locations ?? []).some((l) => l.type === "country")
              return (
                <div key={zone.id} className="rounded-lg border">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <button
                      type="button"
                      className="text-start text-sm font-medium"
                      onClick={() => setExpanded(open ? null : zone.id)}
                    >
                      {zone.name}
                      <span className="text-muted-foreground ms-2 text-xs">
                        ({(zone.methods ?? []).length} {t("shipping.methods")})
                      </span>
                    </button>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setExpanded(open ? null : zone.id)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          confirm({ description: t("shipping.delete_zone_confirm"), onConfirm: () => deleteZone.mutateAsync(zone.id) })
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  {open ? (
                    <div className="space-y-4 border-t px-3 py-3">
                      <div className="grid max-w-md gap-2">
                        <Label>{t("shipping.zone_name")}</Label>
                        <Input
                          defaultValue={zone.name}
                          onBlur={(e) => {
                            const name = e.target.value.trim()
                            if (name && name !== zone.name) updateZone.mutate({ id: zone.id, name })
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{t("shipping.locations")}</Label>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant={hasCountry ? "default" : "outline"}
                            onClick={() =>
                              setLocations(zone, [{ type: "country", code: "IR" }])
                            }
                          >
                            {t("shipping.loc_country")}
                          </Button>
                        </div>
                        <div className="max-h-40 overflow-y-auto rounded-md border p-2">
                          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                            {states.map((st) => {
                              const checked = selectedStates.has(st.code)
                              return (
                                <label key={st.code} className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const nextStates = new Set(selectedStates)
                                      if (checked) nextStates.delete(st.code)
                                      else nextStates.add(st.code)
                                      const locs: Location[] = [
                                        ...[...nextStates].map((code) => ({
                                          type: "state" as const,
                                          code,
                                        })),
                                        ...(zone.locations ?? []).filter((l) => l.type === "postcode"),
                                      ]
                                      setLocations(
                                        zone,
                                        locs.length ? locs : [{ type: "country", code: "IR" }],
                                      )
                                    }}
                                  />
                                  {st.name}
                                </label>
                              )
                            })}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="grid gap-1">
                            <Label className="text-xs">{t("shipping.add_postcode")}</Label>
                            <Input
                              className="w-40"
                              value={postcodeDraft[zone.id] ?? ""}
                              onChange={(e) =>
                                setPostcodeDraft((d) => ({ ...d, [zone.id]: e.target.value }))
                              }
                              placeholder="12345*"
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const code = (postcodeDraft[zone.id] ?? "").trim()
                              if (!code) return
                              const locs = [
                                ...(zone.locations ?? []).filter((l) => l.type !== "country"),
                                { type: "postcode" as const, code },
                              ]
                              setLocations(zone, locs)
                              setPostcodeDraft((d) => ({ ...d, [zone.id]: "" }))
                            }}
                          >
                            {t("shipping.add_postcode")}
                          </Button>
                        </div>
                        <ul className="text-muted-foreground space-y-1 text-xs">
                          {(zone.locations ?? []).map((loc, i) => (
                            <li key={`${loc.type}-${loc.code}-${i}`} className="flex items-center gap-2">
                              <span>{locationLabel(loc)}</span>
                              {loc.type === "postcode" ? (
                                <button
                                  type="button"
                                  className="text-destructive"
                                  onClick={() =>
                                    setLocations(
                                      zone,
                                      (zone.locations ?? []).filter(
                                        (l) => !(l.type === "postcode" && l.code === loc.code),
                                      ),
                                    )
                                  }
                                >
                                  ×
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label>{t("shipping.methods")}</Label>
                          <select
                            className={`${selectClass} w-auto`}
                            defaultValue=""
                            onChange={(e) => {
                              const method_id = e.target.value
                              e.target.value = ""
                              if (method_id) addMethod.mutate({ zoneId: zone.id, method_id })
                            }}
                          >
                            <option value="">{t("shipping.add_method")}</option>
                            {methodTypes.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.title}
                              </option>
                            ))}
                          </select>
                        </div>
                        {(zone.methods ?? []).length === 0 ? (
                          <p className="text-muted-foreground text-sm">{t("shipping.no_methods")}</p>
                        ) : (
                          (zone.methods ?? []).map((method) => (
                            <MethodEditor
                              key={method.instance_id}
                              method={method}
                              onChange={(patch) =>
                                updateMethod.mutate({
                                  zoneId: zone.id,
                                  instanceId: method.instance_id,
                                  ...patch,
                                })
                              }
                              onDelete={() =>
                                deleteMethod.mutate({
                                  zoneId: zone.id,
                                  instanceId: method.instance_id,
                                })
                              }
                              labels={{
                                enabled: t("shipping.method_enabled"),
                                title: t("shipping.method_title"),
                                cost: t("shipping.method_cost"),
                                min: t("shipping.method_min"),
                                fallback: t("shipping.method_fallback"),
                                service: t("shipping.method_service"),
                                delete: t("shipping.delete_method"),
                              }}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
      {confirmDialog}
    </div>
  )
}

function MethodEditor({
  method,
  onChange,
  onDelete,
  labels,
}: {
  method: Method
  onChange: (patch: { enabled?: boolean; title?: string; settings?: Record<string, unknown> }) => void
  onDelete: () => void
  labels: Record<string, string>
}) {
  const settings = method.settings ?? {}
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch checked={Boolean(method.enabled)} onCheckedChange={(v) => onChange({ enabled: v })} />
          <span className="text-sm font-medium">
            {method.title}{" "}
            <span className="text-muted-foreground text-xs">({method.method_id})</span>
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="size-4" />
          {labels.delete}
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label className="text-xs">{labels.title}</Label>
          <Input
            defaultValue={method.title}
            onBlur={(e) => {
              if (e.target.value !== method.title) onChange({ title: e.target.value })
            }}
          />
        </div>
        {method.method_id === "flat_rate" ? (
          <div className="grid gap-1">
            <Label className="text-xs">{labels.cost}</Label>
            <Input
              type="number"
              defaultValue={Number(settings.cost ?? 0)}
              onBlur={(e) => onChange({ settings: { ...settings, cost: Number(e.target.value) || 0 } })}
            />
          </div>
        ) : null}
        {method.method_id === "free_shipping" ? (
          <div className="grid gap-1">
            <Label className="text-xs">{labels.min}</Label>
            <Input
              type="number"
              defaultValue={Number(settings.min_amount ?? 0)}
              onBlur={(e) =>
                onChange({ settings: { ...settings, min_amount: Number(e.target.value) || 0 } })
              }
            />
          </div>
        ) : null}
        {method.method_id === "tapin" ? (
          <>
            <div className="grid gap-1">
              <Label className="text-xs">{labels.fallback}</Label>
              <Input
                type="number"
                defaultValue={Number(settings.fallback_cost ?? settings.cost ?? 0)}
                onBlur={(e) =>
                  onChange({
                    settings: { ...settings, fallback_cost: Number(e.target.value) || 0 },
                  })
                }
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">{labels.service}</Label>
              <select
                className={selectClass}
                defaultValue={String(settings.service ?? "pishtaz")}
                onChange={(e) => onChange({ settings: { ...settings, service: e.target.value } })}
              >
                <option value="pishtaz">pishtaz</option>
                <option value="vip">vip</option>
                <option value="tipax">tipax</option>
                <option value="courier">courier</option>
                <option value="alonomic">alonomic</option>
              </select>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
