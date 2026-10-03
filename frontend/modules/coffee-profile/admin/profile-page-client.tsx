"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { useConfirm } from "@/components/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { toAsciiDigits } from "@/lib/digits"

type Origin = {
  id: number
  name: string
  slug: string
  iso_code?: string | null
  image_url?: string | null
}

type AcidityLevel = { id: string; label: string }

type ProfileSettings = {
  scale_min?: number
  scale_max?: number
  acidity_levels?: AcidityLevel[]
}

type PricingSettings = {
  beans?: Array<{ name?: string; price_minor?: number }>
}

type BlendSettings = {
  enabled?: boolean
}

export default function ProfilePageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const t = useTranslations("coffee_admin")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()

  const [scaleMin, setScaleMin] = useState(1)
  const [scaleMax, setScaleMax] = useState(5)
  const [levels, setLevels] = useState<AcidityLevel[]>([])
  const [beansText, setBeansText] = useState("")
  const [blendEnabled, setBlendEnabled] = useState(true)
  const [originForm, setOriginForm] = useState({ name: "", slug: "", iso_code: "", image_url: "" })
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ["coffee-profile-settings"],
    queryFn: () => api<ProfileSettings>("/api/v1/coffee/profile-settings"),
  })
  const { data: pricing } = useQuery({
    queryKey: ["coffee-pricing-settings"],
    queryFn: () => api<PricingSettings>("/api/v1/coffee/pricing-settings"),
  })
  const { data: blend } = useQuery({
    queryKey: ["coffee-blend-settings"],
    queryFn: () => api<BlendSettings>("/api/v1/coffee/blend-settings"),
  })
  const { data: origins = [], isLoading: loadingOrigins } = useQuery({
    queryKey: ["coffee-origins"],
    queryFn: () => api<Origin[]>("/api/v1/coffee/origins"),
  })

  useEffect(() => {
    if (!settings) return
    setScaleMin(Number(settings.scale_min ?? 1))
    setScaleMax(Number(settings.scale_max ?? 5))
    setLevels(Array.isArray(settings.acidity_levels) ? settings.acidity_levels : [])
  }, [settings])

  useEffect(() => {
    if (!pricing) return
    const rows = Array.isArray(pricing.beans) ? pricing.beans : []
    setBeansText(rows.map((row) => `${row.name ?? ""},${row.price_minor ?? 0}`).join("\n"))
  }, [pricing])

  useEffect(() => {
    if (!blend) return
    setBlendEnabled(blend.enabled !== false)
  }, [blend])

  const saveSettings = useMutation({
    mutationFn: () =>
      api("/api/v1/coffee/profile-settings", {
        method: "PUT",
        json: {
          payload: {
            scale_min: Number(scaleMin),
            scale_max: Number(scaleMax),
            acidity_levels: levels.filter((level) => level.id.trim() && level.label.trim()),
          },
        },
      }),
    onSuccess: async () => {
      setMessage(t("settings_saved"))
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ["coffee-profile-settings"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const savePricing = useMutation({
    mutationFn: () => {
      const beans = beansText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, price] = line.split(",")
          return { name: (name ?? "").trim(), price_minor: Number(toAsciiDigits(String(price ?? 0))) }
        })
      return api("/api/v1/coffee/pricing-settings", {
        method: "PUT",
        json: { payload: { ...(pricing ?? {}), beans } },
      })
    },
    onSuccess: async () => {
      setMessage(t("settings_saved"))
      await queryClient.invalidateQueries({ queryKey: ["coffee-pricing-settings"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const saveBlend = useMutation({
    mutationFn: () =>
      api("/api/v1/coffee/blend-settings", {
        method: "PUT",
        json: { payload: { ...(blend ?? {}), enabled: blendEnabled } },
      }),
    onSuccess: async () => {
      setMessage(t("settings_saved"))
      await queryClient.invalidateQueries({ queryKey: ["coffee-blend-settings"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const addOrigin = useMutation({
    mutationFn: () =>
      api<Origin>("/api/v1/coffee/origins", {
        method: "POST",
        json: {
          name: originForm.name,
          slug: originForm.slug || undefined,
          iso_code: originForm.iso_code || null,
          image_url: originForm.image_url || null,
        },
      }),
    onSuccess: async () => {
      setOriginForm({ name: "", slug: "", iso_code: "", image_url: "" })
      await queryClient.invalidateQueries({ queryKey: ["coffee-origins"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const deleteOrigin = useMutation({
    mutationFn: (id: number) => api(`/api/v1/coffee/origins/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["coffee-origins"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <div className="space-y-6 p-6" dir="auto">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>
      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("settings_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingSettings ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>{t("scale_min")}</Label>
                  <Input type="number" value={scaleMin} onChange={(e) => setScaleMin(Number(e.target.value))} />
                </div>
                <div>
                  <Label>{t("scale_max")}</Label>
                  <Input type="number" value={scaleMax} onChange={(e) => setScaleMax(Number(e.target.value))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("acidity_levels")}</Label>
                {levels.map((level, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={level.id}
                      placeholder={t("level_id")}
                      onChange={(e) =>
                        setLevels((rows) => rows.map((row, i) => (i === index ? { ...row, id: e.target.value } : row)))
                      }
                    />
                    <Input
                      value={level.label}
                      placeholder={t("level_label")}
                      onChange={(e) =>
                        setLevels((rows) => rows.map((row, i) => (i === index ? { ...row, label: e.target.value } : row)))
                      }
                    />
                    <Button type="button" size="icon" variant="ghost" onClick={() => setLevels((rows) => rows.filter((_, i) => i !== index))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setLevels((rows) => [...rows, { id: "", label: "" }])}>
                  <Plus className="size-4" />
                  {t("add_level")}
                </Button>
              </div>
              <Button disabled={saveSettings.isPending} onClick={() => saveSettings.mutate()}>
                {tCommon("save")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("pricing_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label>{t("name")}</Label>
          <textarea
            className="border-input bg-background min-h-28 w-full rounded-md border px-3 py-2 text-sm"
            value={beansText}
            onChange={(e) => setBeansText(e.target.value)}
            placeholder="Arabica,250000"
          />
          <Button disabled={savePricing.isPending} onClick={() => savePricing.mutate()}>
            {tCommon("save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("blend_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={blendEnabled} onChange={(e) => setBlendEnabled(e.target.checked)} />
            {t("blend_enabled")}
          </label>
          <Button disabled={saveBlend.isPending} onClick={() => saveBlend.mutate()}>
            {tCommon("save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("origins_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingOrigins ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : (
            <ul className="space-y-2">
              {origins.map((o) => (
                <li key={o.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{o.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {o.slug}
                      {o.iso_code ? ` · ${o.iso_code}` : ""}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => confirm({ onConfirm: () => deleteOrigin.mutateAsync(o.id) })}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label>{t("name")}</Label>
              <Input value={originForm.name} onChange={(e) => setOriginForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>{t("slug")}</Label>
              <Input value={originForm.slug} onChange={(e) => setOriginForm((f) => ({ ...f, slug: e.target.value }))} />
            </div>
            <div>
              <Label>{t("iso_code")}</Label>
              <Input value={originForm.iso_code} onChange={(e) => setOriginForm((f) => ({ ...f, iso_code: e.target.value }))} />
            </div>
            <div>
              <Label>{t("image_url")}</Label>
              <Input value={originForm.image_url} onChange={(e) => setOriginForm((f) => ({ ...f, image_url: e.target.value }))} />
            </div>
          </div>
          <Button disabled={!originForm.name || addOrigin.isPending} onClick={() => addOrigin.mutate()}>
            <Plus className="size-4" />
            {t("add_origin")}
          </Button>
        </CardContent>
      </Card>
      {confirmDialog}
    </div>
  )
}
