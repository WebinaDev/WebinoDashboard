"use client"

import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"

const PARTS = ["globals", "templates", "library", "pages"] as const
type Part = (typeof PARTS)[number]

/** Kit export/import: globals, theme templates, saved blocks and builder pages in one JSON file. */
export function KitPanel() {
  const t = useTranslations("builder_globals")
  const [parts, setParts] = useState<Part[]>([...PARTS])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function exportKit() {
    setBusy(true)
    try {
      const kit = await api<Record<string, unknown>>("/api/v1/builder/kit")
      const blob = new Blob([JSON.stringify(kit, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `webino-kit-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(t("kit_failed"))
    } finally {
      setBusy(false)
    }
  }

  async function importKit(file: File) {
    if (file.size > 8_000_000) {
      toast.error(t("kit_too_large"))
      return
    }
    setBusy(true)
    try {
      const kit = JSON.parse(await file.text()) as { format?: string }
      if (kit?.format !== "webino-kit") throw new Error("format")
      if (!window.confirm(t("kit_confirm"))) return
      const res = await api<{ imported: Record<Part, number> }>("/api/v1/builder/kit", { method: "POST", json: { kit, parts } })
      const n = res.imported
      toast.success(t("kit_imported", { globals: n.globals, templates: n.templates, library: n.library, pages: n.pages }))
    } catch {
      toast.error(t("kit_failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3 text-sm">
      <p className="text-muted-foreground text-xs">{t("kit_hint")}</p>
      <div className="flex flex-wrap gap-3">
        {PARTS.map((part) => (
          <label key={part} className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={parts.includes(part)} onChange={(event) => setParts(event.target.checked ? [...parts, part] : parts.filter((p) => p !== part))} />
            {t(`kit_${part}`)}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void exportKit()}>{t("kit_export")}</Button>
        <Button type="button" disabled={busy || parts.length === 0} onClick={() => fileRef.current?.click()}>{t("kit_import")}</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) void importKit(file)
        }} />
      </div>
    </div>
  )
}

type RoleRow = { role: string; can_edit: boolean; can_publish: boolean; can_design: boolean }

/** Builder role manager: which staff roles may edit, publish or change site design. */
export function RolesPanel() {
  const t = useTranslations("builder_globals")
  const [rows, setRows] = useState<RoleRow[]>([])
  const [canManage, setCanManage] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ roles: RoleRow[]; can_manage: boolean }>("/api/v1/builder/roles")
      .then((data) => {
        setRows(data.roles ?? [])
        setCanManage(Boolean(data.can_manage))
      })
      .catch(() => undefined)
  }, [])

  async function save() {
    setBusy(true)
    try {
      const data = await api<{ roles: RoleRow[] }>("/api/v1/builder/roles", { method: "PUT", json: { roles: rows } })
      setRows(data.roles)
      toast.success(t("saved"))
    } catch {
      toast.error(t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3 text-sm">
      <p className="text-muted-foreground text-xs">{t("roles_hint")}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-start">
            <th className="py-1 text-start">{t("role")}</th>
            <th>{t("can_edit")}</th>
            <th>{t("can_publish")}</th>
            <th>{t("can_design")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.role} className="border-t">
              <td className="py-2">{t(`role_${row.role}`)}</td>
              {(["can_edit", "can_publish", "can_design"] as const).map((key) => (
                <td key={key} className="text-center">
                  <input type="checkbox" aria-label={`${row.role} ${key}`} disabled={!canManage} checked={row[key]} onChange={(event) => {
                    const next = rows.slice()
                    next[index] = { ...row, [key]: event.target.checked }
                    setRows(next)
                  }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {canManage ? <Button type="button" className="w-fit" disabled={busy} onClick={() => void save()}>{t("save")}</Button> : <p className="text-muted-foreground text-xs">{t("roles_readonly")}</p>}
    </div>
  )
}
