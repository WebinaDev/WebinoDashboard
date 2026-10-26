/* Poetry / Muharram blog widgets (alikhabari.ir design). Renderers: render/poetry-widgets.tsx. */
import { uid } from "./ids"
import type { FieldDef, WidgetDef, WidgetNode } from "./types"

function node(type: string, props: Record<string, unknown>): WidgetNode {
  return { id: uid("w"), type, props }
}

const tone: FieldDef = { kind: "select", key: "tone", label: "زمینه", options: [{ value: "light", label: "کرم روشن" }, { value: "dark", label: "زرشکی تیره" }, { value: "transparent", label: "شفاف (زمینه بخش)" }, { value: "blush", label: "صورتی روشن" }, { value: "glass", label: "شیشه‌ای (سفید نیمه‌شفاف با محو پس‌زمینه)" }] }
/** Shared section background: image + colour/gradient overlay (e.g. dark crimson) with opacity 0–100. */
export const SECTION_BG_FIELDS: FieldDef[] = [
  { kind: "media", key: "bgImage", label: "تصویر پس‌زمینه بخش", accept: "image" },
  { kind: "color", key: "bgOverlay", label: "رنگ/گرادیان روکش (مثلاً زرشکی تیره)" },
  { kind: "slider", key: "bgOverlayOpacity", label: "شفافیت روکش", min: 0, max: 100, step: 5, unit: "%" },
]
const RATIO_OPTS = [{ value: "4/5", label: "عمودی ۴:۵" }, { value: "3/4", label: "عمودی ۳:۴" }, { value: "2/3", label: "عمودی ۲:۳" }, { value: "1/1", label: "مربع" }, { value: "16/10", label: "افقی" }]
const frame: FieldDef = { kind: "select", key: "frame", label: "قاب تصویر", options: [{ value: "arch", label: "محرابی (طاق)" }, { value: "rounded", label: "گرد" }, { value: "square", label: "ساده" }] }
const pattern: FieldDef = { kind: "switch", key: "pattern", label: "پس‌زمینه نقش اسلیمی" }
const SOCIALS: FieldDef = { kind: "repeater", key: "socials", label: "شبکه‌های اجتماعی", fields: [
  { key: "network", label: "شبکه", kind: "select", options: [{ value: "eitaa", label: "ایتا" }, { value: "telegram", label: "تلگرام" }, { value: "instagram", label: "اینستاگرام" }, { value: "bale", label: "بله" }, { value: "youtube", label: "یوتیوب" }, { value: "aparat", label: "آپارات" }] },
  { key: "href", label: "نشانی", kind: "url" },
] }
const PHOTO_MODE: FieldDef = { kind: "select", key: "photoMode", label: "حالت تصویر", options: [{ value: "photo", label: "عکس" }, { value: "logo", label: "لوگو (بدون عکس)" }, { value: "arabesque", label: "نقش اسلیمی (بدون عکس)" }] }
const LOGO: FieldDef = { kind: "media", key: "logo", label: "لوگو برای حالت بدون عکس (خالی = لوگوی سایت)", accept: "image" }
const ICONS = [{ value: "flame", label: "شعله" }, { value: "moon", label: "ماه" }, { value: "star", label: "ستاره" }, { value: "book", label: "کتاب" }, { value: "music", label: "صوت" }, { value: "video", label: "ویدیو" }]

const CAROUSEL_FIELDS: FieldDef[] = [
  { kind: "select", key: "layout", label: "چیدمان", options: [{ value: "carousel", label: "اسلایدر (کاروسل)" }, { value: "grid", label: "شبکه (چند ردیف)" }, { value: "grid3", label: "ساده سه‌ستونی" }] },
  { kind: "number", key: "slidesDesktop", label: "تعداد اسلاید در دسکتاپ", min: 1, max: 8 },
  { kind: "slider", key: "slidesMobile", label: "تعداد اسلاید در موبایل", min: 1, max: 3, step: 0.1 },
  { kind: "switch", key: "autoplay", label: "پخش خودکار" },
  { kind: "number", key: "autoplayInterval", label: "فاصله پخش خودکار (ثانیه)", min: 2, max: 30 },
]

export const POETRY_WIDGET_TYPES = [
  "poetry-hero", "poem-list", "book-banner", "occasion-cards", "media-cards", "shop-showcase", "poet-about", "quote-block", "poetry-footer",
] as const

const DECOR_FRAMES = [{ value: "rose-arch", label: "محراب گل‌سرخی" }, { value: "arch", label: "محرابی ساده" }, { value: "none", label: "بدون قاب" }]

