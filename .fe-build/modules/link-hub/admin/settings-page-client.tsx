"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"

type Settings = {
  alias_subdomain: string
  alias_hostname: string | null
  primary_domain: string | null
  dns_hint: string | null
  erp_synced?: boolean | null
  erp_message?: string | null
}

export default function SettingsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("link_hub")
  const tCommon = useTranslations("common")
  const [alias, setAlias] = useState("contact")
  const [meta, setMeta] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await api<Settings>("/api/v1/link-hub/settings")
        setMeta(res)
        setAlias(res.alias_subdomain || "contact")
      } catch {
        toast.error(t("load_error"))
      }
    })()
  }, [t])

  async function save() {
    setSaving(true)
    try {
      const res = await api<Settings>("/api/v1/link-hub/settings", {
        method: "PUT",
        json: { alias_subdomain: alias },
      })
      setMeta(res)
      setAlias(res.alias_subdomain)
      toast.success(t("saved"))
      if (res.erp_synced === true) {
        toast.success(t("erp_synced"))
      } else if (res.erp_synced === false) {
        toast.message(t("erp_sync_failed"), {
          description: res.erp_message
            ? t("erp_sync_message", { message: res.erp_message })
            : undefined,
        })
      }
    } catch {
      toast.error(t("save_error"))
    } finally {
      setSaving(false)
    }
  }

  const hostPreview = meta?.alias_hostname || `${alias}.${meta?.primary_domain || "domain.com"}`

  return (
    <PageShell title={t("settings")} description={t("settings_desc")}>
      <div className="max-w-xl space-y-4 rounded-2xl border p-5">
        <div className="space-y-1">
          <Label>{t("alias_label")}</Label>
          <Input value={alias} onChange={(e) => setAlias(e.target.value)} dir="ltr" placeholder="contact" />
          <p className="text-muted-foreground text-xs leading-6" dir="ltr">
            {t("alias_hint", { host: hostPreview })}
          </p>
        </div>
        <p className="text-muted-foreground text-sm leading-7">
          {t("alias_dns_hint", { host: hostPreview })}
        </p>
        {meta?.dns_hint ? <p className="text-muted-foreground text-sm leading-6">{meta.dns_hint}</p> : null}
        {typeof meta?.erp_synced === "boolean" ? (
          <p className={`text-sm font-medium ${meta.erp_synced ? "text-emerald-700" : "text-amber-700"}`}>
            {meta.erp_synced ? t("erp_synced") : t("erp_sync_failed")}
            {meta.erp_message ? ` · ${meta.erp_message}` : null}
          </p>
        ) : null}
        <Button type="button" onClick={save} disabled={saving || !alias.trim()}>
          {saving ? tCommon("saving") : tCommon("save")}
        </Button>
      </div>
    </PageShell>
  )
}
