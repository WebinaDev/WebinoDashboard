/* Shared landing-page widgets (section heading, steps, icon cards, badges, CTA, comparison).
 * Same definitions as WebinoERP `registry-content.ts` minus ERP-only rahn / marketing form wiring. */

import { uid } from "./ids"
import { ICON_OPTIONS } from "./render/icon-options"
import type { WidgetDef, WidgetNode } from "./types"

function node(type: string, props: Record<string, unknown>): WidgetNode {
  return { id: uid("w"), type, props }
}

const ALIGN = { kind: "select" as const, key: "align", label: "تراز", options: [
  { value: "center", label: "وسط" },
  { value: "start", label: "راست (شروع)" },
  { value: "end", label: "چپ (پایان)" },
] }

export const CONTENT_WIDGETS: WidgetDef[] = [
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
      { kind: "repeater", key: "items", label: "کارت‌ها", fields: [{ key: "icon", label: "آیکن", kind: "icon", options: ICON_OPTIONS }, { key: "title", label: "عنوان", kind: "text" }, { key: "text", label: "متن", kind: "textarea" }, { key: "prefill", label: "پیش‌پرکردن فرم (name=مقدار)", kind: "text" }] },
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
      { kind: "repeater", key: "items", label: "نشان‌ها", fields: [{ key: "icon", label: "آیکن", kind: "icon", options: ICON_OPTIONS }, { key: "text", label: "متن", kind: "text" }] },
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
