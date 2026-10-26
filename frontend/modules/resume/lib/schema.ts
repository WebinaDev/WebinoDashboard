import schemaJson from "./schema.json"
import themesJson from "./themes.json"

export type FieldType = "text" | "textarea" | "richtext" | "url" | "select" | "int" | "bool" | "media" | "media_list" | "skills" | "list" | "date" | "range" | "ref" | "color" | "json"
export type FieldDef = { key: string; type: FieldType; i18n: boolean; required?: boolean; max?: number; min?: number; options?: string[]; private?: boolean; ref?: string }
export type SectionDef = { slug: string; table: string; model: string; single?: boolean; label_fa: string; label_en: string; icon: string; title?: string; fields: FieldDef[] }
export type ThemeDef = {
  key: string; name_fa: string; name_en: string; audience: string; description_fa: string; description_en: string
  full_page?: boolean
  tokens: { light: Record<string, string>; dark: Record<string, string>; font_fa: string; font_en: string; font_mono: string; radius: string; shadow: string; motion: string; default_mode: "light" | "dark" }
  layout: { type: string; props: Record<string, unknown> }[]
}

export const RESUME_SCHEMA = schemaJson as unknown as { version: number; sections: SectionDef[]; visibility: string[] }
export const RESUME_SECTIONS = RESUME_SCHEMA.sections
export const RESUME_THEMES = themesJson as unknown as Record<string, ThemeDef>
export const sectionBySlug = (slug: string) => RESUME_SECTIONS.find((s) => s.slug === slug)

export type ResumeRow = Record<string, unknown> & { id: number; order?: number; visibility?: string; is_placeholder?: boolean }

/** Persian labels for field keys and option values (dashboard). English labels used on the en site. */
export const FIELD_LABELS: Record<string, string> = {
  full_name: "نام کامل", headline: "عنوان حرفه‌ای", location: "محل", avatar_media_id: "عکس پروفایل", cover_media_id: "تصویر کاور",
  career_start_year: "سال شروع فعالیت (میلادی)", open_to_work: "آماده همکاری", birth_date: "تاریخ تولد (خصوصی)", nationality: "ملیت",
  body: "متن", highlights: "نکات برجسته", type: "نوع", value: "مقدار", label: "برچسب", icon: "آیکون", is_primary: "اصلی",
  title: "عنوان", company: "شرکت / سازمان", company_logo_media_id: "لوگوی شرکت", company_url: "وب‌سایت شرکت", employment_type: "نوع همکاری",
  location_type: "نوع محل کار", period: "بازه زمانی", description: "توضیحات", achievements: "دستاوردها", skill_ids: "مهارت‌های مرتبط", media_ids: "رسانه‌ها",
  school: "دانشگاه / مؤسسه", degree: "مقطع", field: "رشته", grade: "معدل", activities: "فعالیت‌ها", issuer: "اعطاکننده", date: "تاریخ",
  associated_experience_id: "مرتبط با سابقه کاری", kind: "نوع", publisher: "ناشر / نشریه", url: "لینک", isbn: "ISBN", doi: "DOI", co_authors: "همکاران نویسنده",
  name: "نام", issue_date: "تاریخ صدور", expire_date: "تاریخ انقضا", credential_id: "شناسه مدرک", credential_url: "لینک مدرک",
  category: "دسته", level: "سطح (۱ تا ۵)", years: "سال تجربه", endorsements_count: "تأییدها", proficiency: "سطح تسلط",
  role: "نقش", summary: "خلاصه", repo_url: "مخزن کد", gallery_media_ids: "گالری", tags: "برچسب‌ها", featured: "ویژه",
  organization: "سازمان", cause: "حوزه", institution: "مؤسسه", author: "نویسنده", author_title: "سمت نویسنده", relation: "نسبت",
  theme_key: "تم", accent: "رنگ اکسنت (روشن)", accent_dark: "رنگ اکسنت (تیره)", mode: "حالت رنگ", date_calendar: "تقویم نمایش", languages: "زبان‌های سایت",
  default_lang: "زبان پیش‌فرض", section_order: "ترتیب بخش‌ها", seo: "سئو", private_token: "کلید لینک خصوصی", pdf_template: "قالب PDF (فاز بعد)",
}

