"use client"

import { ArrowDown, ArrowUp, Database, Plus, Trash2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { MediaPickerDialog } from "@/components/content/MediaPickerDialog"
import { DYNAMIC_TAGS, isDynamic, type DynamicBinding, type DynamicKind } from "../dynamic"
import { COLOR_TOKENS } from "../globals"
import { parseRows, rowsToLines, toLocalInput } from "../props"
import { WIcon } from "../render/extra-widgets"
import type { FieldDef, RepeaterSubField } from "../types"

const input = "h-9 w-full min-w-0 rounded-md border px-2"

export function MediaInput({ value, onChange, accept = "image" }: { value: string; onChange: (url: string) => void; accept?: "image" | "video" | "all" }) {
  const t = useTranslations("builder")
  const [open, setOpen] = useState(false)
  return (
    <div className="grid gap-1">
      {value && accept !== "video" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="h-20 w-full rounded-md border object-cover" />
      ) : null}
      <div className="flex gap-1">
        <input className={input} dir="ltr" value={value} placeholder="https://" onChange={(event) => onChange(event.target.value)} />
        <button type="button" className="shrink-0 rounded-md border px-2 text-[11px]" onClick={() => setOpen(true)}>{t("media_library")}</button>
      </div>
      <MediaPickerDialog open={open} onOpenChange={setOpen} accept={accept} onPick={(item) => { onChange(item.url); setOpen(false) }} />
    </div>
  )
}

export function IconInput({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (key: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          title={option.label}
          aria-label={option.label}
          onClick={() => onChange(option.value)}
          className={`grid h-8 place-items-center rounded-md border ${value === option.value ? "border-[#E16BA6] bg-[#E16BA6]/10 text-[#E16BA6]" : "text-[#0C2D63]/70"}`}
        >
          <WIcon name={option.value} />
        </button>
      ))}
    </div>
  )
}

/** Colour input that can reference a global token (`var(--wb-color-*)`) or hold a custom value. */
export function ColorInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const token = COLOR_TOKENS.find((item) => item.value && item.value === value)
  return (
    <div className="flex gap-1">
      <select className="h-9 rounded-md border px-1 text-[11px]" value={token?.value ?? ""} onChange={(event) => onChange(event.target.value)}>
        {COLOR_TOKENS.map((item) => <option key={item.value || "custom"} value={item.value}>{item.label}</option>)}
      </select>
      {token ? null : (
        <>
          <input type="color" className="h-9 w-10 shrink-0 rounded-md border" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(event) => onChange(event.target.value)} />
          <input className={input} dir="ltr" value={value} onChange={(event) => onChange(event.target.value)} />
        </>
      )}
    </div>
  )
}

function SubField({ field, value, onChange }: { field: RepeaterSubField; value: string; onChange: (v: string) => void }) {
  if (field.kind === "media") return <MediaInput value={value} onChange={onChange} />
  if (field.kind === "icon") return <IconInput value={value} options={field.options ?? []} onChange={onChange} />
  if (field.kind === "select") {
    return (
      <select className={input} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="" />
        {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    )
  }
  if (field.kind === "textarea") return <textarea className="min-h-16 w-full rounded-md border px-2 py-1" value={value} onChange={(event) => onChange(event.target.value)} />
  return <input className={input} dir={field.kind === "url" ? "ltr" : undefined} value={value} onChange={(event) => onChange(event.target.value)} />
}

/** Repeater: edits rows and stores them in the legacy `a|b|c` line format so existing renderers keep working. */
export function RepeaterInput({ value, fields, onChange }: { value: unknown; fields: RepeaterSubField[]; onChange: (value: string) => void }) {
  const t = useTranslations("builder")
  const keys = fields.map((field) => field.key)
  const rows = parseRows(value, keys)
  const write = (next: Record<string, string>[]) => onChange(rowsToLines(next, keys))
  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    ;[next[index], next[target]] = [next[target], next[index]]
    write(next)
  }
  return (
    <div className="grid gap-2">
      {rows.map((row, index) => (
        <div key={index} className="grid gap-1 rounded-lg border border-[#e6eef6] bg-white p-2">
          <div className="flex items-center justify-between text-[11px] text-[#0C2D63]/60">
            <span>#{index + 1}</span>
            <span className="flex gap-1">
              <button type="button" aria-label={t("move_up")} onClick={() => move(index, -1)}><ArrowUp className="size-3.5" /></button>
              <button type="button" aria-label={t("move_down")} onClick={() => move(index, 1)}><ArrowDown className="size-3.5" /></button>
              <button type="button" aria-label={t("delete")} onClick={() => write(rows.filter((_, i) => i !== index))}><Trash2 className="size-3.5 text-red-500" /></button>
            </span>
          </div>
          {fields.map((field) => (
            <label key={field.key} className="grid gap-0.5 text-[11px]">
              {field.label}
              <SubField field={field} value={row[field.key] ?? ""} onChange={(v) => write(rows.map((r, i) => (i === index ? { ...r, [field.key]: v } : r)))} />
            </label>
          ))}
        </div>
      ))}
      <button type="button" className="flex items-center justify-center gap-1 rounded-md border border-dashed py-1.5 text-xs" onClick={() => write([...rows, Object.fromEntries(keys.map((key) => [key, ""]))])}>
        <Plus className="size-3.5" aria-hidden />
        {t("repeater_add")}
      </button>
    </div>
  )
}

