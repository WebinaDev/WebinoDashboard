"use client"

import { useState } from "react"

import { MediaPickerField } from "@/components/content/MediaPickerField"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

import { fromGregorian, fromJalali, GREGORIAN_MONTHS, JALALI_MONTHS, jalaliMonthLength, faDigits, type ResumeDate } from "./jalali"
import { FIELD_LABELS, optLabel, type FieldDef, type ResumeRow } from "./schema"

const selectCls = "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** Jalali (default) or Gregorian picker; precision year / month / day. Stores both calendars. */
export function ResumeDateInput({ value, onChange, label }: { value: ResumeDate | null | undefined; onChange: (v: ResumeDate | null) => void; label: string }) {
  const [cal, setCal] = useState<"j" | "g">("j")
  const raw = value ? (cal === "j" ? value.j : value.g) : ""
  const [y, m, d] = (raw || "").split("-").map((x) => (x ? Number(x) : null))
  const now = new Date().getFullYear()
  const years = cal === "j" ? range(now - 621 + 1, 1330) : range(now + 1, 1950)
  const months = cal === "j" ? JALALI_MONTHS : GREGORIAN_MONTHS
  const days = y && m ? (cal === "j" ? jalaliMonthLength(y, m) : new Date(y, m, 0).getDate()) : 31
  const set = (ny: number | null, nm: number | null, nd: number | null) => {
    if (!ny) return onChange(null)
    onChange(cal === "j" ? fromJalali(ny, nm, nm ? nd : null) : fromGregorian(ny, nm, nm ? nd : null))
  }
  const num = (n: number) => (cal === "j" ? faDigits(n) : String(n))
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => setCal(cal === "j" ? "g" : "j")}>
          {cal === "j" ? "میلادی" : "جلالی"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2" dir="rtl">
        <select aria-label="سال" className={selectCls} value={y ?? ""} onChange={(e) => set(e.target.value ? Number(e.target.value) : null, m, d)}>
          <option value="">سال</option>
          {years.map((n) => <option key={n} value={n}>{num(n)}</option>)}
        </select>
        <select aria-label="ماه" className={selectCls} value={m ?? ""} disabled={!y} onChange={(e) => set(y, e.target.value ? Number(e.target.value) : null, d)}>
          <option value="">ماه</option>
          {months.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </select>
        <select aria-label="روز" className={selectCls} value={d ?? ""} disabled={!m} onChange={(e) => set(y, m, e.target.value ? Number(e.target.value) : null)}>
          <option value="">روز</option>
          {range(days, 1).reverse().map((n) => <option key={n} value={n}>{num(n)}</option>)}
        </select>
      </div>
      {value ? <p className="text-xs text-muted-foreground" dir="ltr">{value.j} ⇄ {value.g}</p> : null}
    </div>
  )
}
function range(from: number, to: number): number[] {
  const out: number[] = []
  for (let i = from; i >= to; i--) out.push(i)
  return out
}

