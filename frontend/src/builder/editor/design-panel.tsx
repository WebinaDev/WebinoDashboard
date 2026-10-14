"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"

import { exposableTargets, findComponent, makeClass, makePreset } from "../components"
import type { ResponsiveStyle, AdvancedProps, DeviceMode, StyleProps, WidgetNode } from "../types"
import { mergeStyle } from "../style"
import { useDesign } from "./design-context"
import { Group, StyleFields } from "./style-panel"

type NodeLike = { style?: ResponsiveStyle; advanced?: AdvancedProps }

/**
 * Design-system controls above the style tab: global classes (apply / create from this element / edit the class
 * style) and, for widgets, linked presets. Class and preset edits go to the globals draft and reach every user.
 */
export function DesignSystemFields({
  node,
  widget,
  device,
  onAdvanced,
  onStyle,
}: {
  node: NodeLike
  widget?: WidgetNode
  device: DeviceMode
  onAdvanced: (patch: AdvancedProps) => void
  onStyle: (style: ResponsiveStyle | undefined) => void
}) {
  const t = useTranslations("builder")
  const { globals, updateGlobals } = useDesign()
  const [editing, setEditing] = useState<string | null>(null)
  const applied = node.advanced?.classes ?? []
  const editingClass = globals.classes.find((c) => c.id === editing)
  const presets = widget ? globals.presets.filter((p) => p.widget === widget.type) : []
  const preset = widget ? globals.presets.find((p) => p.id === node.advanced?.preset) : undefined

  function patchClassStyle(id: string, patch: StyleProps) {
    updateGlobals({
      ...globals,
      classes: globals.classes.map((c) => {
        if (c.id !== id) return c
        const key = device === "desktop" ? "base" : device
        return { ...c, style: { ...c.style, [key]: { ...mergeStyle(c.style, device), ...patch } } }
      }),
    })
  }

  return (
    <div className="grid gap-2 text-xs">
      <Group title={t("global_classes")}>
        <div className="flex flex-wrap gap-1">
          {applied.map((id) => {
            const cls = globals.classes.find((c) => c.id === id)
            return (
              <span key={id} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${editing === id ? "border-[#E16BA6] text-[#E16BA6]" : ""}`}>
                <button type="button" onClick={() => setEditing(editing === id ? null : id)} title={t("edit_class")}>{cls?.name ?? id}</button>
                <button type="button" aria-label={t("remove")} onClick={() => onAdvanced({ classes: applied.filter((c) => c !== id) })}>×</button>
              </span>
            )
          })}
        </div>
        <select
          className="h-9 rounded-md border px-2"
          value=""
          aria-label={t("add_class")}
          onChange={(event) => event.target.value && onAdvanced({ classes: [...applied, event.target.value] })}
        >
          <option value="">{t("add_class")}</option>
          {globals.classes.filter((c) => !applied.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button
          type="button"
          className="h-8 rounded-md border px-2"
          onClick={() => {
            const name = window.prompt(t("class_name_prompt"))?.trim()
            if (!name) return
            const cls = makeClass(name, node.style, globals.classes.map((c) => c.id))
            updateGlobals({ ...globals, classes: [...globals.classes, cls] })
            onAdvanced({ classes: [...applied, cls.id] })
            onStyle(undefined)
            setEditing(cls.id)
          }}
        >
          {t("class_from_style")}
        </button>
        {editingClass ? (
          <div className="grid gap-2 rounded-lg border border-[#E16BA6]/50 p-2">
            <div className="flex items-center justify-between font-semibold text-[#E16BA6]">
              <span>{t("editing_class", { name: editingClass.name })}</span>
              <button type="button" onClick={() => setEditing(null)}>{t("close")}</button>
            </div>
            <StyleFields device={device} style={mergeStyle(editingClass.style, device)} onChange={(patch) => patchClassStyle(editingClass.id, patch)} />
          </div>
        ) : null}
      </Group>
      {widget ? (
        <Group title={t("style_presets")}>
          <select
            className="h-9 rounded-md border px-2"
            aria-label={t("style_presets")}
            value={node.advanced?.preset ?? ""}
            onChange={(event) => onAdvanced({ preset: event.target.value || undefined })}
          >
            <option value="">{t("no_preset")}</option>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="h-8 rounded-md border px-2"
              onClick={() => {
                const name = window.prompt(t("preset_name_prompt"))?.trim()
                if (!name) return
                const created = makePreset(name, widget, globals.presets.map((p) => p.id))
                updateGlobals({ ...globals, presets: [...globals.presets, created] })
                onAdvanced({ preset: created.id })
                onStyle(undefined)
              }}
            >
              {t("save_as_preset")}
            </button>
            {preset ? (
              <button
                type="button"
                className="h-8 rounded-md border px-2"
                onClick={() => {
                  const next = makePreset(preset.name, widget, [])
                  updateGlobals({ ...globals, presets: globals.presets.map((p) => (p.id === preset.id ? { ...p, style: { ...p.style, ...(widget.style ?? {}) }, props: { ...(p.props ?? {}), ...(next.props ?? {}) } } : p)) })
                  onStyle(undefined)
                }}
              >
                {t("update_preset")}
              </button>
            ) : null}
          </div>
          {preset ? <p className="text-[10px] text-[#0C2D63]/50">{t("preset_hint")}</p> : null}
        </Group>
      ) : null}
    </div>
  )
}

/** Content tab of a component instance: component, variant and exposed props. */
export function ComponentInstanceFields({ widget, onProps }: { widget: WidgetNode; onProps: (patch: Record<string, unknown>) => void }) {
  const t = useTranslations("builder")
  const { globals, updateGlobals } = useDesign()
  const component = findComponent(globals, widget.props.component)
  const overrides = (widget.props.overrides && typeof widget.props.overrides === "object" ? widget.props.overrides : {}) as Record<string, string>
  const [target, setTarget] = useState("")
  return (
    <div className="grid gap-2 text-xs">
      <label className="grid gap-1">
        {t("component")}
        <select className="h-9 rounded-md border px-2" value={component?.id ?? ""} onChange={(event) => onProps({ component: event.target.value, variant: "", overrides: {} })}>
          <option value="">—</option>
          {globals.components.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      {component?.variants?.length ? (
        <label className="grid gap-1">
          {t("component_variant")}
          <select className="h-9 rounded-md border px-2" value={String(widget.props.variant ?? "")} onChange={(event) => onProps({ variant: event.target.value })}>
            <option value="">{t("component_default_variant")}</option>
            {component.variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
      ) : null}
      {component?.props.map((prop) => (
        <label key={prop.key} className="grid gap-1">
          {prop.label}
          <input className="h-9 rounded-md border px-2" value={overrides[prop.key] ?? ""} placeholder={t("component_inherit")} onChange={(event) => onProps({ overrides: { ...overrides, [prop.key]: event.target.value } })} />
        </label>
      ))}
      {component ? (
        <Group title={t("component_expose")}>
          <select className="h-9 rounded-md border px-2" value={target} aria-label={t("component_expose")} onChange={(event) => setTarget(event.target.value)}>
            <option value="">—</option>
            {exposableTargets(component).flatMap((w) => w.props.map((p) => <option key={`${w.widget}:${p}`} value={`${w.widget}:${p}`}>{`${w.type} · ${p}`}</option>))}
          </select>
          <button
            type="button"
            className="h-8 rounded-md border px-2"
            disabled={!target}
            onClick={() => {
              const [w, p] = target.split(":")
              const label = window.prompt(t("component_prop_label"), p)?.trim()
              if (!label) return
              const key = `${p}_${(component.props.length + 1).toString(36)}`
              updateGlobals({ ...globals, components: globals.components.map((c) => (c.id === component.id ? { ...c, props: [...c.props, { key, label, widget: w, prop: p }] } : c)) })
              setTarget("")
            }}
          >
            {t("component_expose_add")}
          </button>
          {component.props.map((prop) => (
            <div key={prop.key} className="flex items-center justify-between">
              <span>{prop.label}</span>
              <button type="button" onClick={() => updateGlobals({ ...globals, components: globals.components.map((c) => (c.id === component.id ? { ...c, props: c.props.filter((x) => x.key !== prop.key) } : c)) })}>×</button>
            </div>
          ))}
        </Group>
      ) : null}
      <p className="text-[10px] text-[#0C2D63]/50">{t("component_hint")}</p>
    </div>
  )
}
