/* Shared opt-in settings for every header/nav and footer widget (generic + poetry). All default off,
 * so saved pages render exactly as before. Renderers: render/chrome-extras.tsx. */
import type { FieldDef, WidgetDef } from "./types"

export const NAV_TYPES = new Set(["site-header", "poetry-nav"])
export const FOOTER_TYPES = new Set(["site-footer", "poetry-footer", "poetry-site-footer"])

const LINKS = [{ key: "label", label: "برچسب", kind: "text" }, { key: "href", label: "نشانی", kind: "url" }] as const

export const NAV_EXTRA_FIELDS: FieldDef[] = [
  { kind: "switch", key: "showCart", label: "نمایش آیکن سبد خرید با تعداد" },
  { kind: "link", key: "cartHref", label: "پیوند سبد خرید" },
  { kind: "select", key: "cartHideOn", label: "نمایش سبد خرید در دستگاه‌ها", options: [{ value: "", label: "همه دستگاه‌ها" }, { value: "mobile", label: "پنهان در موبایل" }, { value: "tablet", label: "پنهان در تبلت و موبایل" }] },
  { kind: "switch", key: "showAccount", label: "نمایش دکمه ورود یا منوی حساب" },
  { kind: "select", key: "accountHideOn", label: "نمایش ورود و حساب در دستگاه‌ها", options: [{ value: "", label: "همه دستگاه‌ها" }, { value: "mobile", label: "پنهان در موبایل" }, { value: "tablet", label: "پنهان در تبلت و موبایل" }] },
  { kind: "text", key: "loginLabel", label: "متن دکمه ورود" },
  { kind: "link", key: "loginHref", label: "پیوند صفحه ورود" },
  { kind: "repeater", key: "accountLinks", label: "منوی حساب کاربری پس از ورود", fields: [...LINKS] } as FieldDef,
  { kind: "switch", key: "showLogout", label: "نمایش گزینه خروج در منوی حساب" },
  { kind: "text", key: "logoutLabel", label: "متن گزینه خروج" },
]

export const FOOTER_EXTRA_FIELDS: FieldDef[] = [
  { kind: "text", key: "footerAboutTitle", label: "عنوان ستون درباره" },
  { kind: "textarea", key: "footerAbout", label: "متن ستون درباره" },
  { kind: "text", key: "footerAboutLinkLabel", label: "متن پیوند ستون درباره" },
  { kind: "link", key: "footerAboutLinkHref", label: "پیوند ستون درباره" },
  { kind: "text", key: "footerOccasionsTitle", label: "عنوان ستون مناسبت‌ها" },
  { kind: "repeater", key: "footerOccasions", label: "ستون مناسبت‌ها", fields: [...LINKS] } as FieldDef,
  { kind: "text", key: "footerContactTitle", label: "عنوان ستون تماس" },
  { kind: "text", key: "footerPhone", label: "تلفن" },
  { kind: "text", key: "footerEmail", label: "ایمیل" },
  { kind: "textarea", key: "footerAddress", label: "نشانی" },
  { kind: "switch", key: "footerNewsletter", label: "ستون خبرنامه" },
  { kind: "text", key: "footerNewsletterTitle", label: "عنوان خبرنامه" },
  { kind: "textarea", key: "footerNewsletterText", label: "متن خبرنامه" },
  { kind: "text", key: "footerNewsletterPlaceholder", label: "متن راهنمای ورودی خبرنامه" },
  { kind: "text", key: "footerNewsletterButton", label: "متن دکمه خبرنامه" },
  { kind: "text", key: "trustSealsTitle", label: "عنوان نمادهای اعتماد" },
  { kind: "textarea", key: "trustSeals", label: "کد تعبیه نمادهای اعتماد مثل اینماد و ساماندهی (هر کد را با یک خط ### جدا کنید)" },
  { kind: "media", key: "footerPattern", label: "تصویر پس‌زمینه پاورقی (نقش اسلیمی)", accept: "image" },
  { kind: "select", key: "footerPatternRepeat", label: "تکرار تصویر پس‌زمینه", options: [{ value: "repeat", label: "تکرار" }, { value: "repeat-x", label: "تکرار افقی" }, { value: "repeat-y", label: "تکرار عمودی" }, { value: "no-repeat", label: "بدون تکرار" }] },
  { kind: "select", key: "footerPatternSize", label: "اندازه تصویر پس‌زمینه", options: [{ value: "auto", label: "اندازه اصلی" }, { value: "120px", label: "کوچک" }, { value: "240px", label: "متوسط" }, { value: "400px", label: "بزرگ" }, { value: "contain", label: "کامل بدون برش" }, { value: "cover", label: "پوشش کامل" }] },
  { kind: "select", key: "footerPatternPosition", label: "جای تصویر پس‌زمینه", options: [{ value: "center", label: "وسط" }, { value: "top", label: "بالا" }, { value: "bottom", label: "پایین" }, { value: "right", label: "راست" }, { value: "left", label: "چپ" }] },
  { kind: "slider", key: "footerPatternOpacity", label: "شفافیت تصویر پس‌زمینه", min: 0, max: 100, step: 5, unit: "%" },
  { kind: "color", key: "footerOverlay", label: "رنگ روکش پاورقی" },
  { kind: "slider", key: "footerOverlayOpacity", label: "شفافیت روکش پاورقی", min: 0, max: 100, step: 5, unit: "%" },
  { kind: "switch", key: "footerFullBleed", label: "تمام‌عرض واقعی تا لبه صفحه" },
  { kind: "color", key: "copyrightBg", label: "زمینه نوار کپی‌رایت" },
]

const has = (d: WidgetDef, key: string) => d.fields.some((f) => "key" in f && f.key === key)

/** Append the shared chrome settings to header/footer defs (idempotent). */
export function applyChromeExtras(defs: WidgetDef[]): void {
  for (const d of defs) {
    const extra = NAV_TYPES.has(d.type) ? NAV_EXTRA_FIELDS : FOOTER_TYPES.has(d.type) ? FOOTER_EXTRA_FIELDS : null
    if (!extra) continue
    d.fields = [...d.fields, ...extra.filter((f) => !("key" in f) || !has(d, f.key))]
  }
}
