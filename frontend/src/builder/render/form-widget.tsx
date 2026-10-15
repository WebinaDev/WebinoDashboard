"use client"

import { useEffect, useRef, useState } from "react"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"

import { isVisible, missingOnStep, parseFormFields, stepCount, visiblePayload, type FormField } from "../forms"
import { parseRows, propStr } from "../props"
import type { WidgetNode } from "../types"

const FILE_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
const FILE_MAX = 5 * 1024 * 1024

/** File field: uploads immediately to private storage and keeps only the opaque upload token as the value. */
function FileField({ field, formKey, onChange }: { field: FormField; formKey: string; onChange: (value: string, name: string) => void }) {
  const [state, setState] = useState<{ name: string; status: "idle" | "uploading" | "done" | "error"; message?: string }>({ name: "", status: "idle" })
  return (
    <div className="grid gap-1">
      <input
        id={`wbf-${field.name}`}
        type="file"
        name={field.name}
        accept={FILE_ACCEPT}
        aria-required={field.required || undefined}
        className="wb-field"
        onChange={(event) => {
          const file = event.target.files?.[0]
          onChange("", "")
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
              onChange(json.data.token, file.name)
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

function Field({ field, value, onChange }: { field: FormField; value: string; onChange: (value: string) => void }) {
  const common = { id: `wbf-${field.name}`, name: field.name, required: field.required, "aria-required": field.required || undefined }
  if (field.type === "textarea") return <textarea {...common} className="wb-field min-h-24" value={value} onChange={(event) => onChange(event.target.value)} />
  if (field.type === "select") {
    return (
      <select {...common} className="wb-field" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">انتخاب کنید</option>
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

/** Builder form: typed fields, optional/conditional fields, multi-step, group headings, review, confirms, prefill, honeypot + timing anti-spam, server-side actions. */
export function FormWidget({ widget }: { widget: WidgetNode }) {
  const fields = parseFormFields(widget.props.fields)
  const showPhone = widget.props.showPhone !== false && !fields.some((f) => f.name === "phone")
  const showEmail = widget.props.showEmail !== false && !fields.some((f) => f.name === "email")
  const columns = propStr(widget.props, "columns", "1") === "2"
  const review = widget.props.review === true
  const fieldSteps = stepCount(fields)
  const steps = fieldSteps + (review ? 1 : 0)
  const stepTitles = propStr(widget.props, "stepTitles", "").split("\n").map((line) => line.trim())
  const confirms = parseRows(widget.props.confirms, ["text"]).map((row) => row.text).filter(Boolean)
  const [step, setStep] = useState(1)
  const [values, setValues] = useState<Record<string, string>>({})
  const [fileNames, setFileNames] = useState<Record<string, string>>({})
  const [agreed, setAgreed] = useState<boolean[]>([])
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [hp, setHp] = useState("")
  const started = useRef<number | null>(null)
  const success = propStr(widget.props, "success", "پیام شما ثبت شد. به‌زودی پاسخ می‌دهیم.")
  const formKey = propStr(widget.props, "formKey", "") || propStr(widget.props, "title", "contact") || "contact"
  const title = propStr(widget.props, "title", "فرم")
  const intro = propStr(widget.props, "intro", "")
  const note = propStr(widget.props, "note", "")
  const anchor = propStr(widget.props, "anchor", "").replace(/[^\w-]/g, "")

  useEffect(() => {
    const names = new Set(fields.map((field) => field.name))
    const apply = (name: string, value: string) => {
      if (!names.has(name)) return false
      setValues((current) => ({ ...current, [name]: value }))
      setStep(1)
      setDone(false)
      return true
    }
    const query = new URLSearchParams(window.location.search)
    query.forEach((value, key) => {
      if (key.startsWith("prefill_")) apply(key.slice(8), value)
    })
    const onPrefill = (event: Event) => {
      const detail = (event as CustomEvent<{ anchor?: string; name?: string; value?: string }>).detail
      if (!detail?.name || (detail.anchor && anchor && detail.anchor !== anchor)) return
      apply(detail.name, detail.value ?? "")
    }
    window.addEventListener("wb:form-prefill", onPrefill)
    return () => window.removeEventListener("wb:form-prefill", onPrefill)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, fields.length])

  if (done) return <p id={anchor || undefined} className="wb-form-success wb-type-body rounded-2xl bg-muted p-5 text-foreground" role="status">{success}</p>
  const set = (name: string, value: string) => {
    if (started.current === null) started.current = Date.now()
    setValues((current) => ({ ...current, [name]: value }))
  }
  const last = step >= steps
  // Built-in email/phone inputs sit on the last field step (before the optional review step).
  const reviewing = review && step === steps
  const wide = (field: FormField) => field.type === "textarea" || field.type === "radio" || field.type === "checkbox" || field.type === "heading" || field.type === "file"
  const shown = (field: FormField) => isVisible(field, values)
  const display = (field: FormField) => (field.type === "file" ? fileNames[field.name] || "" : values[field.name] ?? "")
  return (
    <form
      id={anchor || undefined}
      className="wb-form relative grid gap-3 rounded-3xl border border-border bg-card p-5 shadow-sm"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        if (!reviewing && missingOnStep(fields, values, step).length) {
          setError("فیلدهای الزامی این مرحله را کامل کنید.")
          return
        }
        if (last) {
          for (let s = 1; s <= fieldSteps; s += 1) {
            if (missingOnStep(fields, values, s).length) {
              setStep(s)
              setError("فیلدهای الزامی این مرحله را کامل کنید.")
              return
            }
          }
          if (confirms.some((_, index) => !agreed[index])) {
            setError("لطفاً موارد تأیید را علامت بزنید.")
            return
          }
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
      {title ? <h3 className="wb-type-h3">{title}</h3> : null}
      {intro ? <p className="text-sm leading-7 text-foreground/70">{intro}</p> : null}
      {steps > 1 ? (
        <div className="grid gap-2">
          <div className="flex gap-1" aria-hidden="true">
            {Array.from({ length: steps }, (_, index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${index < step ? "bg-primary" : "bg-muted"}`} />)}
          </div>
          <p className="wb-form-step text-xs font-bold text-foreground/70" aria-live="polite">
            مرحله {step} از {steps}
            {stepTitles[step - 1] ? `: ${stepTitles[step - 1]}` : reviewing ? ": بررسی نهایی" : ""}
          </p>
        </div>
      ) : null}
      {reviewing ? (
        <div className="wb-form-review grid gap-3">
          {Array.from({ length: fieldSteps }, (_, index) => index + 1).map((s) => (
            <div key={s} className="rounded-2xl border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <strong className="text-sm">{stepTitles[s - 1] || `مرحله ${s}`}</strong>
                <button type="button" className="text-xs font-bold text-primary underline" onClick={() => { setError(""); setStep(s) }}>ویرایش</button>
              </div>
              <dl className="grid gap-1 text-sm">
                {fields.filter((field) => field.step === s && field.type !== "heading" && shown(field)).map((field) => (
                  <div key={field.name} className="flex flex-wrap gap-2">
                    <dt className="text-foreground/60">{field.label}:</dt>
                    <dd className="font-semibold">{display(field) || "ندارد"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      ) : (
        <div className={`grid gap-3 ${columns ? "md:grid-cols-2" : ""}`}>
          {fields.filter((field) => field.step === step && shown(field)).map((field) =>
            field.type === "heading" ? (
              <h4 key={field.name} className={`wb-form-group mt-2 border-b border-border pb-2 text-base font-extrabold ${columns ? "md:col-span-2" : ""}`}>{field.label}</h4>
            ) : (
              <label key={field.name} htmlFor={`wbf-${field.name}`} className={`grid gap-1 ${columns && wide(field) ? "md:col-span-2" : ""}`}>
                <span className="wb-label">{field.label}{field.required ? <span aria-hidden className="text-red-500"> *</span> : null}</span>
                {field.type === "file" ? (
                  <FileField field={field} formKey={formKey} onChange={(token, name) => { set(field.name, token); setFileNames((current) => ({ ...current, [field.name]: name })) }} />
                ) : (
                  <Field field={field} value={values[field.name] ?? ""} onChange={(value) => set(field.name, value)} />
                )}
              </label>
            ),
          )}
          {step === fieldSteps && showEmail ? (
            <label className="grid gap-1">
              <span className="wb-label">ایمیل</span>
              <input name="email" type="email" dir="ltr" className="wb-field" value={values.email ?? ""} onChange={(event) => set("email", event.target.value)} />
            </label>
          ) : null}
          {step === fieldSteps && showPhone ? (
            <label className="grid gap-1">
              <span className="wb-label">موبایل</span>
              <input name="phone" type="tel" dir="ltr" className="wb-field" value={values.phone ?? ""} onChange={(event) => set("phone", event.target.value)} />
            </label>
          ) : null}
        </div>
      )}
      {last && confirms.length ? (
        <div className="grid gap-2">
          {confirms.map((text, index) => (
            <label key={index} className="flex items-start gap-2 text-sm">
              <input type="checkbox" required checked={agreed[index] === true} onChange={(event) => setAgreed((current) => { const next = [...current]; next[index] = event.target.checked; return next })} />
              <span>{text}<span aria-hidden className="text-red-500"> *</span></span>
            </label>
          ))}
        </div>
      ) : null}
      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -start-[9999px] h-0 w-0 opacity-0" value={hp} onChange={(event) => setHp(event.target.value)} />
      {error ? <p className="wb-form-error" role="alert">{error}</p> : null}
      <div className="flex gap-2">
        {step > 1 ? <button type="button" className="wb-btn wb-btn-outline" onClick={() => { setError(""); setStep(step - 1) }}>قبلی</button> : null}
        <button type="submit" className="wb-btn wb-btn-primary flex-1" disabled={pending}>
          {pending ? "…" : last ? propStr(widget.props, "submit", "ارسال") : "بعدی"}
        </button>
      </div>
      {note ? <p className="whitespace-pre-line text-xs leading-6 text-foreground/60">{note}</p> : null}
    </form>
  )
}
