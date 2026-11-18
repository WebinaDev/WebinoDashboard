"use client"

import { notFound, useParams } from "next/navigation"
import { useEffect, useState, type ComponentType } from "react"

import { SettingsModulesChrome } from "@/components/settings/SettingsModulesChrome"
import { EXT_MODULE_SETTINGS_PANELS, hasExtModuleSettings } from "@/lib/ext-module-settings"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function SettingsExtPage({ route }: { route: ResolvedAdminRoute }) {
  const params = useParams()
  const slug = String(route.params?.moduleSlug ?? params?.moduleSlug ?? "")
  const [Panel, setPanel] = useState<ComponentType | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!slug || !hasExtModuleSettings(slug)) {
      setReady(true)
      return
    }
    let cancelled = false
    void EXT_MODULE_SETTINGS_PANELS[slug]!().then((mod) => {
      if (!cancelled) {
        setPanel(() => mod.default)
        setReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [slug])

  if (ready && (!slug || !hasExtModuleSettings(slug) || !Panel)) {
    notFound()
  }

  return (
    <SettingsModulesChrome>
      {Panel ? <Panel /> : null}
    </SettingsModulesChrome>
  )
}
