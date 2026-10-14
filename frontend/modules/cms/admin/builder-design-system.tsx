"use client"

import { useTranslations } from "next-intl"

import { newToken } from "@/builder/components"
import type { BuilderGlobals, CustomCode, DesignVariable } from "@/builder/globals"
import { Button } from "@/components/ui/button"

type PanelProps = { settings: BuilderGlobals; onChange: (next: BuilderGlobals) => void }

const KINDS: DesignVariable["kind"][] = ["color", "size", "font", "other"]

/** Design variables (tokens): selectable in every colour / size / font field of the builder as var(--wb-v-id). */
export function VariablesPanel({ settings, onChange }: PanelProps) {
  const t = useTranslations("builder_globals")
  const vars = settings.variables
  const patch = (index: number, next: Partial<DesignVariable>) => onChange({ ...settings, variables: vars.map((v, i) => (i === index ? { ...v, ...next } : v)) })
  return (
    <div className="mb-6 grid gap-2 text-xs">
      <div className="font-semibold">{t("design_variables")}</div>
      {vars.map((v, index) => (
        <div key={v.id} className="grid grid-cols-[1fr_110px_1fr_auto] items-center gap-2">
          <input aria-label={t("var_name")} className="h-9 rounded-md border px-2" value={v.name} onChange={(e) => patch(index, { name: e.target.value })} />
          <select aria-label={t("var_kind")} className="h-9 rounded-md border px-2" value={v.kind} onChange={(e) => patch(index, { kind: e.target.value as DesignVariable["kind"] })}>
            {KINDS.map((k) => <option key={k} value={k}>{t(`var_kind_${k}`)}</option>)}
          </select>
          <div className="flex items-center gap-1">
            {v.kind === "color" ? <input type="color" aria-label={t("var_value")} value={/^#[0-9a-f]{6}$/i.test(v.value) ? v.value : "#000000"} onChange={(e) => patch(index, { value: e.target.value })} /> : null}
            <input aria-label={t("var_value")} dir="ltr" className="h-9 w-full rounded-md border px-2" value={v.value} onChange={(e) => patch(index, { value: e.target.value })} />
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...settings, variables: vars.filter((_, i) => i !== index) })}>{t("remove")}</Button>
          <code className="text-muted-foreground col-span-4" dir="ltr">var(--wb-v-{v.id})</code>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-fit"
        onClick={() => {
          const name = window.prompt(t("var_name"))?.trim()
          if (!name) return
          onChange({ ...settings, variables: [...vars, { id: newToken(name, vars.map((v) => v.id)), name, kind: "color", value: "#E16BA6" }] })
        }}
      >
        {t("add_variable")}
      </Button>
      <p className="text-muted-foreground">{t("variables_hint")}</p>
    </div>
  )
}

/** Global classes, presets and components: rename / delete (their styles are edited in the builder). */
export function DesignSystemPanel({ settings, onChange }: PanelProps) {
  const t = useTranslations("builder_globals")
  const lists = [
    { key: "classes" as const, title: t("global_classes"), items: settings.classes.map((c) => ({ id: c.id, name: c.name, meta: `.wbc-${c.id}` })) },
    { key: "presets" as const, title: t("style_presets"), items: settings.presets.map((p) => ({ id: p.id, name: p.name, meta: p.widget })) },
    { key: "components" as const, title: t("components"), items: settings.components.map((c) => ({ id: c.id, name: c.name, meta: `${c.props.length} props · ${c.variants?.length ?? 0} variants` })) },
  ]
  function rename(key: "classes" | "presets" | "components", id: string, name: string) {
    if (key === "classes") onChange({ ...settings, classes: settings.classes.map((c) => (c.id === id ? { ...c, name } : c)) })
    if (key === "presets") onChange({ ...settings, presets: settings.presets.map((p) => (p.id === id ? { ...p, name } : p)) })
    if (key === "components") onChange({ ...settings, components: settings.components.map((c) => (c.id === id ? { ...c, name } : c)) })
  }
  function remove(key: "classes" | "presets" | "components", id: string) {
    if (!window.confirm(t("design_delete_confirm"))) return
    if (key === "classes") onChange({ ...settings, classes: settings.classes.filter((c) => c.id !== id) })
    if (key === "presets") onChange({ ...settings, presets: settings.presets.filter((p) => p.id !== id) })
    if (key === "components") onChange({ ...settings, components: settings.components.filter((c) => c.id !== id) })
  }
  return (
    <div className="grid gap-6 text-xs">
      {lists.map((list) => (
        <div key={list.key} className="grid gap-2">
          <div className="font-semibold">{list.title}</div>
          {list.items.length === 0 ? <p className="text-muted-foreground">{t("design_empty")}</p> : null}
          {list.items.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
              <input aria-label={t("var_name")} className="h-9 rounded-md border px-2" value={item.name} onChange={(e) => rename(list.key, item.id, e.target.value)} />
              <code className="text-muted-foreground" dir="ltr">{item.meta}</code>
              <Button type="button" size="sm" variant="outline" onClick={() => remove(list.key, item.id)}>{t("remove")}</Button>
            </div>
          ))}
        </div>
      ))}
      <p className="text-muted-foreground">{t("design_system_hint")}</p>
    </div>
  )
}

/** Code Manager: site-wide head / end-of-body code with optional path scope. */
export function CodeManagerPanel({ settings, onChange }: PanelProps) {
  const t = useTranslations("builder_globals")
  const list = settings.customCode
  const patch = (index: number, next: Partial<CustomCode>) => onChange({ ...settings, customCode: list.map((c, i) => (i === index ? { ...c, ...next } : c)) })
  return (
    <div className="grid gap-4 text-xs">
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900">{t("code_warning")}</p>
      {list.map((entry, index) => (
        <div key={entry.id} className="grid gap-2 rounded-xl border p-3">
          <div className="grid grid-cols-[1fr_140px_auto_auto] items-center gap-2">
            <input aria-label={t("var_name")} className="h-9 rounded-md border px-2" value={entry.name} onChange={(e) => patch(index, { name: e.target.value })} />
            <select aria-label={t("code_location")} className="h-9 rounded-md border px-2" value={entry.location} onChange={(e) => patch(index, { location: e.target.value as CustomCode["location"] })}>
              <option value="head">{t("code_head")}</option>
              <option value="body_end">{t("code_body_end")}</option>
            </select>
            <label className="flex items-center gap-1"><input type="checkbox" checked={entry.enabled} onChange={(e) => patch(index, { enabled: e.target.checked })} />{t("code_enabled")}</label>
            <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...settings, customCode: list.filter((_, i) => i !== index) })}>{t("remove")}</Button>
          </div>
          <textarea aria-label={t("code_body")} dir="ltr" className="min-h-32 rounded-md border px-2 py-1 font-mono" value={entry.code} onChange={(e) => patch(index, { code: e.target.value.slice(0, 20000) })} />
          <label className="grid gap-1">
            {t("code_paths")}
            <textarea dir="ltr" className="min-h-14 rounded-md border px-2 py-1 font-mono" placeholder={"/shop*\n/about"} value={entry.paths ?? ""} onChange={(e) => patch(index, { paths: e.target.value })} />
          </label>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-fit"
        onClick={() => {
          const name = window.prompt(t("var_name"))?.trim()
          if (!name) return
          onChange({ ...settings, customCode: [...list, { id: newToken(name, list.map((c) => c.id)), name, location: "head", code: "", enabled: false, paths: "" }] })
        }}
      >
        {t("add_code")}
      </Button>
    </div>
  )
}