export const POETRY_WIDGETS: WidgetDef[] = [
  {
    type: "poetry-hero", label: "هیرو شعر (تصویر کناری + بیت عمودی)", category: "content",
    fields: [
      { kind: "text", key: "eyebrow", label: "برچسب بالا" },
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "text", label: "متن" },
      { kind: "text", key: "primaryLabel", label: "دکمه اصلی" }, { kind: "link", key: "primaryHref", label: "پیوند دکمه اصلی" },
      { kind: "text", key: "secondaryLabel", label: "دکمه دوم" }, { kind: "link", key: "secondaryHref", label: "پیوند دکمه دوم" },
      { kind: "media", key: "image", label: "تصویر", accept: "image" }, { kind: "text", key: "imageAlt", label: "متن جایگزین تصویر" }, { ...PHOTO_MODE, options: [...(PHOTO_MODE as { options: { value: string; label: string }[] }).options, { value: "none", label: "بدون تصویر و بیت" }] } as FieldDef, LOGO,
      { kind: "textarea", key: "couplet", label: "بیت عمودی (هر مصراع یک خط)" },
      { kind: "select", key: "heroLayout", label: "چیدمان هیرو", options: [{ value: "split", label: "تصویر کنار متن (پیش‌فرض)" }, { value: "overlay", label: "تصویر پشت متن + تزئین دو طرف" }, { value: "fullwidth", label: "تمام‌عرض: عکس کامل، متن سمت راست، بدون قاب" }] },
      { kind: "repeater", key: "slides", label: "اسلایدها (خالی = همان تصویر تکی)", fields: [
        { key: "image", label: "تصویر", kind: "media" }, { key: "title", label: "عنوان", kind: "text" }, { key: "text", label: "متن", kind: "text" },
        { key: "primaryLabel", label: "دکمه اصلی", kind: "text" }, { key: "primaryHref", label: "پیوند دکمه اصلی", kind: "url" },
        { key: "secondaryLabel", label: "دکمه دوم", kind: "text" }, { key: "secondaryHref", label: "پیوند دکمه دوم", kind: "url" },
      ] },
      { kind: "switch", key: "sliderAutoplay", label: "پخش خودکار اسلایدها" },
      { kind: "number", key: "sliderInterval", label: "فاصله پخش خودکار اسلایدها (ثانیه)", min: 2, max: 30 },
      { kind: "switch", key: "sliderDots", label: "نقطه‌های اسلایدر" },
      { kind: "switch", key: "sliderArrows", label: "فلش‌های اسلایدر" },
      { kind: "number", key: "sliderHeight", label: "ارتفاع اسلایدر در دسکتاپ (px)", min: 280, max: 900 },
      { kind: "number", key: "sliderHeightMobile", label: "ارتفاع اسلایدر در موبایل (px، ۰ یعنی خودکار)", min: 0, max: 900 },
      { kind: "number", key: "heroHeightMobile", label: "ارتفاع هیرو در موبایل (px، ۰ یعنی خودکار)", min: 0, max: 900 },
      { kind: "media", key: "decorLeft", label: "تصویر تزئینی چپ (مثلاً محراب گل‌دار)", accept: "image" },
      { kind: "select", key: "decorLeftFrame", label: "قاب تصویر چپ", options: DECOR_FRAMES },
      { kind: "media", key: "decorRight", label: "تصویر تزئینی راست (مثلاً حرم)", accept: "image" },
      { kind: "select", key: "decorRightFrame", label: "قاب تصویر راست", options: DECOR_FRAMES },
      { kind: "number", key: "heroVeil", label: "روشنی پرده روی تصویر پس‌زمینه (۰ تا ۱۰۰)", min: 0, max: 100 },
      tone, frame, pattern, ...SECTION_BG_FIELDS,
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
        { key: "audio", label: "فایل صوتی", kind: "media" }, { key: "duration", label: "مدت (۰۴:۳۲)", kind: "text" }, { key: "href", label: "پیوند", kind: "url" }, { key: "image", label: "تصویر (اختیاری)", kind: "media" },
      ] },
      { kind: "text", key: "readLabel", label: "منو: خواندن" }, { kind: "text", key: "downloadLabel", label: "منو: دانلود" },
      { kind: "text", key: "moreLabel", label: "متن «همه اشعار»" }, { kind: "link", key: "moreHref", label: "پیوند همه اشعار" },
      tone, pattern, ...SECTION_BG_FIELDS,
    ],
    create: () => node("poem-list", { title: "آخرین اشعار", count: 6, sort: "", detailHref: "/poem?poem={slug}", items: "", readLabel: "خواندن شعر", downloadLabel: "دانلود صوت", moreLabel: "همه اشعار", moreHref: "/poems", tone: "light" }),
  },
  {
    type: "book-banner", label: "بنر کتاب + «خبرم کن»", category: "content",
    fields: [
      { kind: "media", key: "image", label: "جلد کتاب", accept: "image" }, PHOTO_MODE, LOGO,
      { kind: "text", key: "eyebrow", label: "برچسب" }, { kind: "text", key: "title", label: "عنوان" }, { kind: "textarea", key: "text", label: "متن" },
      { kind: "switch", key: "showNotifyInput", label: "نمایش فیلد شماره یا ایمیل" }, { kind: "text", key: "placeholder", label: "متن راهنمای ورودی" }, { kind: "text", key: "buttonLabel", label: "متن دکمه" }, { kind: "text", key: "success", label: "پیام موفقیت" },
      tone, frame, pattern, ...SECTION_BG_FIELDS,
    ],
    create: () => node("book-banner", { title: "کتاب تازه به‌زودی", text: "", eyebrow: "به‌زودی", buttonLabel: "خبرم کن", photoMode: "photo", logo: "", tone: "dark", frame: "rounded", pattern: true }),
  },
  {
    type: "occasion-cards", label: "کارت‌های مناسبت (اسلایدر)", category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان بخش" },
      { kind: "repeater", key: "items", label: "مناسبت‌ها", fields: [
        { key: "title", label: "عنوان", kind: "text" }, { key: "image", label: "تصویر زمینه", kind: "media" },
        { key: "icon", label: "آیکن", kind: "select", options: ICONS }, { key: "href", label: "پیوند", kind: "url" }, { key: "subtitle", label: "زیرعنوان", kind: "text" },
      ] },
      ...CAROUSEL_FIELDS,
      { kind: "select", key: "cardRatio", label: "نسبت کارت", options: RATIO_OPTS },
      { kind: "number", key: "cardHeight", label: "ارتفاع کارت (px، ۰ یعنی از روی نسبت)", min: 0, max: 600 },
      tone, frame, pattern, ...SECTION_BG_FIELDS,
    ],
    create: () => node("occasion-cards", { title: "مناسبت‌ها", items: "محرم||flame|/poems?occasion=muharram\nفاطمیه||moon|/poems?occasion=fatemiyeh\nماه رمضان||star|/poems?occasion=ramadan\nمدح و مناجات||book|/poems?occasion=madh", layout: "carousel", slidesDesktop: 4, slidesMobile: 1.3, autoplay: false, autoplayInterval: 5, cardRatio: "4/5", tone: "light", frame: "rounded" }),
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
      { kind: "select", key: "mediaLayout", label: "چیدمان", options: [{ value: "auto", label: "خودکار (پیش‌فرض)" }, { value: "grid3", label: "ساده سه‌ستونی" }] },
      tone, frame, pattern, ...SECTION_BG_FIELDS,
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
      { kind: "select", key: "source", label: "منبع محصولات", options: [{ value: "catalog", label: "محصولات واقعی فروشگاه" }, { value: "manual", label: "فقط فهرست دستی" }] },
      { kind: "number", key: "count", label: "تعداد محصول", min: 1, max: 24 },
      { kind: "text", key: "category", label: "دسته (نامک، خالی = همه)" },
      { kind: "select", key: "imageRatio", label: "نسبت تصویر محصول", options: RATIO_OPTS },
      { kind: "text", key: "moreLabel", label: "متن «مشاهده همه»" }, { kind: "link", key: "moreHref", label: "پیوند مشاهده همه" },
      { kind: "text", key: "buttonLabel", label: "متن دکمه" }, { kind: "text", key: "priceLabel", label: "متن جایگزین قیمت (درگاه خاموش)" },
      ...CAROUSEL_FIELDS,
      { kind: "number", key: "slidesNarrow", label: "تعداد کارت وقتی ستون باریک است (نصف‌عرض؛ ۰ = خاموش)", min: 0, max: 4 },
      { kind: "switch", key: "compactCards", label: "کارت فشرده (عنوان دوخطی، دکمه کوچک)" },
      { kind: "select", key: "imageFit", label: "نمایش تصویر محصول", options: [{ value: "cover", label: "پرکردن قاب (پیش‌فرض)" }, { value: "contain", label: "کامل (بدون برش)" }] },
      tone, frame, pattern, ...SECTION_BG_FIELDS,
    ],
    create: () => node("shop-showcase", { title: "فروشگاه قاب‌های مذهبی", items: "", source: "catalog", count: 6, category: "", imageRatio: "4/5", layout: "carousel", slidesDesktop: 4, slidesMobile: 1.3, autoplay: false, autoplayInterval: 5, moreLabel: "مشاهده همه", moreHref: "/shop", buttonLabel: "مشاهده محصول", priceLabel: "قیمت (از مشتری)", tone: "light", frame: "arch" }),
  },
  {
    type: "poet-about", label: "درباره شاعر", category: "content",
    fields: [
      PHOTO_MODE, { kind: "media", key: "image", label: "تصویر (فقط در حالت عکس)", accept: "image" }, LOGO,
      { kind: "text", key: "eyebrow", label: "برچسب" }, { kind: "text", key: "title", label: "عنوان" }, { kind: "textarea", key: "text", label: "متن" },
      SOCIALS, { kind: "text", key: "linkLabel", label: "متن «بیشتر بخوانید»" }, { kind: "link", key: "linkHref", label: "پیوند" },
      { kind: "select", key: "aboutLayout", label: "چیدمان", options: [{ value: "auto", label: "خودکار (پیش‌فرض)" }, { value: "horizontal", label: "افقی: تصویر چپ، متن راست" }, { value: "compact", label: "باریک با نقل‌قول کنار" }] },
      { kind: "textarea", key: "sideQuote", label: "نقل‌قول کنار (چیدمان باریک، هر مصراع یک خط)" }, { kind: "text", key: "sideQuoteAuthor", label: "گوینده نقل‌قول کنار" },
      { kind: "select", key: "card", label: "کارت", options: [{ value: "none", label: "بدون کارت" }, { value: "light", label: "کارت روشن" }] },
      tone, frame, pattern, ...SECTION_BG_FIELDS,
    ],
    create: () => node("poet-about", { eyebrow: "درباره شاعر", title: "", text: "", linkLabel: "بیشتر بخوانید", linkHref: "/about", photoMode: "logo", logo: "", tone: "light", frame: "arch" }),
  },
  {
    type: "quote-block", label: "نقل‌قول (گیومه بزرگ)", category: "content",
    fields: [{ kind: "textarea", key: "text", label: "متن (هر مصراع یک خط)" }, { kind: "text", key: "author", label: "گوینده" }, tone, pattern, ...SECTION_BG_FIELDS],
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

/** every widget here gets `mobileFullWidth` (edge-to-edge on phones, default on). */
export const MOBILE_FULL_WIDTH_FIELD: FieldDef = { kind: "switch", key: "mobileFullWidth", label: "تمام‌عرض در موبایل" }
export const MOBILE_PADDING_Y_FIELD: FieldDef = { kind: "number", key: "mobilePaddingY", label: "فاصله بالا/پایین در موبایل (px)", min: 0, max: 160 }
export const MOBILE_GAP_FIELD: FieldDef = { kind: "number", key: "mobileGap", label: "فاصله تا بخش بعد در موبایل (px)", min: 0, max: 160 }
for (const d of POETRY_WIDGETS) if (!d.fields.some((f) => "key" in f && f.key === "mobileFullWidth")) {
  d.fields.push(MOBILE_FULL_WIDTH_FIELD)
  if (d.category !== "chrome") d.fields.push(MOBILE_PADDING_Y_FIELD, MOBILE_GAP_FIELD)
  const make = d.create
  const chrome = d.category === "chrome"
  d.create = () => {
    const n = make()
    if (n.props.mobileFullWidth === undefined) n.props.mobileFullWidth = true
    if (!chrome && n.props.mobilePaddingY === undefined) n.props.mobilePaddingY = 44
    if (!chrome && n.props.mobileGap === undefined) n.props.mobileGap = 28
    return n
  }
}

/**
 * `desktopWidth` (section widgets except footer): full (default) | half (50%) | wide (60%) | narrow (40%).
 * On desktop (>=992px) adjacent non-full widgets/sections share one row (24px gap, equal height),
 * e.g. half+half or wide+narrow. Phones/tablets always stack full width (mobileFullWidth etc. unchanged).
 */
export const DESKTOP_WIDTH_FIELD: FieldDef = {
  kind: "select", key: "desktopWidth", label: "عرض در دسکتاپ (بخش‌های غیرتمام‌عرضِ پشت‌سرهم کنار هم می‌نشینند)",
  options: [
    { value: "full", label: "تمام‌عرض" },
    { value: "half", label: "نصف (۵۰٪)" },
    { value: "wide", label: "پهن (۶۰٪) — کنار «باریک»" },
    { value: "narrow", label: "باریک (۴۰٪) — کنار «پهن»" },
  ],
}
/** `fullBleed` (default off): with desktopWidth=full, the widget breaks out of the boxed wrapper to the viewport edges. */
export const FULL_BLEED_FIELD: FieldDef = { kind: "switch", key: "fullBleed", label: "تمام‌عرض تا لبه صفحه (فقط با عرض «تمام‌عرض»)" }
for (const d of POETRY_WIDGETS) if (d.type !== "poetry-footer" && !d.fields.some((f) => "key" in f && f.key === "desktopWidth")) {
  d.fields.push(DESKTOP_WIDTH_FIELD, FULL_BLEED_FIELD)
  const make = d.create
  d.create = () => { const n = make(); if (n.props.desktopWidth === undefined) n.props.desktopWidth = "full"; return n }
}
