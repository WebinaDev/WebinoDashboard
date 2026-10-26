/* Resume module widgets (resume.*). Data: GET /v1/public/resume/full. Renderers: render/resume-widgets.tsx.
 * Names and props are a shared contract with the ERP page builder — see docs/resume/WIDGETS.md. */
import { uid } from "./ids"
import type { FieldDef, WidgetDef } from "./types"

const opts = (values: [string, string][]) => values.map(([value, label]) => ({ value, label }))

/** Props every resume.* widget accepts. */
export const RESUME_COMMON_FIELDS: FieldDef[] = [
  { kind: "text", key: "title", label: "عنوان (خالی = عنوان پیش‌فرض بخش)" },
  { kind: "text", key: "subtitle", label: "زیرعنوان" },
  { kind: "number", key: "limit", label: "حداکثر تعداد (۰ = همه)", min: 0, max: 100 },
  { kind: "select", key: "order_by", label: "مرتب‌سازی", options: opts([["order", "ترتیب داشبورد"], ["date", "تاریخ (جدیدترین)"]]) },
  { kind: "switch", key: "show_placeholder", label: "نمایش موارد «نمونه»" },
  { kind: "select", key: "lang", label: "زبان", options: opts([["auto", "خودکار (زبان صفحه)"], ["fa", "فارسی"], ["en", "English"]]) },
  { kind: "text", key: "anchor_id", label: "شناسه لنگر (#)" },
  { kind: "switch", key: "full_width", label: "تمام‌عرض" },
]
export const RESUME_COMMON_DEFAULTS = { title: "", subtitle: "", limit: 0, order_by: "order", show_placeholder: false, lang: "auto", anchor_id: "", full_width: true }

type Spec = { type: string; label: string; variants: [string, string][]; fields?: FieldDef[]; defaults?: Record<string, unknown> }

const SKILL_CATS = opts([["", "همه"], ["backend", "بک‌اند"], ["frontend", "فرانت‌اند"], ["cms", "CMS"], ["devops", "دواپس"], ["tools", "ابزار"], ["design", "طراحی"], ["soft", "نرم"]])