/** Controls for the extended field kinds; returns null for kinds handled by the base renderer. */
export function ExtendedField({ field, props, onChange }: { field: FieldDef; props: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const t = useTranslations("builder")
  const locale = useLocale()
  const value = props[field.key]
  const str = typeof value === "string" ? value : ""
  switch (field.kind) {
    case "media":
      return <MediaInput value={str} accept={field.accept} onChange={(url) => onChange(field.key, url)} />
    case "icon":
      return <IconInput value={str} options={field.options} onChange={(key) => onChange(field.key, key)} />
    case "color":
      return <ColorInput value={str} onChange={(v) => onChange(field.key, v)} />
    case "link":
      return (
        <div className="grid gap-1">
          <input className={input} dir="ltr" value={str} placeholder="/ یا https://" onChange={(event) => onChange(field.key, event.target.value)} />
          <div className="flex gap-3 text-[11px]">
            <label className="flex items-center gap-1"><input type="checkbox" checked={props[`${field.key}NewTab`] === true} onChange={(event) => onChange(`${field.key}NewTab`, event.target.checked)} />{t("link_new_tab")}</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={props[`${field.key}Nofollow`] === true} onChange={(event) => onChange(`${field.key}Nofollow`, event.target.checked)} />{t("link_nofollow")}</label>
          </div>
        </div>
      )
    case "slider": {
      const num = typeof value === "number" ? value : field.min
      return (
        <div className="flex items-center gap-2">
          <input type="range" className="min-w-0 flex-1 accent-[#E16BA6]" min={field.min} max={field.max} step={field.step ?? 1} value={num} onChange={(event) => onChange(field.key, Number(event.target.value))} />
          <span className="w-12 text-end text-[11px] tabular-nums" dir="ltr">{num}{field.unit ?? ""}</span>
        </div>
      )
    }
    case "date":
    case "datetime":
      return (
        <LocaleDatePicker
          locale={locale}
          withTime={field.kind === "datetime"}
          value={field.kind === "datetime" ? toLocalInput(str) || null : str.slice(0, 10) || null}
          onChange={(next) => onChange(field.key, next ?? "")}
          aria-label={field.label}
        />
      )
    case "time":
      return (
        <input
          type="time"
          className={input}
          dir="ltr"
          value={str}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      )
    case "repeater":
      return <RepeaterInput value={value} fields={field.fields} onChange={(v) => onChange(field.key, v)} />
    default:
      return null
  }
}

export const EXTENDED_KINDS = new Set<FieldDef["kind"]>(["media", "icon", "color", "link", "slider", "date", "time", "datetime", "repeater"])

/** Field kinds that can be bound to a Dynamic Tag, and which tag kinds they accept. */
export function dynamicKindFor(field: FieldDef): DynamicKind | null {
  if (field.kind === "text" || field.kind === "textarea") return "text"
  if (field.kind === "media") return field.accept === "video" ? null : "image"
  if (field.kind === "url" || field.kind === "link") return "link"
  return null
}

export function DynamicToggle({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (key: string, value: unknown) => void }) {
  const t = useTranslations("builder")
  const kind = dynamicKindFor(field)
  if (!kind) return null
  const bound = isDynamic(value)
  const first = DYNAMIC_TAGS.find((item) => item.kinds.includes(kind))
  return (
    <button
      type="button"
      title={bound ? t("dynamic_unbind") : t("dynamic_bind")}
      aria-label={bound ? t("dynamic_unbind") : t("dynamic_bind")}
      aria-pressed={bound}
      className={`ms-auto grid size-5 place-items-center rounded ${bound ? "bg-[#E16BA6] text-white" : "text-[#0C2D63]/50 hover:bg-[#0C2D63]/10"}`}
      onClick={(event) => {
        event.preventDefault()
        if (bound) onChange(field.key, value.dynamic.fallback ?? "")
        else onChange(field.key, { dynamic: { tag: first?.tag ?? "site.name", fallback: typeof value === "string" ? value : "" } })
      }}
    >
      <Database className="size-3" aria-hidden />
    </button>
  )
}

export function DynamicEditor({ field, binding, onChange }: { field: FieldDef; binding: DynamicBinding; onChange: (binding: DynamicBinding) => void }) {
  const t = useTranslations("builder")
  const kind = dynamicKindFor(field) ?? "text"
  const set = (patch: Partial<DynamicBinding>) => onChange({ ...binding, ...patch })
  return (
    <div className="grid gap-1 rounded-md border border-[#E16BA6]/40 bg-[#E16BA6]/5 p-2 text-[11px]">
      <select className="h-8 rounded-md border px-1" value={binding.tag} onChange={(event) => set({ tag: event.target.value })}>
        {DYNAMIC_TAGS.filter((item) => item.kinds.includes(kind)).map((item) => <option key={item.tag} value={item.tag}>{item.label}</option>)}
      </select>
      {binding.tag === "custom.field" ? (
        <input className="h-8 rounded-md border px-2" dir="ltr" placeholder={t("dynamic_key")} value={binding.key ?? ""} onChange={(event) => set({ key: event.target.value })} />
      ) : null}
      {kind === "text" ? (
        <div className="grid grid-cols-2 gap-1">
          <input className="h-8 min-w-0 rounded-md border px-2" placeholder={t("dynamic_before")} value={binding.before ?? ""} onChange={(event) => set({ before: event.target.value })} />
          <input className="h-8 min-w-0 rounded-md border px-2" placeholder={t("dynamic_after")} value={binding.after ?? ""} onChange={(event) => set({ after: event.target.value })} />
        </div>
      ) : null}
      <input className="h-8 rounded-md border px-2" placeholder={t("dynamic_fallback")} value={binding.fallback ?? ""} onChange={(event) => set({ fallback: event.target.value })} />
    </div>
  )
}
