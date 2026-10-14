"use client"

import { useRef, useState } from "react"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"

import { isVisible, missingOnStep, parseFormFields, stepCount, visiblePayload, type FormField } from "../forms"
import { propStr } from "../props"
import type { WidgetNode } from "../types"

const FILE_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
const FILE_MAX = 5 * 1024 * 1024

/** File field: uploads immediately to private storage and keeps only the opaque upload token as the value. */
function FileField({ field, formKey, onChange }: { field: FormField; formKey: string; onChange: (value: string) => void }) {
  const [state, setState] = useState<{ name: string; status: "idle" | "uploading" | "done" | "error"; message?: string }>({ name: "", status: "idle" })
  return (
    <div className="grid gap-1">
      <input
        type="file"
        name={field.name}
        accept={FILE_ACCEPT}
        aria-label={field.label}
        aria-required={field.required || undefined}
        className="wb-field"
        onChange={(event) => {
          const file = event.target.files?.[0]
          onChange("")
          if (!file) return setState({ name: "", status: "idle" })
          if (file.size > FILE_MAX) return setState({ name: file.name, status: "error", message: "حداکثر حجم فایل ۵ مگابایت است" })
          setState({ name: file.name, status: "uploading" })
          const body = new FormData()
          body.append("file", file)
          body.append("form_key", formKey)
          const base = process.env.NEXT_PUBLIC_API_URL ?? ""
          const host = window.location.host
          void fetch(`${base}/api/v1/public/builder/forms/upload`, { method: "POST", body, headers: { Accept: "application/json", "X-Tenant-Domain": host } })
            .then(async (res) => {
              const json = (await res.json().catch(() => null)) as { data?: { token?: string }; message?: string } | null
              if (!res.ok || !json?.data?.token) throw new Error(json?.message || "upload_failed")
              onChange(json.data.token)
              setState({ name: file.name, status: "done" })
            })
            .catch(() => setState({ name: file.name, status: "error", message: "بارگذاری فایل ناموفق بود (jpg، png، webp، pdf، doc)" }))
        }}
      />
      <span className="text-xs" aria-live="polite">
        {state.status === "uploading" ? "در حال بارگذاری…" : state.status === "done" ? `✓ ${state.name}` : state.status === "error" ? <span className="wb-form-error">{state.message}</span> : null}
      </span>
    </div>
  )
}

