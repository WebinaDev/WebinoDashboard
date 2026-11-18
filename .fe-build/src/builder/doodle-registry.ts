/* Schema helpers for doodle / offset-shadow builder options.
 * Keep WebinoDashboard and WebinoERP copies identical. */

import { uid } from "./ids"
import type { FieldDef, WidgetDef, WidgetNode } from "./types"

function node(type: string, props: Record<string, unknown>): WidgetNode {
  return { id: uid("w"), type, props }
}

type IconOpt = { value: string; label: string }

const DOODLE_CARD_FIELDS: FieldDef[] = [
  { kind: "select", key: "cardStyle", label: "سبک کارت", options: [
    { value: "default", label: "پیش‌فرض" },
    { value: "doodle", label: "دودل (سایه جابه‌جا)" },
  ] },
  { kind: "number", key: "borderWidth", label: "ضخامت حاشیه (پیکسل)", min: 1, max: 8 },
  { kind: "color", key: "borderColor", label: "رنگ حاشیه" },
  { kind: "number", key: "shadowX", label: "جابه‌جایی سایه افقی", min: 0, max: 16 },
  { kind: "number", key: "shadowY", label: "جابه‌جایی سایه عمودی", min: 0, max: 16 },
  { kind: "color", key: "shadowColor", label: "رنگ سایه" },
  { kind: "number", key: "radius", label: "گردی گوشه (پیکسل)", min: 8, max: 40 },
]

const SECTION_EYEBROW_FIELDS: FieldDef[] = [
  { kind: "select", key: "eyebrowStyle", label: "سبک برچسب بالا", options: [
    { value: "soft", label: "نرم (پیش‌فرض)" },
    { value: "pill", label: "قرص با حاشیه ضخیم" },
  ] },
  { kind: "color", key: "eyebrowBg", label: "پس‌زمینه برچسب (قرص)" },
  { kind: "color", key: "eyebrowColor", label: "رنگ متن برچسب (قرص)" },
  { kind: "color", key: "eyebrowBorderColor", label: "رنگ حاشیه برچسب (قرص)" },
  { kind: "number", key: "eyebrowBorderWidth", label: "ضخامت حاشیه برچسب", min: 1, max: 5 },
]

const CTA_DOODLE_FIELDS: FieldDef[] = [
  { kind: "select", key: "borderStyle", label: "سبک حاشیه", options: [
    { value: "none", label: "بدون حاشیه (پیش‌فرض)" },
    { value: "dashed", label: "خط‌چین دودل" },
  ] },
  { kind: "color", key: "gradientFrom", label: "شروع گرادیان" },
  { kind: "color", key: "gradientVia", label: "میانه گرادیان" },
  { kind: "color", key: "gradientTo", label: "پایان گرادیان" },
  { kind: "color", key: "borderColor", label: "رنگ حاشیه / سایه" },
]

/** Append doodle options onto shared content widgets without changing defaults. */
export function withDoodleContentFields(defs: WidgetDef[]): WidgetDef[] {
  return defs.map((def) => {
    if (def.type === "icon-cards") {
      return { ...def, fields: [...def.fields, ...DOODLE_CARD_FIELDS] }
    }
    if (def.type === "section-heading") {
      return { ...def, fields: [...def.fields, ...SECTION_EYEBROW_FIELDS] }
    }
    if (def.type === "cta-banner") {
      return { ...def, fields: [...def.fields, ...CTA_DOODLE_FIELDS] }
    }
    return def
  })
}

export const IMAGE_BLOB_FIELDS: FieldDef[] = [
  { kind: "select", key: "frameStyle", label: "قاب تصویر", options: [
    { value: "default", label: "پیش‌فرض" },
    { value: "blob-a", label: "حبابی ۱" },
    { value: "blob-b", label: "حبابی ۲" },
    { value: "blob-c", label: "حبابی ۳" },
    { value: "blob-round", label: "دایره" },
  ] },
  { kind: "number", key: "borderWidth", label: "ضخامت حاشیه قاب", min: 0, max: 8 },
  { kind: "color", key: "borderColor", label: "رنگ حاشیه قاب" },
  { kind: "number", key: "shadowX", label: "جابه‌جایی سایه افقی", min: 0, max: 20 },
  { kind: "number", key: "shadowY", label: "جابه‌جایی سایه عمودی", min: 0, max: 20 },
  { kind: "color", key: "shadowColor", label: "رنگ سایه قاب" },
  { kind: "color", key: "frameBg", label: "پس‌زمینه قاب" },
  { kind: "repeater", key: "stickers", label: "برچسب‌های شناور", fields: [
    { key: "text", label: "متن", kind: "text" },
    { key: "position", label: "جایگاه", kind: "select", options: [
      { value: "tl", label: "بالا شروع" },
      { value: "tr", label: "بالا پایان" },
      { value: "bl", label: "پایین شروع" },
      { value: "br", label: "پایین پایان" },
      { value: "tc", label: "بالا وسط" },
      { value: "bc", label: "پایین وسط" },
    ] },
    { key: "rotation", label: "چرخش (درجه)", kind: "text" },
    { key: "bg", label: "پس‌زمینه", kind: "text" },
    { key: "color", label: "رنگ متن", kind: "text" },
  ] },
]

export const BUTTON_DOODLE_TONE = { value: "doodle", label: "دودل" }

