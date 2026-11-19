import type { FieldDef } from "./types"

/** Shared glass surface fields for generic content widgets (pricing, FAQ, forms, …). */
export const GLASS_TONE_FIELDS: FieldDef[] = [
  { kind: "select", key: "tone", label: "زمینه", options: [
    { value: "default", label: "پیش‌فرض" },
    { value: "glass", label: "شیشه‌ای (نیمه‌شفاف با محو پس‌زمینه)" },
  ] },
  { kind: "color", key: "accentColor", label: "رنگ تأکید" },
  { kind: "color", key: "textColor", label: "رنگ متن" },
  { kind: "color", key: "glassBg", label: "رنگ پس‌زمینه شیشه‌ای" },
  { kind: "color", key: "glassBorder", label: "رنگ حاشیه شیشه‌ای" },
]

/** Tone fields for storefront widgets (product page parts, grids, reviews). Rendered by store-tone.tsx. */
export const STORE_TONE_FIELDS: FieldDef[] = [
  { kind: "select", key: "tone", label: "زمینه رنگی", options: [
    { value: "", label: "پیش‌فرض قالب" },
    { value: "dark", label: "تیره (متن روشن)" },
    { value: "glass-dark", label: "شیشه‌ای تیره (متن روشن + محو پس‌زمینه)" },
    { value: "glass", label: "شیشه‌ای روشن (متن تیره)" },
  ] },
  { kind: "color", key: "accentColor", label: "رنگ دکمه و تأکید" },
  { kind: "color", key: "accentInk", label: "رنگ متن روی دکمه (خالی = خودکار)" },
  { kind: "color", key: "textColor", label: "رنگ متن" },
  { kind: "color", key: "glassBg", label: "رنگ پس‌زمینه کارت‌ها" },
  { kind: "color", key: "glassBorder", label: "رنگ حاشیه" },
]
