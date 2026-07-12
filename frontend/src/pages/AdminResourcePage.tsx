"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"

type Row = {
  id: number
  [key: string]: unknown
}

type Field = {
  key: string
  labelKey: string
  type?: "text" | "textarea" | "checkbox"
}

type Props = {
  titleKey: string
  listPath: string
  createPath: string
  fields: Field[]
  idField?: string
}

export function AdminResourcePage({
  titleKey,
  listPath,
  createPath,
  fields,
  idField = "id",
}: Props) {
  const { t } = useTranslation(["site_admin", "common"])
  const [rows, setRows] = useState<Row[]>([])
  const [form, setForm] = useState<Record<string, string | boolean>>({})
  const [pending, setPending] = useState(false)

  function load() {
    api<{ data: Row[] }>(listPath)
      .then((r) => setRows(Array.isArray(r.data) ? r.data : []))
      .catch(() => setRows([]))
  }

  useEffect(() => {
    load()
  }, [listPath])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      const payload: Record<string, unknown> = {}
      for (const f of fields) {
        const v = form[f.key]
        if (f.type === "checkbox") {
          payload[f.key] = Boolean(v)
        } else if (v !== "" && v !== undefined) {
          payload[f.key] = v
        }
      }
      await api(createPath, { method: "POST", json: payload })
      setForm({})
      load()
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t(titleKey as never)}</h1>

      {fields.length > 0 ? (
      <form onSubmit={(e) => void onCreate(e)} className="grid max-w-xl gap-3 rounded-lg border p-4">
        <p className="text-muted-foreground text-sm">{t("site_admin:new_item")}</p>
        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={f.key}>{t(f.labelKey as never)}</Label>
            {f.type === "textarea" ? (
              <textarea
                id={f.key}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                value={String(form[f.key] ?? "")}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            ) : f.type === "checkbox" ? (
              <input
                id={f.key}
                type="checkbox"
                checked={Boolean(form[f.key])}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.checked }))}
              />
            ) : (
              <Input
                id={f.key}
                value={String(form[f.key] ?? "")}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            )}
          </div>
        ))}
        <Button type="submit" disabled={pending}>
          {t("common:save")}
        </Button>
      </form>
      ) : null}

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={String(row[idField])} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{String(row.title ?? row.name ?? row.author ?? row[idField])}</span>
              {row.status ? (
                <span className="bg-muted rounded px-2 py-0.5 text-xs">{String(row.status)}</span>
              ) : null}
              {row.erp_consultation_id ? (
                <span className="border rounded px-2 py-0.5 text-xs">{t("site_admin:synced_erp")}</span>
              ) : null}
              {row.published === true || row.published === false ? (
                <span className="bg-muted rounded px-2 py-0.5 text-xs">
                  {row.published ? t("site_admin:published") : t("site_admin:draft")}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("site_admin:empty")}</p>
      ) : null}
    </div>
  )
}
