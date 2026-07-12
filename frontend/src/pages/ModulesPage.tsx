"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"

type Row = {
  slug: string
  enabled: boolean
  licensed: boolean
  requires_license: boolean
}

export default function ModulesPage() {
  const { t } = useTranslation(["modules", "common"])
  const [rows, setRows] = useState<Row[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  function reload() {
    api<{ data: Row[] }>("/api/v1/modules")
      .then((r) => setRows(r.data))
      .catch(() => setRows([]))
  }

  useEffect(() => {
    reload()
  }, [])

  async function toggle(slug: string, enabled: boolean) {
    setMsg(null)
    try {
      await api(`/api/v1/modules/${slug}`, {
        method: "PATCH",
        json: { enabled },
      })
      reload()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("common:error_generic"))
    }
  }

  async function syncLicense() {
    setMsg(null)
    try {
      await api("/api/v1/license/sync", { method: "POST" })
      reload()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("common:error_generic"))
    }
  }

  async function install(slug: string) {
    setMsg(null)
    try {
      await api(`/api/v1/modules/${slug}/install`, { method: "POST" })
      reload()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("common:error_generic"))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("modules:title")}</h1>
      <p className="text-muted-foreground max-w-2xl text-sm">
        {t("modules:accounting_hint")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void syncLicense()}>
          {t("modules:sync_license")}
        </Button>
      </div>
      {msg ? <p className="text-destructive text-sm">{msg}</p> : null}
      <div className="rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="p-3 text-start font-medium">{t("modules:col_slug")}</th>
              <th className="p-3 text-start font-medium">{t("modules:enabled")}</th>
              <th className="p-3 text-start font-medium">{t("modules:col_licensed")}</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug} className="border-b last:border-0">
                <td className="p-3 font-mono text-xs">{r.slug}</td>
                <td className="p-3">
                  {r.enabled ? t("common:yes") : t("common:no")}
                </td>
                <td className="p-3">
                  {r.licensed ? t("common:yes") : t("common:no")}
                </td>
                <td className="p-3 text-end">
                  <div className="inline-flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void toggle(r.slug, !r.enabled)}
                    >
                      {t("modules:action_toggle")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void install(r.slug)}
                    >
                      {t("modules:install")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
