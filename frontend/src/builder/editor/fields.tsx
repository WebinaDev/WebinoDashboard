"use client"

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { MediaPickerDialog } from "@/components/content/MediaPickerDialog"
import { COLOR_TOKENS } from "../globals"
import { parseRows, rowsToLines } from "../props"
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
    case "time":
    case "datetime":
      return (
        <input
          type={field.kind === "datetime" ? "datetime-local" : field.kind}
          className={input}
          dir="ltr"
          value={field.kind === "datetime" ? str.slice(0, 16) : str}
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
