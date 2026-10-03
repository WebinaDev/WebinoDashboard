"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { asGlobals, DEFAULT_GLOBALS, type BuilderGlobals } from "@/builder/globals"
import { SETTINGS_SECTION_ICONS } from "@/builder/theme/icons"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"

type SectionId = keyof typeof SETTINGS_SECTION_ICONS

const SECTIONS: SectionId[] = ["colors", "fonts", "typography", "buttons", "images", "forms", "layout", "lightbox", "variables"]
const COLOR_KEYS = ["primary", "secondary", "text", "accent", "background", "surface", "border", "muted", "success", "danger"] as const
const TYPE_KEYS = ["h1", "h2", "h3", "h4", "h5", "h6", "body", "small", "link"] as const
const BUTTONS = ["primary", "secondary", "outline", "ghost"] as const

export default function BuilderSettingsPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("builder_globals")
  const [settings, setSettings] = useState<BuilderGlobals>(DEFAULT_GLOBALS)
  const [section, setSection] = useState<SectionId>("colors")
  const [published, setPublished] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ settings?: unknown; has_published?: boolean }>("/api/v1/builder/globals")
      .then((row) => {
        if (row?.settings) setSettings(asGlobals(row.settings))
        setPublished(Boolean(row?.has_published))
      })
      .catch(() => undefined)
  }, [])

  async function save(publish: boolean) {
    setBusy(true)
    try {
      await api("/api/v1/builder/globals", { method: "PUT", json: { settings } })
      if (publish) {
        await api("/api/v1/builder/globals/publish", { method: "POST" })
        setPublished(true)
        toast.success(t("published"))
      } else toast.success(t("saved"))
    } catch {
      toast.error(t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell
      title={t("title")}
      description={t("subtitle")}
      actions={
        <>
          <Button variant="outline" asChild><Link href="/dashboard/theme-builder">{t("theme_builder")}</Link></Button>
          <Button variant="outline" disabled={busy} onClick={() => setSettings(DEFAULT_GLOBALS)}>{t("reset")}</Button>
          <Button variant="outline" disabled={busy} onClick={() => void save(false)}>{t("save")}</Button>
          <Button disabled={busy} onClick={() => void save(true)}>{t("publish")}</Button>
        </>
      }
    >
      <p className="text-muted-foreground text-xs">{published ? t("live") : t("draft_only")}</p>
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex gap-2 overflow-auto lg:flex-col">
          {SECTIONS.map((id) => {
            const Icon = SETTINGS_SECTION_ICONS[id]
            return (
              <button key={id} type="button" onClick={() => setSection(id)} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-start text-sm ${section === id ? "border-primary bg-primary/5" : ""}`}>
                <Icon className="size-4 shrink-0" aria-hidden />
                {t(id)}
              </button>
            )
          })}
        </nav>
        <section className="rounded-2xl border p-4">
          {section === "colors" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {COLOR_KEYS.map((key) => (
                <label key={key} className="grid gap-1 text-xs">
                  {t(key)}
                  <input type="color" value={toHex(settings.colors[key]) ?? "#000000"} onChange={(event) => setSettings({ ...settings, colors: { ...settings.colors, [key]: event.target.value } })} />
                </label>
              ))}
              <div className="sm:col-span-2 grid gap-2">
                <div className="text-sm font-medium">{t("palette")}</div>
                {settings.palette.map((swatch, index) => (
                  <div key={swatch.id} className="flex items-center gap-2">
                    <input aria-label={t("palette")} className="h-9 flex-1 rounded-md border px-2 text-sm" value={swatch.name} onChange={(event) => {
                      const palette = settings.palette.slice()
                      palette[index] = { ...swatch, name: event.target.value }
                      setSettings({ ...settings, palette })
                    }} />
                    <input type="color" value={toHex(swatch.value) ?? "#000000"} onChange={(event) => {
                      const palette = settings.palette.slice()
                      palette[index] = { ...swatch, value: event.target.value }
                      setSettings({ ...settings, palette })
                    }} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {section === "fonts" ? (
            <div className="grid gap-3">
              {(["body", "heading", "accent"] as const).map((key) => (
                <label key={key} className="grid gap-1 text-xs">
                  {t(`${key}_font`)}
                  <input className="h-9 rounded-md border px-2" value={settings.fonts[key]} onChange={(event) => setSettings({ ...settings, fonts: { ...settings.fonts, [key]: event.target.value } })} />
                </label>
              ))}
            </div>
          ) : null}
          {section === "typography" ? (
            <div className="grid gap-4">
              {TYPE_KEYS.map((key) => (
                <div key={key} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-3">
                  <div className="text-sm font-semibold sm:col-span-3">{t(key)}</div>
                  <Field label={t("font_size")} value={settings.typography[key].fontSize} onChange={(fontSize) => setSettings({ ...settings, typography: { ...settings.typography, [key]: { ...settings.typography[key], fontSize } } })} />
                  <Field label={t("font_weight")} value={settings.typography[key].fontWeight} onChange={(fontWeight) => setSettings({ ...settings, typography: { ...settings.typography, [key]: { ...settings.typography[key], fontWeight } } })} />
                  <Field label={t("line_height")} value={settings.typography[key].lineHeight} onChange={(lineHeight) => setSettings({ ...settings, typography: { ...settings.typography, [key]: { ...settings.typography[key], lineHeight } } })} />
                </div>
              ))}
            </div>
          ) : null}
          {section === "buttons" ? (
            <div className="grid gap-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label={t("radius")} value={settings.buttons.radius} onChange={(radius) => setSettings({ ...settings, buttons: { ...settings.buttons, radius } })} />
                <Field label={t("padding_x")} value={settings.buttons.paddingX} onChange={(paddingX) => setSettings({ ...settings, buttons: { ...settings.buttons, paddingX } })} />
                <Field label={t("padding_y")} value={settings.buttons.paddingY} onChange={(paddingY) => setSettings({ ...settings, buttons: { ...settings.buttons, paddingY } })} />
                <Field label={t("font_size")} value={settings.buttons.fontSize} onChange={(fontSize) => setSettings({ ...settings, buttons: { ...settings.buttons, fontSize } })} />
              </div>
              {BUTTONS.map((name) => (
                <div key={name} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2">
                  <div className="text-sm font-semibold sm:col-span-2">{t(`variant_${name}`)}</div>
                  <ColorField label={t("background")} value={settings.buttons.variants[name].background} onChange={(background) => patchButton(setSettings, settings, name, { background })} />
                  <ColorField label={t("text")} value={settings.buttons.variants[name].color} onChange={(color) => patchButton(setSettings, settings, name, { color })} />
                  <ColorField label={t("hover_bg")} value={settings.buttons.variants[name].hoverBackground} onChange={(hoverBackground) => patchButton(setSettings, settings, name, { hoverBackground })} />
                  <ColorField label={t("hover_fg")} value={settings.buttons.variants[name].hoverColor} onChange={(hoverColor) => patchButton(setSettings, settings, name, { hoverColor })} />
                </div>
              ))}
            </div>
          ) : null}
          {section === "images" ? (
            <div className="grid gap-3">
              <Field label={t("radius")} value={settings.images.radius} onChange={(radius) => setSettings({ ...settings, images: { ...settings.images, radius } })} />
              <label className="grid gap-1 text-xs">
                {t("object_fit")}
                <select className="h-9 rounded-md border px-2" value={settings.images.objectFit} onChange={(event) => setSettings({ ...settings, images: { ...settings.images, objectFit: event.target.value === "contain" ? "contain" : "cover" } })}>
                  <option value="cover">{t("cover")}</option>
                  <option value="contain">{t("contain")}</option>
                </select>
              </label>
              <Toggle label={t("lazy")} checked={settings.images.lazy} onChange={(lazy) => setSettings({ ...settings, images: { ...settings.images, lazy } })} />
              <Toggle label={t("lightbox_images")} checked={settings.images.lightbox} onChange={(lightbox) => setSettings({ ...settings, images: { ...settings.images, lightbox } })} />
            </div>
          ) : null}
          {section === "forms" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("radius")} value={settings.forms.radius} onChange={(radius) => setSettings({ ...settings, forms: { ...settings.forms, radius } })} />
              <Field label={t("padding")} value={settings.forms.padding} onChange={(padding) => setSettings({ ...settings, forms: { ...settings.forms, padding } })} />
              <ColorField label={t("label_color")} value={settings.forms.labelColor} onChange={(labelColor) => setSettings({ ...settings, forms: { ...settings.forms, labelColor } })} />
              <ColorField label={t("field_bg")} value={settings.forms.fieldBackground} onChange={(fieldBackground) => setSettings({ ...settings, forms: { ...settings.forms, fieldBackground } })} />
              <ColorField label={t("border")} value={settings.forms.borderColor} onChange={(borderColor) => setSettings({ ...settings, forms: { ...settings.forms, borderColor } })} />
              <ColorField label={t("focus")} value={settings.forms.focusColor} onChange={(focusColor) => setSettings({ ...settings, forms: { ...settings.forms, focusColor } })} />
              <ColorField label={t("error")} value={settings.forms.errorColor} onChange={(errorColor) => setSettings({ ...settings, forms: { ...settings.forms, errorColor } })} />
            </div>
          ) : null}
          {section === "layout" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("container")} value={settings.layout.containerWidth} onChange={(containerWidth) => setSettings({ ...settings, layout: { ...settings.layout, containerWidth } })} />
              <Field label={t("section_gap")} value={settings.layout.sectionGap} onChange={(sectionGap) => setSettings({ ...settings, layout: { ...settings.layout, sectionGap } })} />
              <Field label={t("column_gap")} value={settings.layout.columnGap} onChange={(columnGap) => setSettings({ ...settings, layout: { ...settings.layout, columnGap } })} />
              <Field label={t("content_padding")} value={settings.layout.contentPadding} onChange={(contentPadding) => setSettings({ ...settings, layout: { ...settings.layout, contentPadding } })} />
              <ColorField label={t("page_background")} value={settings.layout.background} onChange={(background) => setSettings({ ...settings, layout: { ...settings.layout, background } })} />
            </div>
          ) : null}
          {section === "lightbox" ? (
            <div className="grid gap-3">
              <Toggle label={t("lightbox_enabled")} checked={settings.lightbox.enabled} onChange={(enabled) => setSettings({ ...settings, lightbox: { ...settings.lightbox, enabled } })} />
              <Field label={t("background")} value={settings.lightbox.background} onChange={(background) => setSettings({ ...settings, lightbox: { ...settings.lightbox, background } })} />
            </div>
          ) : null}
          {section === "variables" ? (
            <label className="grid gap-1 text-xs">
              {t("custom_vars")}
              <textarea className="min-h-40 rounded-md border px-2 py-2 font-mono" value={settings.cssVariables} onChange={(event) => setSettings({ ...settings, cssVariables: event.target.value })} />
              <span className="text-muted-foreground">{t("custom_vars_hint")}</span>
            </label>
          ) : null}
        </section>
      </div>
    </PageShell>
  )
}

function patchButton(
  setSettings: (value: BuilderGlobals) => void,
  settings: BuilderGlobals,
  name: (typeof BUTTONS)[number],
  patch: Partial<BuilderGlobals["buttons"]["variants"]["primary"]>,
) {
  setSettings({
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
      <input className="h-9 rounded-md border px-2" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const hex = toHex(value)
  return (
    <label className="grid gap-1 text-xs">
      {label}
      <span className="flex items-center gap-2">
        {hex ? <input type="color" value={hex} onChange={(event) => onChange(event.target.value)} /> : null}
        <input className="h-9 flex-1 rounded-md border px-2" value={value} onChange={(event) => onChange(event.target.value)} />
      </span>
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

function toHex(value: string): string | null {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : null
}
