"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"
import { X } from "lucide-react"

import { FONT_PRESETS, type BuilderGlobals } from "@/builder/globals"
import { SETTINGS_SECTION_ICONS } from "@/builder/theme/icons"
import { Button } from "@/components/ui/button"

type SectionId = "colors" | "fonts" | "typography" | "buttons" | "images" | "forms" | "layout" | "lightbox"

const SECTIONS: SectionId[] = ["colors", "fonts", "typography", "buttons", "images", "forms", "layout", "lightbox"]
const COLOR_KEYS = ["primary", "secondary", "text", "accent", "background", "surface", "border", "muted", "success", "danger"] as const
const TYPE_KEYS = ["h1", "h2", "h3", "h4", "h5", "h6", "body", "small", "link"] as const
const BUTTONS = ["primary", "secondary", "outline", "ghost"] as const

type Props = {
  settings: BuilderGlobals
  onChange: (next: BuilderGlobals) => void
  onClose: () => void
  onPublish?: () => void
  publishing?: boolean
}

/** Live global design tokens — edits apply to the canvas via DocumentView globalsCss. */
export function BuilderGlobalsPanel({ settings, onChange, onClose, onPublish, publishing }: Props) {
  const t = useTranslations("builder_globals")
  const tb = useTranslations("builder")
  const [section, setSection] = useState<SectionId>("colors")

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal aria-label={t("title")}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label={tb("back")} onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col bg-white text-[#0C2D63] shadow-xl">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{t("title")}</h2>
            <p className="text-muted-foreground text-xs">{tb("globals_live_hint")}</p>
          </div>
          <div className="flex items-center gap-2">
            {onPublish ? (
              <Button type="button" size="sm" disabled={publishing} onClick={onPublish}>{t("publish")}</Button>
            ) : null}
            <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label={tb("back")}>
              <X className="size-4" />
            </Button>
          </div>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[140px_minmax(0,1fr)]">
          <nav className="overflow-auto border-e p-2">
            {SECTIONS.map((id) => {
              const Icon = SETTINGS_SECTION_ICONS[id]
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-xs ${section === id ? "bg-[#E16BA6]/10 text-[#E16BA6]" : "hover:bg-muted"}`}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  {t(id)}
                </button>
              )
            })}
          </nav>
          <section className="overflow-auto p-4 text-sm">
            {section === "colors" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {COLOR_KEYS.map((key) => (
                  <label key={key} className="grid gap-1 text-xs">
                    {t(key)}
                    <input type="color" value={toHex(settings.colors[key]) ?? "#000000"} onChange={(e) => onChange({ ...settings, colors: { ...settings.colors, [key]: e.target.value } })} />
                  </label>
                ))}
              </div>
            ) : null}
            {section === "fonts" ? (
              <div className="grid gap-3">
                <div className="flex flex-wrap gap-2">
                  {FONT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="rounded-lg border px-3 py-1.5 text-xs"
                      onClick={() => {
                        const others = settings.customFonts.filter((font) => !preset.faces.some((face) => face.family === font.family))
                        onChange({ ...settings, fonts: { body: preset.stack, heading: preset.stack, accent: preset.stack }, customFonts: [...others, ...preset.faces] })
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {(["body", "heading", "accent"] as const).map((key) => (
                  <label key={key} className="grid gap-1 text-xs">
                    {t(`${key}_font`)}
                    <input className="h-9 rounded-md border px-2" value={settings.fonts[key]} onChange={(e) => onChange({ ...settings, fonts: { ...settings.fonts, [key]: e.target.value } })} />
                  </label>
                ))}
              </div>
            ) : null}
            {section === "typography" ? (
              <div className="grid gap-3">
                {TYPE_KEYS.map((key) => (
                  <div key={key} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-3">
                    <div className="text-xs font-semibold sm:col-span-3">{t(key)}</div>
                    <Field label={t("font_size")} value={settings.typography[key].fontSize} onChange={(fontSize) => onChange({ ...settings, typography: { ...settings.typography, [key]: { ...settings.typography[key], fontSize } } })} />
                    <Field label={t("font_weight")} value={settings.typography[key].fontWeight} onChange={(fontWeight) => onChange({ ...settings, typography: { ...settings.typography, [key]: { ...settings.typography[key], fontWeight } } })} />
                    <Field label={t("line_height")} value={settings.typography[key].lineHeight} onChange={(lineHeight) => onChange({ ...settings, typography: { ...settings.typography, [key]: { ...settings.typography[key], lineHeight } } })} />
                  </div>
                ))}
              </div>
            ) : null}
            {section === "buttons" ? (
              <div className="grid gap-3">
                <Field label={t("radius")} value={settings.buttons.radius} onChange={(radius) => onChange({ ...settings, buttons: { ...settings.buttons, radius } })} />
                {BUTTONS.map((name) => (
                  <div key={name} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2">
                    <div className="text-xs font-semibold sm:col-span-2">{t(`variant_${name}`)}</div>
                    <ColorField label={t("background")} value={settings.buttons.variants[name].background} onChange={(background) => patchButton(onChange, settings, name, { background })} />
                    <ColorField label={t("text")} value={settings.buttons.variants[name].color} onChange={(color) => patchButton(onChange, settings, name, { color })} />
                  </div>
                ))}
              </div>
            ) : null}
            {section === "images" ? (
              <div className="grid gap-3">
                <Field label={t("radius")} value={settings.images.radius} onChange={(radius) => onChange({ ...settings, images: { ...settings.images, radius } })} />
                <Toggle label={t("lazy")} checked={settings.images.lazy} onChange={(lazy) => onChange({ ...settings, images: { ...settings.images, lazy } })} />
              </div>
            ) : null}
            {section === "forms" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("radius")} value={settings.forms.radius} onChange={(radius) => onChange({ ...settings, forms: { ...settings.forms, radius } })} />
                <ColorField label={t("label_color")} value={settings.forms.labelColor} onChange={(labelColor) => onChange({ ...settings, forms: { ...settings.forms, labelColor } })} />
                <ColorField label={t("field_bg")} value={settings.forms.fieldBackground} onChange={(fieldBackground) => onChange({ ...settings, forms: { ...settings.forms, fieldBackground } })} />
                <ColorField label={t("border")} value={settings.forms.borderColor} onChange={(borderColor) => onChange({ ...settings, forms: { ...settings.forms, borderColor } })} />
              </div>
            ) : null}
            {section === "layout" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("container")} value={settings.layout.containerWidth} onChange={(containerWidth) => onChange({ ...settings, layout: { ...settings.layout, containerWidth } })} />
                <Field label={t("section_gap")} value={settings.layout.sectionGap} onChange={(sectionGap) => onChange({ ...settings, layout: { ...settings.layout, sectionGap } })} />
                <Field label={t("column_gap")} value={settings.layout.columnGap} onChange={(columnGap) => onChange({ ...settings, layout: { ...settings.layout, columnGap } })} />
                <ColorField label={t("page_background")} value={settings.layout.background} onChange={(background) => onChange({ ...settings, layout: { ...settings.layout, background } })} />
              </div>
            ) : null}
            {section === "lightbox" ? (
              <div className="grid gap-3">
                <Toggle label={t("lightbox_enabled")} checked={settings.lightbox.enabled} onChange={(enabled) => onChange({ ...settings, lightbox: { ...settings.lightbox, enabled } })} />
                <Field label={t("background")} value={settings.lightbox.background} onChange={(background) => onChange({ ...settings, lightbox: { ...settings.lightbox, background } })} />
              </div>
            ) : null}
          </section>
        </div>
      </aside>
    </div>
  )
}

function patchButton(
  onChange: (value: BuilderGlobals) => void,
  settings: BuilderGlobals,
  name: (typeof BUTTONS)[number],
  patch: Partial<BuilderGlobals["buttons"]["variants"]["primary"]>,
) {
  onChange({
    ...settings,
    buttons: {
      ...settings.buttons,
      variants: { ...settings.buttons.variants, [name]: { ...settings.buttons.variants[name], ...patch } },
    },
  })
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs">
      {label}
      <input className="h-9 rounded-md border px-2" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const hex = toHex(value)
  return (
    <label className="grid gap-1 text-xs">
      {label}
      <span className="flex items-center gap-2">
        {hex ? <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} /> : null}
        <input className="h-9 flex-1 rounded-md border px-2" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function toHex(value: string): string | null {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : null
}
