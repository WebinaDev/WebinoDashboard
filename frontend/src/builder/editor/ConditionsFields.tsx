"use client"

import { useLocale, useTranslations } from "next-intl"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import type { DisplayConditions } from "../conditions"

/** Persian week order: Saturday … Friday (JS getDay numbers). */
const WEEK: { day: number; key: string }[] = [6, 0, 1, 2, 3, 4, 5].map((day) => ({ day, key: `weekday_${day}` }))

function Sel({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1">
      <span>{label}</span>
      <select className="h-9 rounded-md border px-2" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

export function ConditionsFields({ value, onChange }: { value: DisplayConditions; onChange: (next: DisplayConditions | undefined) => void }) {
  const t = useTranslations("builder")
  const locale = useLocale()
  const set = (patch: Partial<DisplayConditions>) => {
    const next = { ...value, ...patch } as Record<string, unknown>
    for (const key of Object.keys(next)) if (next[key] === "" || next[key] === undefined || (Array.isArray(next[key]) && !(next[key] as unknown[]).length)) delete next[key]
    onChange(Object.keys(next).length ? (next as DisplayConditions) : undefined)
  }
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Sel label={t("cond_mode")} value={value.mode ?? "show"} options={[{ value: "show", label: t("cond_show") }, { value: "hide", label: t("cond_hide") }]} onChange={(v) => set({ mode: v === "show" ? undefined : "hide" })} />
        <Sel label={t("cond_match")} value={value.match ?? "all"} options={[{ value: "all", label: t("cond_all") }, { value: "any", label: t("cond_any") }]} onChange={(v) => set({ match: v === "all" ? undefined : "any" })} />
      </div>
      <Sel label={t("cond_login")} value={value.login ?? ""} options={[{ value: "", label: "—" }, { value: "in", label: t("cond_logged_in") }, { value: "out", label: t("cond_logged_out") }]} onChange={(v) => set({ login: (v || undefined) as DisplayConditions["login"] })} />
      <Sel label={t("cond_cart")} value={value.cart ?? ""} options={[{ value: "", label: "—" }, { value: "empty", label: t("cond_cart_empty") }, { value: "not_empty", label: t("cond_cart_not_empty") }]} onChange={(v) => set({ cart: (v || undefined) as DisplayConditions["cart"] })} />
      <label className="grid gap-1"><span>{t("cond_from")}</span><LocaleDatePicker locale={locale} withTime value={value.from ?? null} onChange={(v) => set({ from: v ?? undefined })} /></label>
      <label className="grid gap-1"><span>{t("cond_to")}</span><LocaleDatePicker locale={locale} withTime value={value.to ?? null} onChange={(v) => set({ to: v ?? undefined })} /></label>
      <fieldset className="grid gap-1">
        <legend>{t("cond_days")}</legend>
        <div className="flex flex-wrap gap-1">
          {WEEK.map(({ day, key }) => {
            const on = value.days?.includes(day) ?? false
            return (
              <button key={day} type="button" aria-pressed={on} className={`rounded-md border px-1.5 py-0.5 ${on ? "border-[#E16BA6] bg-[#E16BA6]/10 text-[#E16BA6]" : ""}`} onClick={() => set({ days: on ? value.days?.filter((d) => d !== day) : [...(value.days ?? []), day] })}>
                {t(key as "weekday_0")}
              </button>
            )
          })}
        </div>
      </fieldset>
      <label className="grid gap-1"><span>{t("cond_hours")}</span><input className="h-9 rounded-md border px-2" dir="ltr" placeholder="9-18" value={value.hours ?? ""} onChange={(event) => set({ hours: event.target.value })} /></label>
      <label className="grid gap-1"><span>{t("cond_param")}</span><input className="h-9 rounded-md border px-2" dir="ltr" placeholder="utm_source=instagram" value={value.param ?? ""} onChange={(event) => set({ param: event.target.value })} /></label>
    </div>
  )
}
