"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

export function useTenantSettingsSection<T extends Record<string, unknown>>(
  area: string,
  section: string,
  sub?: string
) {
  const path = sub
    ? `/api/v1/settings/${area}/${section}/${sub}`
    : `/api/v1/settings/${area}/${section}`
  const key = ["tenant-settings", area, section, sub ?? ""] as const

  const q = useQuery({
    queryKey: key,
    queryFn: () => api<T>(path),
  })

  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: (payload: T) =>
      api(path, { method: "PUT", json: { payload } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tenant-settings", area, section] })
    },
  })

  return { q, save, path }
}

export function SettingsSaveBar({
  onSave,
  pending,
  saved,
  error,
}: {
  onSave: () => void
  pending?: boolean
  saved?: boolean
  error?: string | null
}) {
  const t = useTranslations("common")
  const tHub = useTranslations("settings_hub")
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" onClick={onSave} disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
      {saved ? (
        <p className="text-sm text-green-600 dark:text-green-400">{tHub("saved")}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

export function useDraftSettings<T extends Record<string, unknown>>(
  area: string,
  section: string,
  sub?: string
) {
  const { q, save } = useTenantSettingsSection<T>(area, section, sub)
  const [draft, setDraft] = useState<T | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (q.data) setDraft(q.data as T)
  }, [q.data])

  async function persist() {
    if (!draft) return
    setSaved(false)
    setError(null)
    try {
      await save.mutateAsync(draft)
      setSaved(true)
    } catch (e) {
      setError(getApiErrorMessage(e as Error))
    }
  }

  return {
    loading: q.isPending || !draft,
    draft,
    setDraft,
    persist,
    pending: save.isPending,
    saved,
    error,
    refetchError: q.error ? getApiErrorMessage(q.error as Error) : null,
  }
}
