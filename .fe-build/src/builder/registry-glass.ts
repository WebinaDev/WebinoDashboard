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
