"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Origin = {
  id: number
  name: string
  slug: string
  iso_code?: string | null
  image_url?: string | null
}

type ProfileSettings = {
  scale_min?: number
  scale_max?: number
  acidity_levels?: string[]
  [key: string]: unknown
}

export default function ProfilePageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("coffee_admin")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()

  const [settingsText, setSettingsText] = useState("")
  const [originForm, setOriginForm] = useState({ name: "", slug: "", iso_code: "", image_url: "" })
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ["coffee-profile-settings"],
    queryFn: () => api<ProfileSettings>("/api/v1/coffee/profile-settings"),
  })

  const { data: origins = [], isLoading: loadingOrigins } = useQuery({
    queryKey: ["coffee-origins"],
    queryFn: () => api<Origin[]>("/api/v1/coffee/origins"),
  })

  useEffect(() => {
    if (!settings) return
    setSettingsText(JSON.stringify(settings, null, 2))
  }, [settings])

  const saveSettings = useMutation({
    mutationFn: () => {
      const payload = JSON.parse(settingsText) as ProfileSettings
      return api("/api/v1/coffee/profile-settings", {
        method: "PUT",
        json: { payload },
      })
    },
    onSuccess: async () => {
      setMessage(t("settings_saved"))
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ["coffee-profile-settings"] })
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
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("settings_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingSettings ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : (
            <>
              <Label>{t("settings_json")}</Label>
              <Textarea
                rows={12}
                value={settingsText}
                onChange={(e) => setSettingsText(e.target.value)}
                className="font-mono text-xs"
              />
              <Button
                disabled={saveSettings.isPending}
                onClick={() => {
                  try {
                    saveSettings.mutate()
                  } catch {
                    setError(t("invalid_json"))
                  }
                }}
              >
                {tCommon("save")}
              </Button>
            </>
          )}
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
                  <Button size="icon" variant="ghost" onClick={() => deleteOrigin.mutate(o.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label>{t("name")}</Label>
              <Input
                value={originForm.name}
                onChange={(e) => setOriginForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t("slug")}</Label>
              <Input
                value={originForm.slug}
                onChange={(e) => setOriginForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t("iso_code")}</Label>
              <Input
                value={originForm.iso_code}
                onChange={(e) => setOriginForm((f) => ({ ...f, iso_code: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t("image_url")}</Label>
              <Input
                value={originForm.image_url}
                onChange={(e) => setOriginForm((f) => ({ ...f, image_url: e.target.value }))}
              />
            </div>
          </div>
          <Button disabled={!originForm.name || addOrigin.isPending} onClick={() => addOrigin.mutate()}>
            <Plus className="size-4" />
            {t("add_origin")}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