export const BUTTON_DOODLE_FIELDS: FieldDef[] = [
  { kind: "color", key: "doodleBg", label: "پس‌زمینه دکمه دودل" },
  { kind: "color", key: "doodleColor", label: "رنگ متن دکمه دودل" },
  { kind: "color", key: "doodleBorderColor", label: "رنگ حاشیه دکمه دودل" },
  { kind: "color", key: "doodleShadowColor", label: "رنگ سایه دکمه دودل" },
  { kind: "select", key: "doodleFill", label: "پر شدن دکمه دودل", options: [
    { value: "solid", label: "توپر" },
    { value: "ghost", label: "خطی روشن" },
  ] },
]

export function doodleWidgets(iconOptions: IconOpt[] = []): WidgetDef[] {
  return [
    {
      type: "blob-image",
      label: "تصویر حبابی با برچسب",
      category: "media",
      fields: [
        { kind: "media", key: "src", label: "تصویر" },
        { kind: "text", key: "alt", label: "متن جایگزین" },
        { kind: "select", key: "blobShape", label: "شکل حباب", options: [
          { value: "a", label: "حباب ۱" },
          { value: "b", label: "حباب ۲" },
          { value: "c", label: "حباب ۳" },
          { value: "round", label: "دایره" },
        ] },
        { kind: "number", key: "size", label: "اندازه (پیکسل)", min: 160, max: 560 },
        { kind: "number", key: "borderWidth", label: "ضخامت حاشیه", min: 0, max: 8 },
        { kind: "color", key: "borderColor", label: "رنگ حاشیه" },
        { kind: "number", key: "shadowX", label: "جابه‌جایی سایه افقی", min: 0, max: 20 },
        { kind: "number", key: "shadowY", label: "جابه‌جایی سایه عمودی", min: 0, max: 20 },
        { kind: "color", key: "shadowColor", label: "رنگ سایه" },
        { kind: "color", key: "frameBg", label: "پس‌زمینه قاب" },
        { kind: "repeater", key: "stickers", label: "برچسب‌های شناور", fields: [
          { key: "text", label: "متن", kind: "text" },
          { key: "position", label: "جایگاه", kind: "select", options: [
            { value: "tl", label: "بالا شروع" },
            { value: "tr", label: "بالا پایان" },
            { value: "bl", label: "پایین شروع" },
            { value: "br", label: "پایین پایان" },
            { value: "tc", label: "بالا وسط" },
            { value: "bc", label: "پایین وسط" },
          ] },
          { key: "rotation", label: "چرخش (درجه)", kind: "text" },
          { key: "bg", label: "پس‌زمینه", kind: "text" },
          { key: "color", label: "رنگ متن", kind: "text" },
        ] },
      ],
      create: () => node("blob-image", {
        src: "",
        alt: "",
        blobShape: "a",
        size: 380,
        borderWidth: 3,
        borderColor: "#2b2230",
        shadowX: 8,
        shadowY: 8,
        shadowColor: "#e85d4c",
        frameBg: "#f0a202",
        stickers: "۱۳+ سال تدریس|tl|-6|#fff|#2b2230\nآنلاین + حضوری|br|5|#3aa6b9|#fff",
      }),
    },
    {
      type: "tint-cards",
      label: "کارت‌های رنگی (دوره / خدمت)",
      category: "content",
      fields: [
        { kind: "repeater", key: "items", label: "کارت‌ها", fields: [
          { key: "icon", label: "آیکن", kind: "icon", options: iconOptions },
          { key: "title", label: "عنوان", kind: "text" },
          { key: "meta", label: "متای انگلیسی / سطح", kind: "text" },
          { key: "text", label: "توضیح", kind: "textarea" },
          { key: "chips", label: "چیپ‌ها (با ویرگول)", kind: "text" },
          { key: "ctaLabel", label: "متن دکمه", kind: "text" },
          { key: "ctaHref", label: "پیوند دکمه", kind: "url" },
          { key: "tint", label: "رنگ تینت کارت", kind: "text" },
        ] },
        { kind: "select", key: "columns", label: "ستون‌ها", options: [
          { value: "1", label: "۱" },
          { value: "2", label: "۲" },
          { value: "3", label: "۳" },
        ] },
        { kind: "color", key: "borderColor", label: "رنگ حاشیه" },
      ],
      create: () => node("tint-cards", {
        items: "badge|عنوان کارت|Meta · A2|توضیح کوتاه کارت|۱۲ جلسه,نمونه|ثبت‌نام|/#|#ffe8e3",
        columns: "2",
        borderColor: "#2b2230",
      }),
    },
    {
      type: "circle-badges",
      label: "قرص‌های سطح دایره‌ای",
      // SiteBuilder alias: doodle-level-pills
      category: "content",
      fields: [
        { kind: "repeater", key: "items", label: "نشان‌ها", fields: [
          { key: "label", label: "عنوان", kind: "text" },
          { key: "sublabel", label: "زیرعنوان", kind: "text" },
          { key: "bg", label: "پس‌زمینه", kind: "text" },
          { key: "shadowColor", label: "رنگ سایه", kind: "text" },
        ] },
        { kind: "number", key: "size", label: "اندازه دایره (پیکسل)", min: 80, max: 200 },
        { kind: "color", key: "borderColor", label: "رنگ حاشیه" },
      ],
      create: () => node("circle-badges", {
        items: "مبتدی|Starter|#ffffff|#3aa6b9\nمتوسط|Intermediate|#ffe8e3|#e85d4c\nپیشرفته|Advanced|#e5f6f9|#3aa6b9\nآیلتس|IELTS|#fff3d1|#f0a202",
        size: 140,
        borderColor: "#2b2230",
      }),
    },
  ]
}
