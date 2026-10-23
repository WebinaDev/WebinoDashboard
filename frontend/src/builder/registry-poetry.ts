/* Poetry / Muharram blog widgets (alikhabari.ir design). Renderers: render/poetry-widgets.tsx. */
import { uid } from "./ids"
import type { FieldDef, WidgetDef, WidgetNode } from "./types"

function node(type: string, props: Record<string, unknown>): WidgetNode {
  return { id: uid("w"), type, props }
}

const tone: FieldDef = { kind: "select", key: "tone", label: "زمینه", options: [{ value: "light", label: "کرم روشن" }, { value: "dark", label: "زرشکی تیره" }] }
const frame: FieldDef = { kind: "select", key: "frame", label: "قاب تصویر", options: [{ value: "arch", label: "محرابی (طاق)" }, { value: "rounded", label: "گرد" }, { value: "square", label: "ساده" }] }
const pattern: FieldDef = { kind: "switch", key: "pattern", label: "پس‌زمینه نقش اسلیمی" }
const SOCIALS: FieldDef = { kind: "repeater", key: "socials", label: "شبکه‌های اجتماعی", fields: [
  { key: "network", label: "شبکه", kind: "select", options: [{ value: "eitaa", label: "ایتا" }, { value: "telegram", label: "تلگرام" }, { value: "instagram", label: "اینستاگرام" }, { value: "bale", label: "بله" }, { value: "youtube", label: "یوتیوب" }, { value: "aparat", label: "آپارات" }] },
  { key: "href", label: "نشانی", kind: "url" },
] }
const PHOTO_MODE: FieldDef = { kind: "select", key: "photoMode", label: "حالت تصویر", options: [{ value: "photo", label: "عکس" }, { value: "logo", label: "لوگو (بدون عکس)" }, { value: "arabesque", label: "نقش اسلیمی (بدون عکس)" }] }
const LOGO: FieldDef = { kind: "media", key: "logo", label: "لوگو برای حالت بدون عکس (خالی = لوگوی سایت)", accept: "image" }
const ICONS = [{ value: "flame", label: "شعله" }, { value: "moon", label: "ماه" }, { value: "star", label: "ستاره" }, { value: "book", label: "کتاب" }, { value: "music", label: "صوت" }, { value: "video", label: "ویدیو" }]

export const POETRY_WIDGET_TYPES = [
  "poetry-hero", "poem-list", "book-banner", "occasion-cards", "media-cards", "shop-showcase", "poet-about", "quote-block", "poetry-footer",
] as const

