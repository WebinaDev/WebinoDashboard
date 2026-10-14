"use client"

import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { api, ApiError } from "@/lib/api"

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
    </div>
  )
}
