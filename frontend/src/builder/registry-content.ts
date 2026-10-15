/* Builder widget definitions shared with WebinoERP via `@webina/ui/builder`.
 * CONTENT_WIDGETS: landing pack (section-heading, steps, icon-cards, badges, cta-banner, comparison-table).
 * FORM_WIDGET: shared pro form schema, with Dashboard labels and defaults. */

import { sharedContentWidgets, sharedFormWidget } from "@webina/ui/builder"

import { uid } from "./ids"
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
    },
  }),
}

export const CONTENT_WIDGETS: WidgetDef[] = sharedContentWidgets(ICON_OPTIONS)