export const OPTION_LABELS: Record<string, { fa: string; en: string }> = {
  full_time: { fa: "تمام‌وقت", en: "Full-time" }, part_time: { fa: "پاره‌وقت", en: "Part-time" }, freelance: { fa: "فریلنس", en: "Freelance" },
  self_employed: { fa: "خوداشتغال", en: "Self-employed" }, internship: { fa: "کارآموزی", en: "Internship" }, contract: { fa: "قراردادی", en: "Contract" },
  onsite: { fa: "حضوری", en: "On-site" }, remote: { fa: "دورکاری", en: "Remote" }, hybrid: { fa: "ترکیبی", en: "Hybrid" },
  article: { fa: "مقاله", en: "Article" }, book: { fa: "کتاب", en: "Book" }, paper: { fa: "مقاله علمی", en: "Paper" }, chapter: { fa: "فصل کتاب", en: "Chapter" },
  blog: { fa: "بلاگ", en: "Blog post" }, talk: { fa: "سخنرانی", en: "Talk" },
  native: { fa: "زبان مادری", en: "Native or bilingual" }, full: { fa: "تسلط کامل حرفه‌ای", en: "Full professional" }, professional: { fa: "سطح کاری حرفه‌ای", en: "Professional working" },
  limited: { fa: "سطح کاری محدود", en: "Limited working" }, elementary: { fa: "مقدماتی", en: "Elementary" },
  backend: { fa: "بک‌اند", en: "Backend" }, frontend: { fa: "فرانت‌اند", en: "Frontend" }, cms: { fa: "سیستم مدیریت محتوا", en: "CMS" }, devops: { fa: "دواپس", en: "DevOps" },
  tools: { fa: "ابزارها", en: "Tools" }, design: { fa: "طراحی", en: "Design" }, soft: { fa: "مهارت نرم", en: "Soft skills" }, health: { fa: "سلامت و تغذیه", en: "Health & nutrition" }, research: { fa: "پژوهش", en: "Research" }, writing: { fa: "نویسندگی", en: "Writing" }, other: { fa: "سایر", en: "Other" },
  system: { fa: "هماهنگ با سیستم", en: "System" }, light: { fa: "روشن", en: "Light" }, dark: { fa: "تیره", en: "Dark" },
  auto: { fa: "خودکار (فا جلالی، en میلادی)", en: "Auto" }, jalali: { fa: "جلالی", en: "Jalali" }, gregorian: { fa: "میلادی", en: "Gregorian" },
  fa: { fa: "فارسی", en: "Persian" }, en: { fa: "انگلیسی", en: "English" },
  public: { fa: "عمومی", en: "Public" }, hidden: { fa: "مخفی", en: "Hidden" }, private_link: { fa: "فقط با لینک خصوصی", en: "Private link" },
  phone: { fa: "تلفن", en: "Phone" }, email: { fa: "ایمیل", en: "Email" }, website: { fa: "وب‌سایت", en: "Website" }, linkedin: { fa: "لینکدین", en: "LinkedIn" },
  github: { fa: "گیت‌هاب", en: "GitHub" }, telegram: { fa: "تلگرام", en: "Telegram" }, whatsapp: { fa: "واتساپ", en: "WhatsApp" }, instagram: { fa: "اینستاگرام", en: "Instagram" },
  x: { fa: "ایکس", en: "X" }, youtube: { fa: "یوتیوب", en: "YouTube" }, dribbble: { fa: "دریبل", en: "Dribbble" }, behance: { fa: "بیهنس", en: "Behance" },
  gitlab: { fa: "گیت‌لب", en: "GitLab" }, stackoverflow: { fa: "استک‌اورفلو", en: "Stack Overflow" }, bale: { fa: "بله", en: "Bale" }, eitaa: { fa: "ایتا", en: "Eitaa" }, orcid: { fa: "ارکید", en: "ORCID" }, researchgate: { fa: "ریسرچ‌گیت", en: "ResearchGate" }, scholar: { fa: "گوگل اسکالر", en: "Google Scholar" },
  "story": { fa: "داستان (Story)", en: "Story" }, "webina-os": { fa: "وبینا OS", en: "Webina OS" }, "code-noir": { fa: "کد نوآر", en: "Code Noir" }, "atelier-editorial": { fa: "آتلیه ادیتوریال", en: "Atelier Editorial" }, "aurora-glass": { fa: "شفق شیشه‌ای", en: "Aurora Glass" }, "vitality": { fa: "سرزندگی (Vitality)", en: "Vitality" }, "clinical-journal": { fa: "ژورنال بالینی", en: "Clinical Journal" }, "tide": { fa: "موج و نور (Tide)", en: "Tide" },
}
export const optLabel = (v: string, lang: "fa" | "en" = "fa") => OPTION_LABELS[v]?.[lang] ?? v

/** Pick the language value with fallback to the other language. */
export function tr(row: Record<string, unknown> | null | undefined, key: string, lang: string): string {
  if (!row) return ""
  const primary = row[`${key}_${lang}`]
  const other = row[`${key}_${lang === "fa" ? "en" : "fa"}`]
  const plain = row[key]
  const v = (typeof primary === "string" && primary) || (typeof plain === "string" && plain) || (typeof other === "string" && other) || ""
  return v
}
export function trList(row: Record<string, unknown> | null | undefined, key: string, lang: string): string[] {
  if (!row) return []
  const a = row[`${key}_${lang}`] ?? row[key] ?? row[`${key}_${lang === "fa" ? "en" : "fa"}`]
  return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string" && !!x) : []
}