function Field({ field, value, onChange, formKey = "contact" }: { field: FormField; value: string; onChange: (value: string) => void; formKey?: string }) {
  if (field.type === "file") return <FileField field={field} formKey={formKey} onChange={onChange} />
  const common = { name: field.name, required: field.required, "aria-required": field.required || undefined }
  if (field.type === "textarea") return <textarea {...common} className="wb-field min-h-24" value={value} onChange={(event) => onChange(event.target.value)} />
  if (field.type === "select") {
    return (
      <select {...common} className="wb-field" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">—</option>
        {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    )
  }
  if (field.type === "radio" || field.type === "checkbox") {
    const selected = value ? value.split("، ") : []
    return (
      <div className="flex flex-wrap gap-3" role={field.type === "radio" ? "radiogroup" : "group"}>
        {field.options.map((option) => (
          <label key={option} className="flex items-center gap-1.5 text-sm">
            <input
              type={field.type}
              name={field.name}
              value={option}
              checked={selected.includes(option)}
              onChange={(event) => {
                if (field.type === "radio") onChange(option)
                else onChange((event.target.checked ? [...selected, option] : selected.filter((item) => item !== option)).join("، "))
              }}
            />
            {option}
          </label>
        ))}
      </div>
    )
  }
  if (field.type === "date") return <LocaleDatePicker locale="fa" value={value || null} onChange={(next) => onChange(next ?? "")} aria-label={field.label} />
  const type = field.type === "tel" || field.type === "email" || field.type === "number" ? field.type : "text"
  return <input {...common} type={type} dir={type === "tel" || type === "email" ? "ltr" : undefined} className="wb-field" value={value} onChange={(event) => onChange(event.target.value)} />
}

/** Builder form: typed fields, optional/conditional fields, multi-step, honeypot + timing anti-spam, server-side actions. */
export function FormWidget({ widget }: { widget: WidgetNode }) {
  const fields = parseFormFields(widget.props.fields)
  const showPhone = widget.props.showPhone !== false && !fields.some((f) => f.name === "phone")
  const showEmail = widget.props.showEmail !== false && !fields.some((f) => f.name === "email")
  const steps = stepCount(fields)
  const [step, setStep] = useState(1)
  const [values, setValues] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [hp, setHp] = useState("")
  const started = useRef<number | null>(null)
  const success = propStr(widget.props, "success", "پیام شما ثبت شد. به‌زودی پاسخ می‌دهیم.")
  const formKey = propStr(widget.props, "formKey", "") || propStr(widget.props, "title", "contact") || "contact"
  if (done) return <p className="wb-type-body rounded-2xl bg-muted p-4 text-foreground" role="status">{success}</p>
  const set = (name: string, value: string) => {
    if (started.current === null) started.current = Date.now()
    setValues((current) => ({ ...current, [name]: value }))
  }
  const last = step >= steps
  return (
    <form
      className="grid gap-3 rounded-3xl border border-border bg-card p-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        if (missingOnStep(fields, values, step).length) {
          setError("فیلدهای الزامی را کامل کنید.")
          return
        }
        setError("")
        if (!last) {
          setStep(step + 1)
          return
        }
        setPending(true)
        const base = process.env.NEXT_PUBLIC_API_URL ?? ""
        const host = typeof window !== "undefined" ? window.location.host : ""
        void fetch(`${base}/api/v1/public/forms/submit`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...(host ? { "X-Tenant-Domain": host } : {}) },
          body: JSON.stringify({
            form_key: formKey,
            page_uri: typeof window !== "undefined" ? window.location.pathname : "",
            fields: visiblePayload(fields, values),
            _hp: hp,
            _t: started.current ? Date.now() - started.current : 0,
          }),
        })
          .then(async (res) => {
            const json = (await res.json().catch(() => null)) as { message?: string; data?: { redirect?: string | null } } | null
            if (!res.ok) throw new Error(json?.message || "submit_failed")
            window.dispatchEvent(new CustomEvent("wb:form-success", { detail: { formKey } }))
            const redirect = json?.data?.redirect
            if (redirect && typeof window !== "undefined") window.location.assign(redirect)
            else setDone(true)
          })
          .catch(() => setError("ارسال ناموفق بود. دوباره تلاش کنید."))
          .finally(() => setPending(false))
      }}
    >
      <h3 className="wb-type-h3">{propStr(widget.props, "title", "فرم")}</h3>
      {steps > 1 ? (
        <div className="flex gap-1" aria-label={`مرحله ${step} از ${steps}`}>
          {Array.from({ length: steps }, (_, index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${index < step ? "bg-primary" : "bg-muted"}`} />)}
        </div>
      ) : null}
      {fields.filter((field) => field.step === step && isVisible(field, values)).map((field) => (
        <label key={field.name} className="grid gap-1">
          <span className="wb-label">{field.label}{field.required ? <span aria-hidden className="text-red-500"> *</span> : null}</span>
          <Field field={field} formKey={formKey} value={values[field.name] ?? ""} onChange={(value) => set(field.name, value)} />
        </label>
      ))}
      {last && showEmail ? (
        <label className="grid gap-1">
          <span className="wb-label">ایمیل</span>
          <input name="email" type="email" dir="ltr" className="wb-field" value={values.email ?? ""} onChange={(event) => set("email", event.target.value)} />
        </label>
      ) : null}
      {last && showPhone ? (
        <label className="grid gap-1">
          <span className="wb-label">موبایل</span>
          <input name="phone" type="tel" dir="ltr" className="wb-field" value={values.phone ?? ""} onChange={(event) => set("phone", event.target.value)} />
        </label>
      ) : null}
      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -start-[9999px] h-0 w-0 opacity-0" value={hp} onChange={(event) => setHp(event.target.value)} />
      {error ? <p className="wb-form-error" role="alert">{error}</p> : null}
      <div className="flex gap-2">
        {step > 1 ? <button type="button" className="wb-btn wb-btn-outline" onClick={() => setStep(step - 1)}>قبلی</button> : null}
        <button type="submit" className="wb-btn wb-btn-primary flex-1" disabled={pending}>
          {pending ? "…" : last ? propStr(widget.props, "submit", "ارسال") : "بعدی"}
        </button>
      </div>
    </form>
  )
}
