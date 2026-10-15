/* Shared builder widget definitions (ERP + Dashboard contract, Dashboard 5f6b2a3).
 * Renderers stay per platform; these are the editor schemas + defaults. */
import { uid } from "./ids"
import { FORM_FIELD_TYPES, type FormFieldType } from "./forms"
import type { SharedOption, SharedWidgetDef, SharedWidgetNode } from "./types"

export type SharedFormOptions = { formKeyLabel?: string; fieldsLabel?: string }

export const DEFAULT_ICON_OPTIONS: SharedOption[] = [
  { value: "truck", label: "ارسال" },
  { value: "shield", label: "ضمانت" },
  { value: "star", label: "ستاره" },
  { value: "sparkles", label: "درخشش" },
  { value: "heart", label: "قلب" },
  { value: "gift", label: "هدیه" },
  { value: "phone", label: "تلفن" },
  { value: "clock", label: "ساعت" },
  { value: "card", label: "کارت بانکی" },
  { value: "badge", label: "نشان" },
  { value: "support", label: "پشتیبانی" },
  { value: "map", label: "مکان" },
]

const FORM_TYPE_LABELS: Record<FormFieldType, string> = { text: "متن", email: "ایمیل", tel: "تلفن", number: "عدد", textarea: "متن بلند", select: "فهرست کشویی", radio: "تک‌انتخابی", checkbox: "چندانتخابی", date: "تاریخ", file: "فایل (پیوست)", heading: "عنوان گروه" }

function node(type: string, props: Record<string, unknown>): SharedWidgetNode {
  return { id: uid("w"), type, props }
}

const ALIGN = { kind: "select" as const, key: "align", label: "تراز", options: [
  { value: "center", label: "وسط" },
  { value: "start", label: "راست (شروع)" },
  { value: "end", label: "چپ (پایان)" },
] }

/** Shared pro form. `formKey` is resolved by the platform adapter (ERP: Marketing form slug). */
export function sharedFormWidget(opts: SharedFormOptions = {}): SharedWidgetDef {
  return {
  type: "form",
  label: "فرم",
  category: "basic",
  fields: [
    { kind: "text", key: "title", label: "عنوان" },
    { kind: "textarea", key: "intro", label: "متن بالای فرم" },
    { kind: "text", key: "submit", label: "دکمه" },
    { kind: "text", key: "formKey", label: opts.formKeyLabel ?? "نامک فرم" },
    {
      kind: "repeater",
      key: "fields",
      label: opts.fieldsLabel ?? "فیلدها (خالی = فیلدهای تعریف‌شده روی سرور)",
      fields: [
        { key: "label", label: "برچسب", kind: "text" },
        { key: "name", label: "نام فنی (name)", kind: "text" },
        { key: "type", label: "نوع", kind: "select", options: FORM_FIELD_TYPES.map((value) => ({ value, label: FORM_TYPE_LABELS[value] })) },
        { key: "options", label: "گزینه‌ها (با ، جدا)", kind: "text" },
        { key: "required", label: "الزامی", kind: "select", options: [{ value: "", label: "بله" }, { value: "no", label: "خیر" }] },
        { key: "step", label: "مرحله", kind: "text" },
        { key: "showIf", label: "نمایش فقط اگر (name=مقدار)", kind: "text" },
      ],
    },
    { kind: "select", key: "columns", label: "ستون فیلدها", options: [{ value: "1", label: "یک ستون" }, { value: "2", label: "دو ستون" }] },
    { kind: "text", key: "success", label: "پیام موفقیت" },
    { kind: "textarea", key: "note", label: "متن زیر فرم" },
    { kind: "text", key: "anchor", label: "شناسه لنگر (#)" },
    { kind: "textarea", key: "stepTitles", label: "عنوان مراحل (هر خط یک مرحله)" },
    { kind: "switch", key: "review", label: "مرحله بررسی نهایی (خلاصه قابل ویرایش)" },
    { kind: "repeater", key: "confirms", label: "تأییدهای الزامی", fields: [{ key: "text", label: "متن", kind: "text" }] },
    { kind: "switch", key: "showPhone", label: "فیلد تلفن" },
    { kind: "switch", key: "showEmail", label: "فیلد ایمیل" },
  ],
  create: () =>
    node("form", {
      title: "ارسال پیام",
      submit: "ارسال",
      formKey: "contact",
      fields: "",
      success: "پیام شما ثبت شد.",
      columns: "1",
    }),
  }
}

