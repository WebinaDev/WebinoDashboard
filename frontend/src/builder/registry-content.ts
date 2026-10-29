/* Builder widget definitions shared with WebinoERP via `@webina/ui/builder`.
 * CONTENT_WIDGETS: landing pack (section-heading, steps, icon-cards, badges, cta-banner, comparison-table).
 * FORM_WIDGET: shared pro form schema, with Dashboard labels and defaults. */

import { sharedContentWidgets, sharedFormWidget, sharedGapWidgets } from "@webina/ui/builder"

import { uid } from "./ids"
import { createSection } from "./tree"
import { ICON_OPTIONS } from "./render/icon-options"
import type { WidgetDef } from "./types"

const sharedForm = sharedFormWidget({ formKeyLabel: "شناسه فرم (برای تنظیم اقدام‌ها)", fieldsLabel: "فیلدها" })

/** Shared form; Dashboard adapter keeps its own defaults (email field, phone/email toggles on). */
export const FORM_WIDGET: WidgetDef = {
  ...sharedForm,
  create: () => ({
    id: uid("w"),
    type: "form",
    props: {
      title: "ارسال پیام",
      submit: "ارسال",
      fields: "نام|name|text\nایمیل|email|email\nپیام|message|textarea",
      success: "پیام شما ثبت شد.",
      columns: "1",
      showPhone: true,
      showEmail: true,
      // v0.2 shared form schema: captcha, webhook and CRM hand-off (off by default).
      captcha: false,
      webhookUrl: "",
      crmAction: "",
      crmKey: "",
    },
  }),
}

function withIconCardHref(defs: WidgetDef[]): WidgetDef[] {
  return defs.map((def) => {
    if (def.type !== "icon-cards") return def
    return {
      ...def,
      fields: def.fields.map((field) => {
        if (field.kind !== "repeater" || field.key !== "items") return field
        const hasHref = field.fields.some((f) => f.key === "href")
        if (hasHref) return field
        return {
          ...field,
          fields: [...field.fields, { key: "href", label: "پیوند (tel یا mailto یا https)", kind: "url" as const }],
        }
      }),
    }
  })
}

export const CONTENT_WIDGETS: WidgetDef[] = [
  ...withIconCardHref(sharedContentWidgets(ICON_OPTIONS) as WidgetDef[]),
  {
    type: "callout",
    label: "باکس توجه",
    category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "text", label: "متن" },
      { kind: "icon", key: "icon", label: "آیکن", options: ICON_OPTIONS },
      { kind: "select", key: "variant", label: "ظاهر", options: [
        { value: "soft", label: "نرم" },
        { value: "solid", label: "توپر" },
        { value: "outline", label: "خطی" },
      ] },
      { kind: "select", key: "tone", label: "رنگ", options: [
        { value: "brand", label: "برند" },
        { value: "info", label: "اطلاعات" },
        { value: "success", label: "موفقیت" },
        { value: "warning", label: "هشدار" },
        { value: "muted", label: "خنثی" },
      ] },
      { kind: "text", key: "buttonLabel", label: "متن دکمه (اختیاری)" },
      { kind: "link", key: "buttonHref", label: "پیوند دکمه" },
    ],
    create: () => ({
      id: uid("w"),
      type: "callout",
      props: { title: "نکته مهم", text: "متن کوتاه راهنما یا توجه", icon: "badge", variant: "soft", tone: "brand", buttonLabel: "", buttonHref: "" },
    }),
  },
]

const SECTION_PRESETS: Record<string, number[]> = { "12": [12], "6-6": [6, 6], "4-4-4": [4, 4, 4], "3-3-3-3": [3, 3, 3, 3], "8-4": [8, 4], "4-8": [4, 8] }

/**
 * v0.2 gap pack (team, media, auth forms, layout containers, general header/footer). Layout types get
 * nested sections here, as the shared package only ships schemas/defaults.
 */
export const GAP_WIDGETS: WidgetDef[] = sharedGapWidgets(ICON_OPTIONS).map((def) => {
  const base = def as unknown as WidgetDef
  if (!["section", "columns", "flex-container", "grid-container"].includes(def.type)) return base
  return {
    ...base,
    create: () => {
      const node = base.create()
      const preset = typeof node.props.columnPreset === "string" ? SECTION_PRESETS[node.props.columnPreset] : undefined
      return { ...node, children: [createSection(preset ?? [12])] }
    },
  }
})
