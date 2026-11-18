/* Shared opt-in settings for every header/nav and footer widget (generic + poetry), used by both
 * WebinoDashboard and WebinoERP. All default off, so saved pages render exactly as before.
 * Moved from WebinoDashboard 828c227 (+ ERP d449222 mirror). Renderers stay per platform and must use
 * `hideOnClass` + `@webina/ui/styles/hide-on.css` for the *HideOn selects. */
import type { SharedFieldDef } from "./types"

export const NAV_TYPES = new Set(["site-header", "poetry-nav"])
export const FOOTER_TYPES = new Set(["site-footer", "poetry-footer", "poetry-site-footer"])

/** Shared hide-by-device values; same breakpoints everywhere (tablet ≤1024px, mobile ≤767px). */
export const HIDE_ON_OPTIONS = [{ value: "", label: "همه دستگاه‌ها" }, { value: "mobile", label: "پنهان در موبایل" }, { value: "tablet", label: "پنهان در تبلت و موبایل" }]
export type HideOn = "" | "mobile" | "tablet"
/** Class for a `*HideOn` value; pair with `@webina/ui/styles/hide-on.css`. */
export const hideOnClass = (v: unknown): string => (v === "mobile" ? "wbx-hide-m" : v === "tablet" ? "wbx-hide-t" : "")
/** Field factory for a generic per-device visibility select. */
export const hideOnField = (key: string, label: string): SharedFieldDef => ({ kind: "select", key, label, options: HIDE_ON_OPTIONS })

const LINKS = [{ key: "label", label: "برچسب", kind: "text" }, { key: "href", label: "نشانی", kind: "url" }] as const
export const NAV_EXTRA_FIELDS: SharedFieldDef[] = [
  { kind: "switch", key: "showCart", label: "نمایش آیکن سبد خرید با تعداد" },
  { kind: "link", key: "cartHref", label: "پیوند سبد خرید" },
  hideOnField("cartHideOn", "نمایش سبد خرید در دستگاه‌ها"),
  { kind: "switch", key: "showAccount", label: "نمایش دکمه ورود یا منوی حساب" },
  hideOnField("accountHideOn", "نمایش ورود و حساب در دستگاه‌ها"),
  { kind: "text", key: "loginLabel", label: "متن دکمه ورود" },
  { kind: "link", key: "loginHref", label: "پیوند صفحه ورود" },
  { kind: "repeater", key: "accountLinks", label: "منوی حساب کاربری پس از ورود", fields: [...LINKS] },
  { kind: "switch", key: "showLogout", label: "نمایش گزینه خروج در منوی حساب" },
  { kind: "text", key: "logoutLabel", label: "متن گزینه خروج" },
]
export const FOOTER_EXTRA_FIELDS: SharedFieldDef[] = [
  { kind: "text", key: "footerAboutTitle", label: "عنوان ستون درباره" },
  { kind: "textarea", key: "footerAbout", label: "متن ستون درباره" },
  { kind: "text", key: "footerAboutLinkLabel", label: "متن پیوند ستون درباره" },
  { kind: "link", key: "footerAboutLinkHref", label: "پیوند ستون درباره" },
  { kind: "text", key: "footerOccasionsTitle", label: "عنوان ستون مناسبت‌ها" },
  { kind: "repeater", key: "footerOccasions", label: "ستون مناسبت‌ها", fields: [...LINKS] },
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

type WithFields = { type: string; fields: unknown[] }
const has = (d: WithFields, key: string) => d.fields.some((f) => !!f && typeof f === "object" && "key" in f && (f as { key: string }).key === key)

/** Append the shared chrome settings to header/footer defs in place (idempotent). */
export function applyChromeExtras<D extends WithFields>(defs: D[]): D[] {
  for (const d of defs) {
    const extra = NAV_TYPES.has(d.type) ? NAV_EXTRA_FIELDS : FOOTER_TYPES.has(d.type) ? FOOTER_EXTRA_FIELDS : null
    if (!extra) continue
    d.fields = [...d.fields, ...extra.filter((f) => !has(d, f.key))]
  }
  return defs
}
