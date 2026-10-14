"use client"

import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { api, apiDownload, ApiError } from "@/lib/api"

type Actions = { email_to?: string; sms_to?: string; sms_text?: string; webhook_url?: string; redirect_url?: string }
const KEYS = ["email_to", "sms_to", "sms_text", "webhook_url", "redirect_url"] as const

/** "Actions after submit" — stored server-side per form key (the public payload can never set them). */
export function FormActionsPanel({ formKey }: { formKey: string }) {
  const t = useTranslations("builder")
  const [values, setValues] = useState<Actions | null>(null)
  const [saving, setSaving] = useState(false)
  const key = formKey.replace(/[^\w.-]/g, "_").slice(0, 100) || "contact"

  useEffect(() => {
    let cancel = false
    api<{ actions: Actions }>(`/api/v1/builder/forms/${encodeURIComponent(key)}`)
      .then((row) => {
        if (!cancel) setValues(row.actions ?? {})
      })
      .catch(() => {
        if (!cancel) setValues({})
      })
    return () => {
      cancel = true
    }
  }, [key])

  if (!values) return null
  return (
    <div className="grid gap-2 rounded-lg border border-[#e6eef6] p-2 text-xs">
      <div className="font-bold">{t("form_actions")} <span className="font-normal text-[#0C2D63]/50" dir="ltr">({key})</span></div>
      {KEYS.map((name) => (
        <label key={name} className="grid gap-1">
          {t(`form_${name}`)}
          <input
            className="h-9 rounded-md border px-2"
            dir={name === "sms_text" ? undefined : "ltr"}
            value={values[name] ?? ""}
            onChange={(event) => setValues({ ...values, [name]: event.target.value })}
          />
        </label>
      ))}
      <p className="text-[11px] leading-5 text-[#0C2D63]/60">{t("form_actions_hint")}</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={saving}
        onClick={async () => {
          setSaving(true)
          try {
            await api(`/api/v1/builder/forms/${encodeURIComponent(key)}`, { method: "PUT", json: values })
            toast.success(t("saved"))
          } catch (error) {
            toast.error(error instanceof ApiError ? error.message : t("save_failed"))
          } finally {
            setSaving(false)
          }
        }}
      >
        {t("form_actions_save")}
      </Button>
      <SubmissionsInbox formKey={key} />
    </div>
  )
}

type Submission = { id: number; payload: Record<string, string>; created_at?: string; files: { id: number; name: string; size: number }[] }

/** Latest submissions of this form, with private file attachments downloadable by staff. */
function SubmissionsInbox({ formKey }: { formKey: string }) {
  const t = useTranslations("builder")
  const [rows, setRows] = useState<Submission[] | null>(null)
  async function load() {
    try {
      setRows(await api<Submission[]>(`/api/v1/builder/forms/${encodeURIComponent(formKey)}/submissions`))
    } catch {
      toast.error(t("save_failed"))
    }
  }
  if (rows === null) {
    return <Button type="button" size="sm" variant="ghost" onClick={() => void load()}>{t("form_submissions")}</Button>
  }
  return (
    <div className="grid max-h-72 gap-2 overflow-auto border-t pt-2">
      <div className="font-semibold">{t("form_submissions")} ({rows.length})</div>
      {rows.length === 0 ? <p className="text-[#0C2D63]/60">{t("form_no_submissions")}</p> : null}
      {rows.map((row) => (
        <div key={row.id} className="rounded-md bg-[#f7f9fc] p-2">
          <div className="text-[10px] text-[#0C2D63]/50" dir="ltr">{row.created_at ? new Date(row.created_at).toLocaleString("fa-IR") : ""}</div>
          {Object.entries(row.payload ?? {}).map(([k, v]) => <div key={k} className="truncate"><b>{k}:</b> {v}</div>)}
          {row.files.map((file) => (
            <button key={file.id} type="button" className="text-[#E16BA6] underline" onClick={() => void apiDownload(`/api/v1/builder/forms/files/${file.id}`, file.name).catch(() => toast.error(t("save_failed")))}>
              📎 {file.name}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