export const RESUME_WIDGET_SPECS: Spec[] = [
  { type: "resume.hero", label: "رزومه: سربرگ (هیرو)", variants: [["split", "دوستونه"], ["centered", "وسط‌چین"], ["terminal", "ترمینال"], ["editorial", "مجله‌ای"]],
    fields: [{ kind: "switch", key: "show_avatar", label: "عکس" }, { kind: "switch", key: "show_stats", label: "آمار" }, { kind: "switch", key: "show_cta", label: "دکمه‌ها" },
      { kind: "text", key: "cta_label", label: "متن دکمه اصلی" }, { kind: "link", key: "cta_target", label: "مقصد دکمه اصلی" }],
    defaults: { show_avatar: true, show_stats: true, show_cta: true, cta_label: "", cta_target: "#contact" } },
  { type: "resume.about", label: "رزومه: درباره", variants: [["plain", "ساده"], ["columns", "دوستونه"], ["card", "کارت"]], fields: [{ kind: "switch", key: "show_highlights", label: "نکات برجسته" }], defaults: { show_highlights: true } },
  { type: "resume.contacts", label: "رزومه: راه‌های ارتباطی", variants: [["icons", "آیکون"], ["list", "فهرست"], ["cards", "کارت"]], fields: [{ kind: "text", key: "types_filter", label: "فقط این نوع‌ها (با کاما: email,github)" }], defaults: { types_filter: "" } },
  { type: "resume.experience", label: "رزومه: سوابق کاری", variants: [["timeline", "خط زمانی"], ["cards", "کارت"], ["compact", "فشرده"]],
    fields: [{ kind: "switch", key: "show_skills", label: "مهارت‌ها" }, { kind: "switch", key: "show_duration", label: "مدت" }, { kind: "switch", key: "collapse_description", label: "توضیحات جمع‌شده" }],
    defaults: { show_skills: true, show_duration: true, collapse_description: false } },
  { type: "resume.education", label: "رزومه: تحصیلات", variants: [["timeline", "خط زمانی"], ["cards", "کارت"]] },
  { type: "resume.honors", label: "رزومه: افتخارات", variants: [["grid", "شبکه"], ["list", "فهرست"]] },
  { type: "resume.publications", label: "رزومه: نشرها", variants: [["shelf", "قفسه"], ["list", "فهرست"]],
    fields: [{ kind: "text", key: "kinds_filter", label: "فقط این نوع‌ها (article,book,…)" }, { kind: "switch", key: "show_cover", label: "جلد" }], defaults: { kinds_filter: "", show_cover: true } },
  { type: "resume.certifications", label: "رزومه: گواهینامه‌ها", variants: [["badges", "نشان"], ["list", "فهرست"]] },
  { type: "resume.skills", label: "رزومه: مهارت‌ها", variants: [["chips", "تراشه"], ["bars", "نوار سطح"], ["grouped", "دسته‌بندی‌شده"]],
    fields: [{ kind: "switch", key: "group_by_category", label: "گروه‌بندی با دسته" }, { kind: "switch", key: "show_level", label: "نمایش سطح" }, { kind: "select", key: "category", label: "فقط دسته", options: SKILL_CATS }],
    defaults: { group_by_category: false, show_level: true, category: "" } },
  { type: "resume.languages", label: "رزومه: زبان‌ها", variants: [["chips", "تراشه"], ["meter", "سنج"]] },
  { type: "resume.portfolio", label: "رزومه: نمونه‌کارها", variants: [["grid", "شبکه"], ["masonry", "آجری"], ["slider", "اسلایدر"]],
    fields: [{ kind: "switch", key: "featured_only", label: "فقط ویژه‌ها" }, { kind: "number", key: "columns", label: "ستون‌ها", min: 1, max: 4 }], defaults: { featured_only: false, columns: 3 } },
  { type: "resume.stats", label: "رزومه: آمار", variants: [["counter", "شمارنده"], ["inline", "خطی"]] },
  { type: "resume.testimonials", label: "رزومه: توصیه‌نامه‌ها", variants: [["slider", "اسلایدر"], ["grid", "شبکه"]] },
  { type: "resume.volunteering", label: "رزومه: داوطلبانه", variants: [["list", "فهرست"], ["cards", "کارت"]] },
  { type: "resume.courses", label: "رزومه: دوره‌ها", variants: [["list", "فهرست"], ["grid", "شبکه"]] },
  { type: "resume.contact_cta", label: "رزومه: دعوت به تماس", variants: [["banner", "بنر"], ["glass", "شیشه‌ای"], ["minimal", "مینیمال"]],
    fields: [{ kind: "text", key: "heading", label: "تیتر" }, { kind: "textarea", key: "body", label: "متن" },
      { kind: "select", key: "primary_contact_type", label: "راه ارتباطی اصلی", options: opts([["", "اصلی‌ترین"], ["email", "ایمیل"], ["phone", "تلفن"], ["telegram", "تلگرام"], ["whatsapp", "واتساپ"], ["linkedin", "لینکدین"]]) },
      { kind: "switch", key: "show_form", label: "فرم تماس (فاز بعد)" }],
    defaults: { heading: "", body: "", primary_contact_type: "", show_form: false } },
  { type: "resume.lang_switch", label: "رزومه: تغییر زبان (فا / EN)", variants: [["pill", "کپسول"], ["text", "متنی"]],
    fields: [{ kind: "link", key: "fa_href", label: "نشانی نسخه فارسی" }, { kind: "link", key: "en_href", label: "نشانی نسخه انگلیسی" }], defaults: { fa_href: "/", en_href: "/en" } },
  { type: "resume.page_story", label: "رزومه: صفحه کامل «Story» (تم)", variants: [["default", "پیش‌فرض"]],
    fields: [{ kind: "link", key: "fa_href", label: "نشانی نسخه فارسی" }, { kind: "link", key: "en_href", label: "نشانی نسخه انگلیسی" }], defaults: { fa_href: "/", en_href: "/en" } },
  { type: "resume.page_os", label: "رزومه: صفحه کامل «Webina OS» (تم)", variants: [["default", "پیش‌فرض"]],
    fields: [{ kind: "link", key: "fa_href", label: "نشانی نسخه فارسی" }, { kind: "link", key: "en_href", label: "نشانی نسخه انگلیسی" }], defaults: { fa_href: "/", en_href: "/en" } },
  { type: "resume.page_vitality", label: "رزومه: صفحه کامل «Vitality» (تم)", variants: [["default", "پیش‌فرض"]],
    fields: [{ kind: "link", key: "fa_href", label: "نشانی نسخه فارسی" }, { kind: "link", key: "en_href", label: "نشانی نسخه انگلیسی" }], defaults: { fa_href: "/", en_href: "/en" } },
  { type: "resume.page_journal", label: "رزومه: صفحه کامل «Clinical Journal» (تم)", variants: [["default", "پیش‌فرض"]],
    fields: [{ kind: "link", key: "fa_href", label: "نشانی نسخه فارسی" }, { kind: "link", key: "en_href", label: "نشانی نسخه انگلیسی" }], defaults: { fa_href: "/", en_href: "/en" } },
  { type: "resume.download_pdf", label: "رزومه: دانلود PDF (فاز بعد)", variants: [["button", "دکمه"]],
    fields: [{ kind: "text", key: "template", label: "قالب" }, { kind: "text", key: "label", label: "متن دکمه" }], defaults: { template: "", label: "" } },
]

export const RESUME_WIDGET_TYPES = RESUME_WIDGET_SPECS.map((s) => s.type)

export const RESUME_WIDGETS: WidgetDef[] = RESUME_WIDGET_SPECS.map((s) => ({
  type: s.type,
  label: s.label,
  category: "content",
  fields: [{ kind: "select", key: "variant", label: "نوع نمایش", options: opts(s.variants) }, ...(s.fields ?? []), ...RESUME_COMMON_FIELDS],
  create: () => ({ id: uid("w"), type: s.type, props: { ...RESUME_COMMON_DEFAULTS, variant: s.variants[0][0], ...(s.defaults ?? {}) } }),
}))