export const POETRY_WIDGETS: WidgetDef[] = [
  {
    type: "poetry-hero", label: "هیرو شعر (تصویر کناری + بیت عمودی)", category: "content",
    fields: [
      { kind: "text", key: "eyebrow", label: "برچسب بالا" },
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "text", label: "متن" },
      { kind: "text", key: "primaryLabel", label: "دکمه اصلی" }, { kind: "link", key: "primaryHref", label: "پیوند دکمه اصلی" },
      { kind: "text", key: "secondaryLabel", label: "دکمه دوم" }, { kind: "link", key: "secondaryHref", label: "پیوند دکمه دوم" },
      { kind: "media", key: "image", label: "تصویر", accept: "image" }, { kind: "text", key: "imageAlt", label: "متن جایگزین تصویر" }, PHOTO_MODE, LOGO,
      { kind: "textarea", key: "couplet", label: "بیت عمودی (هر مصراع یک خط)" },
      tone, frame, pattern,
    ],
    create: () => node("poetry-hero", { eyebrow: "محرم ۱۴۰۵", title: "اشعار آیینی", text: "", primaryLabel: "مشاهده اشعار", primaryHref: "/poems", secondaryLabel: "صوت و تصویر", secondaryHref: "/media", image: "", imageAlt: "", couplet: "", photoMode: "photo", logo: "", tone: "light", frame: "arch", pattern: true }),
  },
  {
    type: "poem-list", label: "فهرست آخرین اشعار (با پخش صوت)", category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان بخش" },
      { kind: "number", key: "count", label: "تعداد اشعار (خودکار)", min: 1, max: 24 },
      { kind: "select", key: "sort", label: "ترتیب (خودکار)", options: [{ value: "", label: "تازه‌ترین" }, { value: "popular", label: "پربازدیدترین" }] },
      { kind: "link", key: "detailHref", label: "صفحه شعر" },
      { kind: "repeater", key: "items", label: "اشعار دستی (خالی = خودکار از ماژول شعر)", fields: [
        { key: "title", label: "عنوان", kind: "text" }, { key: "tag", label: "مناسبت", kind: "text" },
        { key: "audio", label: "فایل صوتی", kind: "media" }, { key: "duration", label: "مدت (۰۴:۳۲)", kind: "text" }, { key: "href", label: "پیوند", kind: "url" },
      ] },
      { kind: "text", key: "readLabel", label: "منو: خواندن" }, { kind: "text", key: "downloadLabel", label: "منو: دانلود" },
      { kind: "text", key: "moreLabel", label: "متن «همه اشعار»" }, { kind: "link", key: "moreHref", label: "پیوند همه اشعار" },
      tone, pattern,
    ],
    create: () => node("poem-list", { title: "آخرین اشعار", count: 6, sort: "", detailHref: "/poem", items: "", readLabel: "خواندن شعر", downloadLabel: "دانلود صوت", moreLabel: "همه اشعار", moreHref: "/poems", tone: "light" }),
  },
  {
    type: "book-banner", label: "بنر کتاب + «خبرم کن»", category: "content",
    fields: [
      { kind: "media", key: "image", label: "جلد کتاب", accept: "image" }, PHOTO_MODE, LOGO,
      { kind: "text", key: "eyebrow", label: "برچسب" }, { kind: "text", key: "title", label: "عنوان" }, { kind: "textarea", key: "text", label: "متن" },
      { kind: "text", key: "placeholder", label: "متن راهنمای ورودی" }, { kind: "text", key: "buttonLabel", label: "متن دکمه" }, { kind: "text", key: "success", label: "پیام موفقیت" },
      tone, frame, pattern,
    ],
    create: () => node("book-banner", { title: "کتاب تازه به‌زودی", text: "", eyebrow: "به‌زودی", buttonLabel: "خبرم کن", photoMode: "photo", logo: "", tone: "dark", frame: "rounded", pattern: true }),
  },
  {
    type: "occasion-cards", label: "کارت‌های مناسبت (اسکرول افقی)", category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان بخش" },
      { kind: "repeater", key: "items", label: "مناسبت‌ها", fields: [
        { key: "title", label: "عنوان", kind: "text" }, { key: "image", label: "تصویر زمینه", kind: "media" },
        { key: "icon", label: "آیکن", kind: "select", options: ICONS }, { key: "href", label: "پیوند", kind: "url" },
      ] },
      tone, frame, pattern,
    ],
    create: () => node("occasion-cards", { title: "مناسبت‌ها", items: "محرم||flame|/poems?occasion=muharram\nفاطمیه||moon|/poems?occasion=fatemiyeh\nماه رمضان||star|/poems?occasion=ramadan\nمدح و مناجات||book|/poems?occasion=madh", tone: "light", frame: "arch" }),
  },
  {
    type: "media-cards", label: "کارت‌های صوت و تصویر", category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان بخش" },
      { kind: "repeater", key: "items", label: "رسانه‌ها", fields: [
        { key: "title", label: "عنوان", kind: "text" }, { key: "cover", label: "کاور", kind: "media" }, { key: "reciter", label: "مداح/قاری", kind: "text" },
        { key: "duration", label: "مدت", kind: "text" }, { key: "src", label: "فایل", kind: "media" },
        { key: "kind", label: "نوع", kind: "select", options: [{ value: "audio", label: "صوت" }, { value: "video", label: "ویدیو" }] },
      ] },
      tone, frame, pattern,
    ],
    create: () => node("media-cards", { title: "صوت و تصویر", items: "", tone: "light", frame: "rounded" }),
  },
  {
    type: "shop-showcase", label: "ویترین فروشگاه (قیمت تومان)", category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان بخش" },
      { kind: "repeater", key: "items", label: "محصولات", fields: [
        { key: "title", label: "نام", kind: "text" }, { key: "image", label: "تصویر", kind: "media" },
        { key: "price", label: "قیمت (تومان)", kind: "text" }, { key: "href", label: "پیوند", kind: "url" },
      ] },
      { kind: "text", key: "buttonLabel", label: "متن دکمه" }, { kind: "text", key: "priceLabel", label: "متن جایگزین قیمت (درگاه خاموش)" },
      tone, frame, pattern,
    ],
    create: () => node("shop-showcase", { title: "فروشگاه قاب‌های مذهبی", items: "", buttonLabel: "خرید", priceLabel: "قیمت (از مشتری)", tone: "light", frame: "arch" }),
  },
  {
    type: "poet-about", label: "درباره شاعر", category: "content",
    fields: [
      PHOTO_MODE, { kind: "media", key: "image", label: "تصویر (فقط در حالت عکس)", accept: "image" }, LOGO,
      { kind: "text", key: "eyebrow", label: "برچسب" }, { kind: "text", key: "title", label: "عنوان" }, { kind: "textarea", key: "text", label: "متن" },
      SOCIALS, { kind: "text", key: "linkLabel", label: "متن «بیشتر بخوانید»" }, { kind: "link", key: "linkHref", label: "پیوند" },
      tone, frame, pattern,
    ],
    create: () => node("poet-about", { eyebrow: "درباره شاعر", title: "", text: "", linkLabel: "بیشتر بخوانید", linkHref: "/about", photoMode: "logo", logo: "", tone: "light", frame: "arch" }),
  },
  {
    type: "quote-block", label: "نقل‌قول (گیومه بزرگ)", category: "content",
    fields: [{ kind: "textarea", key: "text", label: "متن (هر مصراع یک خط)" }, { kind: "text", key: "author", label: "گوینده" }, tone, pattern],
    create: () => node("quote-block", { text: "", author: "", tone: "dark", pattern: true }),
  },
  {
    type: "poetry-footer", label: "پاورقی زرشکی", category: "chrome",
    fields: [
      { kind: "media", key: "logo", label: "لوگو", accept: "image" }, { kind: "text", key: "brand", label: "نام" }, { kind: "textarea", key: "text", label: "توضیح" },
      { kind: "repeater", key: "links", label: "پیوندها", fields: [{ key: "label", label: "برچسب", kind: "text" }, { key: "href", label: "نشانی", kind: "url" }] },
      { kind: "repeater", key: "socials", label: "شبکه‌های اجتماعی", fields: [
        { key: "network", label: "شبکه", kind: "select", options: [{ value: "instagram", label: "اینستاگرام" }, { value: "telegram", label: "تلگرام" }, { value: "bale", label: "بله" }, { value: "eitaa", label: "ایتا" }, { value: "youtube", label: "یوتیوب" }, { value: "aparat", label: "آپارات" }] },
        { key: "href", label: "نشانی", kind: "url" },
      ] },
      { kind: "text", key: "copyright", label: "کپی‌رایت" }, pattern,
    ],
    create: () => node("poetry-footer", { brand: "", text: "", links: "خانه|/\nاشعار|/poems\nفروشگاه|/shop\nتماس|/contact", socials: "", copyright: "", pattern: true }),
  },
]