export function sharedContentWidgets(iconOptions: SharedOption[] = DEFAULT_ICON_OPTIONS): SharedWidgetDef[] {
  return [
  {
    type: "section-heading",
    label: "سرتیتر بخش",
    category: "content",
    fields: [
      { kind: "text", key: "eyebrow", label: "برچسب بالا" },
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "select", key: "tag", label: "سطح", options: [
        { value: "h1", label: "عنوان اصلی (h1)" },
        { value: "h2", label: "عنوان (h2)" },
        { value: "h3", label: "زیرعنوان (h3)" },
      ] },
      { kind: "text", key: "subtitle", label: "زیرعنوان" },
      { kind: "textarea", key: "text", label: "متن" },
      { kind: "text", key: "linkLabel", label: "متن پیوند" },
      { kind: "link", key: "linkHref", label: "پیوند" },
      ALIGN,
    ],
    create: () => node("section-heading", { title: "عنوان بخش", tag: "h2", align: "center" }),
  },
  {
    type: "steps",
    label: "مراحل / فرآیند",
    category: "content",
    fields: [
      { kind: "repeater", key: "items", label: "مراحل", fields: [{ key: "title", label: "عنوان", kind: "text" }, { key: "text", label: "توضیح", kind: "textarea" }] },
      { kind: "select", key: "layout", label: "چیدمان", options: [
        { value: "horizontal", label: "افقی با خط اتصال" },
        { value: "vertical", label: "عمودی (تایم‌لاین)" },
      ] },
      { kind: "text", key: "note", label: "نکته زیر مراحل" },
    ],
    create: () => node("steps", { items: "مرحله اول|توضیح مرحله\nمرحله دوم|توضیح مرحله\nمرحله سوم|توضیح مرحله", layout: "horizontal" }),
  },
  {
    type: "icon-cards",
    label: "کارت‌های آیکن‌دار",
    category: "content",
    fields: [
      { kind: "repeater", key: "items", label: "کارت‌ها", fields: [{ key: "icon", label: "آیکن", kind: "icon", options: iconOptions }, { key: "title", label: "عنوان", kind: "text" }, { key: "text", label: "متن", kind: "textarea" }, { key: "prefill", label: "پیش‌پرکردن فرم (name=مقدار)", kind: "text" }] },
      { kind: "text", key: "anchor", label: "فرم مقصد کلیک کارت (شناسه لنگر)" },
      { kind: "select", key: "columns", label: "ستون‌ها", options: [
        { value: "1", label: "۱" },
        { value: "2", label: "۲" },
        { value: "3", label: "۳" },
        { value: "4", label: "۴" },
      ] },
      { kind: "select", key: "variant", label: "ظاهر", options: [
        { value: "card", label: "کارت افقی" },
        { value: "stacked", label: "کارت عمودی" },
        { value: "check", label: "فهرست تیک‌دار" },
        { value: "minimal", label: "مینیمال" },
      ] },
    ],
    create: () => node("icon-cards", { items: "badge|عنوان کارت|توضیح کوتاه", columns: "3", variant: "card" }),
  },
  {
    type: "badges",
    label: "نشان‌های اعتماد",
    category: "content",
    fields: [
      { kind: "repeater", key: "items", label: "نشان‌ها", fields: [{ key: "icon", label: "آیکن", kind: "icon", options: iconOptions }, { key: "text", label: "متن", kind: "text" }] },
      ALIGN,
    ],
    create: () => node("badges", { items: "clock|جلسه ۳۰ تا ۴۵ دقیقه‌ای\nshield|بدون تعهد خرید", align: "center" }),
  },
  {
    type: "cta-banner",
    label: "بنر فراخوان (CTA)",
    category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "text", label: "متن" },
      { kind: "text", key: "label", label: "متن دکمه" },
      { kind: "link", key: "href", label: "پیوند دکمه" },
      { kind: "text", key: "secondaryLabel", label: "متن پیوند دوم" },
      { kind: "link", key: "secondaryHref", label: "پیوند دوم" },
      { kind: "select", key: "tone", label: "رنگ", options: [
        { value: "primary", label: "اصلی" },
        { value: "dark", label: "تیره" },
        { value: "light", label: "روشن" },
      ] },
    ],
    create: () => node("cta-banner", { title: "آماده شروع هستید؟", text: "", label: "تماس با ما", href: "/contact", tone: "primary" }),
  },
  {
    type: "comparison-table",
    label: "جدول مقایسه",
    category: "content",
    fields: [
      { kind: "text", key: "colA", label: "عنوان ستون اول" },
      { kind: "text", key: "colB", label: "عنوان ستون دوم" },
      { kind: "repeater", key: "rows", label: "ردیف‌ها", fields: [{ key: "a", label: "ستون اول", kind: "text" }, { key: "b", label: "ستون دوم", kind: "text" }] },
      { kind: "select", key: "highlight", label: "ستون برجسته", options: [{ value: "b", label: "ستون دوم" }, { value: "a", label: "ستون اول" }, { value: "", label: "هیچ‌کدام" }] },
    ],
    create: () => node("comparison-table", { colA: "گزینه الف", colB: "گزینه ب", rows: "|", highlight: "b" }),
  },
]
}