function ListInput({ value, onChange, dir }: { value: string[]; onChange: (v: string[]) => void; dir: "rtl" | "ltr" }) {
  const [draft, setDraft] = useState("")
  const add = () => { const v = draft.trim(); if (v) { onChange([...value, v]); setDraft("") } }
  return (
    <div className="space-y-2" dir={dir}>
      <div className="flex flex-wrap gap-1.5">
        {value.map((v, i) => (
          <span key={`${v}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs">
            {v}
            <button type="button" aria-label="حذف" className="text-muted-foreground hover:text-destructive" onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
      </div>
      <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={dir === "rtl" ? "بنویسید و Enter بزنید" : "Type and press Enter"}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }} onBlur={add} />
    </div>
  )
}

export type FieldCtx = { lang: "fa" | "en"; skills: ResumeRow[]; refs: Record<string, ResumeRow[]>; mediaUrls: Record<number, string>; rememberMedia: (id: number, url: string) => void }

/** One schema field. For bilingual fields edits the column of the active language tab. */
export function ResumeField({ f, row, set, ctx }: { f: FieldDef; row: Record<string, unknown>; set: (k: string, v: unknown) => void; ctx: FieldCtx }) {
  const col = f.i18n ? `${f.key}_${ctx.lang}` : f.key
  const dir: "rtl" | "ltr" = f.i18n ? (ctx.lang === "fa" ? "rtl" : "ltr") : ["url", "int"].includes(f.type) || f.key === "value" ? "ltr" : "rtl"
  const label = (FIELD_LABELS[f.key] ?? f.key) + (f.i18n ? (ctx.lang === "fa" ? " (فارسی)" : " (English)") : "") + (f.required ? " *" : "")
  const v = row[col]
  const id = `rz-${col}`
  switch (f.type) {
    case "text": case "url": case "color":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{label}</Label>
          <Input id={id} dir={dir} type={f.type === "color" ? "color" : f.type === "url" ? "url" : "text"} value={typeof v === "string" ? v : ""} maxLength={f.max} onChange={(e) => set(col, e.target.value)} className={f.type === "color" ? "h-9 w-20 p-1" : undefined} />
        </div>
      )
    case "textarea": case "richtext":
      return (
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={id}>{label}</Label>
          <Textarea id={id} dir={dir} rows={f.type === "richtext" ? 6 : 3} value={typeof v === "string" ? v : ""} onChange={(e) => set(col, e.target.value)} />
        </div>
      )
    case "int":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{label}</Label>
          <Input id={id} dir="ltr" type="number" min={f.min} max={f.max} value={typeof v === "number" ? v : ""} onChange={(e) => set(col, e.target.value === "" ? null : Number(e.target.value))} />
        </div>
      )
    case "bool":
      return (
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <span className="text-sm">{label}</span>
          <Switch checked={Boolean(v)} onCheckedChange={(c) => set(col, c)} />
        </label>
      )
    case "select":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{label}</Label>
          <select id={id} className={`${selectCls} w-full`} value={typeof v === "string" ? v : ""} onChange={(e) => set(col, e.target.value || null)}>
            <option value="">—</option>
            {(f.options ?? []).map((o) => <option key={o} value={o}>{optLabel(o)}</option>)}
          </select>
        </div>
      )
    case "list":
      return (
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{label}</Label>
          <ListInput dir={dir} value={Array.isArray(v) ? (v as string[]) : []} onChange={(n) => set(col, n)} />
        </div>
      )
    case "date":
      return <ResumeDateInput label={label} value={v as ResumeDate | null} onChange={(n) => set(col, n)} />
    case "range":
      return (
        <div className="grid gap-3 rounded-lg border border-border p-3 sm:col-span-2 sm:grid-cols-2">
          <ResumeDateInput label="از" value={row.start as ResumeDate | null} onChange={(n) => set("start", n)} />
          {row.is_current ? <div className="flex items-end pb-2 text-sm text-muted-foreground">تا اکنون</div> : <ResumeDateInput label="تا" value={row.end as ResumeDate | null} onChange={(n) => set("end", n)} />}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Switch checked={Boolean(row.is_current)} onCheckedChange={(c) => set("is_current", c)} /> هنوز ادامه دارد
          </label>
        </div>
      )
    case "media": {
      const mid = typeof v === "number" ? v : null
      return (
        <MediaPickerField label={label} imageUrl={mid ? ctx.mediaUrls[mid] ?? "" : ""} accept="image"
          onPick={(m) => { ctx.rememberMedia(m.id, m.url); set(col, m.id) }} onClear={() => set(col, null)} />
      )
    }
    case "media_list": {
      const ids = Array.isArray(v) ? (v as number[]) : []
      return (
        <div className="space-y-2 sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {ids.map((mid) => (
              <span key={mid} className="relative">
                {ctx.mediaUrls[mid]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={ctx.mediaUrls[mid]} alt="" className="size-16 rounded-md border object-cover" />
                  : <span className="grid size-16 place-items-center rounded-md border text-xs text-muted-foreground" dir="ltr">#{mid}</span>}
                <button type="button" aria-label="حذف" className="absolute -top-1.5 -end-1.5 grid size-5 place-items-center rounded-full bg-destructive text-xs text-white" onClick={() => set(col, ids.filter((x) => x !== mid))}>×</button>
              </span>
            ))}
          </div>
          <MediaPickerField label={label} imageUrl="" accept="all" onPick={(m) => { ctx.rememberMedia(m.id, m.url); set(col, [...ids, m.id]) }} />
        </div>
      )
    }
    case "skills": {
      const ids = Array.isArray(v) ? (v as number[]) : []
      return (
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{label}</Label>
          <div className="flex flex-wrap gap-1.5">
            {ctx.skills.length === 0 ? <span className="text-xs text-muted-foreground">اول در بخش «مهارت‌ها» مهارت اضافه کنید.</span> : null}
            {ctx.skills.map((s) => {
              const on = ids.includes(s.id)
              return (
                <button key={s.id} type="button" aria-pressed={on} onClick={() => set(col, on ? ids.filter((x) => x !== s.id) : [...ids, s.id])}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}>
                  {String(s.name_fa || s.name_en || s.id)}
                </button>
              )
            })}
          </div>
        </div>
      )
    }
    case "ref": {
      const opts = ctx.refs[f.ref ?? ""] ?? []
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{label}</Label>
          <select id={id} className={`${selectCls} w-full`} value={typeof v === "number" ? v : ""} onChange={(e) => set(col, e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {opts.map((o) => <option key={o.id} value={o.id}>{String(o.title_fa || o.title_en || o.id)}</option>)}
          </select>
        </div>
      )
    }
    default:
      return null
  }
}
