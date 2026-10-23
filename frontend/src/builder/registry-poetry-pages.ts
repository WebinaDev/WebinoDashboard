/* alikhabari.ir page components (approved mockups: home, poems, poem, media, shop, product, about).
 * Renderers: render/poetry-pages-widgets.tsx. Every colour, image and text is a field; every image slot
 * has a `photoMode` (photo | logo | arabesque) so the site can run without any portrait photo. */
import { uid } from "./ids"
import type { FieldDef, WidgetDef, WidgetNode } from "./types"

function node(type: string, props: Record<string, unknown>): WidgetNode {
  return { id: uid("w"), type, props }
}

export const AKX_DEFAULT_COLORS = { accent: "#B4101E", ink: "#2a0a0d", cream: "#FBF3EC", gold: "#C9A24A", card: "#ffffff" }

const colors: FieldDef[] = [
  { kind: "color", key: "accent", label: "رنگ اصلی (زرشکی)" },
  { kind: "color", key: "ink", label: "رنگ متن تیره" },
  { kind: "color", key: "cream", label: "رنگ کرم" },
  { kind: "color", key: "gold", label: "رنگ طلایی" },
  { kind: "color", key: "card", label: "رنگ کارت‌ها" },
]
const C = { ...AKX_DEFAULT_COLORS }
const SEC: FieldDef = { kind: "color", key: "sectionBg", label: "زمینه بخش (رنگ یا گرادیان)" }
const DARK = "linear-gradient(180deg,#5a0f17 0,#2a0a0d 60%,#1a0507)"

export const PHOTO_MODES = [
  { value: "photo", label: "عکس" },
  { value: "logo", label: "لوگو (بدون عکس)" },
  { value: "arabesque", label: "نقش اسلیمی (بدون عکس)" },
]
const photoMode = (key = "photoMode", label = "حالت تصویر"): FieldDef => ({ kind: "select", key, label, options: PHOTO_MODES })
const logo: FieldDef = { kind: "media", key: "logo", label: "لوگو (خالی = لوگوی سایت)", accept: "image" }
const CHECKOUT: FieldDef = { kind: "select", key: "checkoutMode", label: "دکمه خرید", options: [
  { value: "inquiry", label: "استعلام/سفارش (درگاه خاموش)" }, { value: "cart", label: "افزودن به سبد" }, { value: "none", label: "بدون دکمه" },
] }
const PRICE_MODE: FieldDef = { kind: "select", key: "priceMode", label: "نمایش قیمت", options: [
  { value: "auto", label: "قیمت محصول (در نبود قیمت: متن جایگزین)" }, { value: "text", label: "همیشه متن جایگزین" },
] }
const SOCIAL_NETS = [{ value: "eitaa", label: "ایتا" }, { value: "telegram", label: "تلگرام" }, { value: "instagram", label: "اینستاگرام" }, { value: "bale", label: "بله" }, { value: "youtube", label: "یوتیوب" }, { value: "aparat", label: "آپارات" }]
const SOCIALS: FieldDef = { kind: "repeater", key: "socials", label: "شبکه‌های اجتماعی", fields: [
  { key: "network", label: "شبکه", kind: "select", options: SOCIAL_NETS }, { key: "href", label: "نشانی", kind: "url" }, { key: "label", label: "برچسب کوتاه", kind: "text" },
] }
export const AKX_SOCIALS_DEFAULT = "eitaa|https://eitaa.com/ali_khabari_poet|ایتا\ntelegram|https://t.me/ali_khabari_poet|تل\ninstagram|https://instagram.com/ali_khabari_poet|اینستا"
const NAV_DEFAULT = "خانه|/\nاشعار|/poems\nمناسبت‌ها|/occasions\nصوت و ویدیو|/media\nفروشگاه|/shop\nدرباره شاعر|/about"
const INQ = { checkoutMode: "inquiry", inquiryLabel: "سفارش در ایتا", inquiryHref: "https://eitaa.com/ali_khabari_poet", cartLabel: "افزودن به سبد", priceMode: "auto", priceText: "قیمت (از مشتری)" }

export const POETRY_PAGE_WIDGET_TYPES = [
  "poetry-nav", "poetry-page-hero", "poem-archive", "poem-single", "media-archive", "poetry-shop", "poetry-product", "poet-profile", "poetry-site-footer",
] as const

export const POETRY_PAGE_WIDGETS: WidgetDef[] = [
  {
    type: "poetry-nav", label: "منوی کپسولی (لوگو + جستجو)", category: "chrome",
    fields: [
      logo, { kind: "text", key: "brand", label: "نام" },
      { kind: "repeater", key: "links", label: "پیوندها", fields: [{ key: "label", label: "برچسب", kind: "text" }, { key: "href", label: "نشانی", kind: "url" }] },
      { kind: "switch", key: "showSearch", label: "نمایش جستجو" },
      { kind: "text", key: "searchPlaceholder", label: "متن راهنمای جستجو" }, { kind: "link", key: "searchHref", label: "صفحه نتایج جستجو" },
      { kind: "color", key: "navBg", label: "رنگ کپسول" }, { kind: "color", key: "searchBg", label: "رنگ جعبه جستجو" }, ...colors,
    ],
    create: () => node("poetry-nav", { logo: "", brand: "علی خبری", links: NAV_DEFAULT, showSearch: true, searchPlaceholder: "جستجوی شعر، مصرع یا مناسبت…", searchHref: "/poems", navBg: "rgba(255,255,255,.92)", searchBg: "#f5ebe6", ...C }),
  },
  {
    type: "poetry-page-hero", label: "سربرگ صفحه (مسیر + عنوان دورنگ)", category: "content",
    fields: [
      { kind: "repeater", key: "crumbs", label: "مسیر (breadcrumb)", fields: [{ key: "label", label: "برچسب", kind: "text" }, { key: "href", label: "نشانی", kind: "url" }] },
      { kind: "text", key: "title", label: "عنوان (بخش تیره)" }, { kind: "text", key: "highlight", label: "عنوان (بخش زرشکی)" },
      { kind: "switch", key: "fromPoem", label: "عنوان از شعر جاری (?poem=)" },
      { kind: "media", key: "image", label: "تصویر کناری (قلم)", accept: "image" }, photoMode(), logo,
      { kind: "number", key: "height", label: "ارتفاع (px)", min: 120, max: 480 },
      { kind: "switch", key: "showSearch", label: "جعبه جستجو" }, { kind: "text", key: "searchPlaceholder", label: "متن راهنمای جستجو" }, { kind: "link", key: "searchHref", label: "صفحه نتایج" },
      { kind: "color", key: "bg", label: "رنگ زمینه" }, ...colors,
    ],
    create: () => node("poetry-page-hero", { logo: "", crumbs: "خانه|/\nاشعار|", title: "آرشیو", highlight: "اشعار", fromPoem: false, image: "", photoMode: "photo", height: 210, showSearch: false, searchPlaceholder: "جستجو در مصرع‌ها، مثلاً «مشک خالیست»…", searchHref: "/poems", bg: "#f7ece6", ...C }),
  },
  {
    type: "poem-archive", label: "آرشیو اشعار (فیلتر کناری + کارت)", category: "content",
    fields: [
      { kind: "link", key: "detailHref", label: "صفحه شعر" }, { kind: "number", key: "perPage", label: "تعداد در صفحه", min: 3, max: 48 },
      { kind: "switch", key: "showSidebar", label: "فیلترهای کناری" }, { kind: "switch", key: "showCounts", label: "نمایش تعداد" },
      { kind: "text", key: "figureTitle", label: "عنوان: شخصیت" }, { kind: "text", key: "styleTitle", label: "عنوان: سبک" },
      { kind: "text", key: "occasionTitle", label: "عنوان: مناسبت" }, { kind: "text", key: "mediaTitle", label: "عنوان: رسانه" },
      { kind: "text", key: "hasMediaLabel", label: "برچسب: دارای صوت/ویدیو" },
      { kind: "text", key: "chipAll", label: "تراشه: همه" }, { kind: "text", key: "chipNew", label: "تراشه: تازه‌ترین" }, { kind: "text", key: "chipPopular", label: "تراشه: پربازدیدترین" },
      { kind: "text", key: "chipMedia", label: "تراشه: دارای صوت" }, { kind: "text", key: "chipUnread", label: "تراشه: خوانده‌نشده" },
      { kind: "text", key: "newLabel", label: "نشان «جدید»" }, { kind: "text", key: "emptyText", label: "متن نبود نتیجه" }, { kind: "text", key: "filterLabel", label: "متن دکمه فیلتر (موبایل)" }, SEC, ...colors,
    ],
    create: () => node("poem-archive", { filterLabel: "فیلتر", detailHref: "/poem", perPage: 12, showSidebar: true, showCounts: true, figureTitle: "شخصیت", styleTitle: "سبک", occasionTitle: "مناسبت", mediaTitle: "رسانه", hasMediaLabel: "دارای صوت/ویدیو", chipAll: "همه", chipNew: "تازه‌ترین", chipPopular: "پربازدیدترین", chipMedia: "دارای صوت", chipUnread: "خوانده‌نشده", newLabel: "جدید", emptyText: "شعری یافت نشد.", sectionBg: DARK, ...C }),
  },
  {
    type: "poem-single", label: "متن شعر (کاغذی + مشخصات + مرتبط)", category: "content",
    fields: [
      { kind: "text", key: "slug", label: "نامک شعر (خالی = ?poem=)" },
      { kind: "text", key: "heading", label: "سرلوحه" }, { kind: "switch", key: "showSubtitle", label: "زیرعنوان (سبک + شخصیت)" },
      { kind: "text", key: "separator", label: "جداکننده بندها" }, { kind: "text", key: "signPrefix", label: "پیش از امضا" }, { kind: "text", key: "signNote", label: "یادداشت امضا" },
      { kind: "switch", key: "showTools", label: "ابزارها" }, { kind: "switch", key: "showSidebar", label: "ستون کناری" },
      { kind: "text", key: "playerNote", label: "متن زیر پخش‌کننده" }, { kind: "text", key: "specsTitle", label: "عنوان مشخصات" },
      { kind: "text", key: "meterFallback", label: "وزن (در نبود)" }, { kind: "text", key: "relatedTitle", label: "عنوان اشعار مرتبط" },
      { kind: "link", key: "detailHref", label: "صفحه شعر (پیوند مرتبط‌ها)" },
      { kind: "color", key: "refrainBg", label: "زمینه برگردان" }, SEC, ...colors,
    ],
    create: () => node("poem-single", { slug: "", heading: "بسم رب الحسین", showSubtitle: true, separator: "✦ ✦ ✦", signPrefix: "✍", signNote: "التماس دعا", showTools: true, showSidebar: true, playerNote: "صوت/ویدیو در صورت وجود نمایش داده می‌شود", specsTitle: "مشخصات شعر", meterFallback: "—", relatedTitle: "اشعار مرتبط", detailHref: "/poem", refrainBg: "#fbe9ea", sectionBg: DARK, ...C }),
  },
  {
    type: "media-archive", label: "صوت و ویدیو (ویژه + پرشنونده + شبکه)", category: "content",
    fields: [
      { kind: "repeater", key: "items", label: "اجراها", fields: [
        { key: "title", label: "عنوان", kind: "text" }, { key: "cover", label: "کاور", kind: "media" },
        { key: "kind", label: "نوع", kind: "select", options: [{ value: "audio", label: "صوت" }, { value: "video", label: "ویدیو" }] },
        { key: "src", label: "فایل/پیوند", kind: "media" }, { key: "duration", label: "مدت", kind: "text" }, { key: "tag", label: "مناسبت", kind: "text" },
        { key: "poem", label: "شعر مرتبط", kind: "text" }, { key: "reciter", label: "مداح", kind: "text" },
      ] },
      { kind: "number", key: "featured", label: "شماره اجرای ویژه", min: 1, max: 50 }, { kind: "text", key: "topTitle", label: "عنوان فهرست" },
      { kind: "number", key: "topCount", label: "تعداد فهرست", min: 0, max: 10 },
      { kind: "text", key: "filters", label: "تراشه‌ها (با , جدا)" }, { kind: "number", key: "perPage", label: "تعداد در صفحه", min: 4, max: 48 }, { kind: "text", key: "emptyTitle", label: "عنوان حالت خالی" }, { kind: "text", key: "emptyText", label: "متن حالت خالی" },
      { kind: "text", key: "audioLabel", label: "برچسب صوت" }, { kind: "text", key: "videoLabel", label: "برچسب ویدیو" },
      photoMode("coverMode", "حالت کاور در نبود تصویر"), logo, SEC, ...colors,
    ],
    create: () => node("media-archive", { emptyTitle: "هنوز اجرایی ثبت نشده است", emptyText: "به‌زودی صوت و تصویر اجراها در این بخش قرار می‌گیرد.", logo: "", items: "", featured: 1, topTitle: "پرشنونده‌ترین‌ها", topCount: 4, filters: "همه,صوت,ویدیو,محرم,فاطمیه,اربعین", perPage: 8, audioLabel: "صوت", videoLabel: "ویدیو", coverMode: "arabesque", sectionBg: DARK, ...C }),
  },
  {
    type: "poetry-shop", label: "فروشگاه قاب‌ها (فیلتر + مرتب‌سازی)", category: "commerce",
    fields: [
      { kind: "select", key: "source", label: "منبع محصولات", options: [{ value: "catalog", label: "محصولات فروشگاه (در نبود: فهرست دستی)" }, { value: "manual", label: "فقط فهرست دستی" }] },
      { kind: "repeater", key: "items", label: "محصولات دستی", fields: [
        { key: "title", label: "نام", kind: "text" }, { key: "image", label: "تصویر", kind: "media" }, { key: "price", label: "قیمت (تومان)", kind: "text" },
        { key: "oldPrice", label: "قیمت قبلی", kind: "text" }, { key: "href", label: "پیوند", kind: "url" }, { key: "category", label: "دسته", kind: "text" },
        { key: "size", label: "اندازه", kind: "text" }, { key: "demo", label: "نمونه؟ (1)", kind: "text" },
      ] },
      { kind: "number", key: "perPage", label: "تعداد در صفحه", min: 4, max: 48 }, { kind: "number", key: "columns", label: "ستون‌ها", min: 2, max: 5 },
      { kind: "select", key: "imageRatio", label: "نسبت تصویر محصول", options: [{ value: "4/5", label: "عمودی ۴:۵" }, { value: "3/4", label: "۳:۴" }, { value: "2/3", label: "۲:۳" }, { value: "1/1", label: "مربع" }, { value: "16/10", label: "افقی" }] }, { kind: "text", key: "filterLabel", label: "متن دکمه فیلتر (موبایل)" },
      { kind: "switch", key: "showSidebar", label: "فیلترهای کناری" },
      { kind: "text", key: "categoryTitle", label: "عنوان: دسته‌بندی" }, { kind: "text", key: "allLabel", label: "همه دسته‌ها" },
      { kind: "text", key: "sizeTitle", label: "عنوان: اندازه" }, { kind: "text", key: "sizes", label: "اندازه‌ها (با , جدا)" },
      { kind: "text", key: "statusTitle", label: "عنوان: وضعیت" }, { kind: "text", key: "inStockLabel", label: "فقط موجود" }, { kind: "text", key: "saleLabel", label: "تخفیف‌دار" },
      { kind: "text", key: "sortNew", label: "مرتب: جدیدترین" }, { kind: "text", key: "sortBest", label: "مرتب: پرفروش‌ترین" }, { kind: "text", key: "sortCheap", label: "مرتب: ارزان‌ترین" },
      PRICE_MODE, { kind: "text", key: "priceText", label: "متن جایگزین قیمت" }, { kind: "text", key: "discountLabel", label: "نشان تخفیف" },
      CHECKOUT, { kind: "text", key: "cartLabel", label: "متن دکمه سبد" }, { kind: "text", key: "inquiryLabel", label: "متن دکمه استعلام" }, { kind: "link", key: "inquiryHref", label: "پیوند استعلام" },
      { kind: "text", key: "demoLabel", label: "نشان محصول نمونه" }, { kind: "text", key: "demoNotice", label: "اطلاعیه محصولات نمونه" },
      { kind: "link", key: "productHref", label: "صفحه محصول دستی (خالی = /product/نامک)" }, photoMode("imageMode", "حالت تصویر در نبود عکس"), logo, SEC, ...colors,
    ],
    create: () => node("poetry-shop", { imageRatio: "4/5", filterLabel: "فیلتر", logo: "", source: "catalog", items: "", perPage: 12, columns: 4, showSidebar: true, categoryTitle: "دسته‌بندی", allLabel: "همه قاب‌ها", sizeTitle: "اندازه", sizes: "کوچک,متوسط,بزرگ", statusTitle: "وضعیت", inStockLabel: "فقط موجود", saleLabel: "تخفیف‌دار", sortNew: "جدیدترین", sortBest: "پرفروش‌ترین", sortCheap: "ارزان‌ترین", discountLabel: "تخفیف", demoLabel: "نمونه", demoNotice: "محصولات این صفحه نمونه‌اند؛ برای سفارش در ایتا پیام دهید.", imageMode: "arabesque", productHref: "", ...INQ, sectionBg: DARK, ...C }),
  },
  {
    type: "poetry-product", label: "صفحه محصول قاب (گالری + گزینه‌ها)", category: "commerce",
    fields: [
      { kind: "text", key: "slug", label: "نامک (خالی = از نشانی صفحه)" },
      { kind: "text", key: "name", label: "نام (دستی/پیش‌فرض)" }, { kind: "text", key: "category", label: "دسته" }, { kind: "text", key: "price", label: "قیمت (تومان)" },
      { kind: "textarea", key: "description", label: "توضیحات" },
      { kind: "repeater", key: "images", label: "تصاویر", fields: [{ key: "src", label: "تصویر", kind: "media" }] },
      { kind: "text", key: "sizeLabel", label: "عنوان اندازه" }, { kind: "text", key: "sizes", label: "اندازه‌ها (با , جدا)" },
      { kind: "text", key: "colorLabel", label: "عنوان رنگ قاب" }, { kind: "text", key: "frameColors", label: "رنگ‌های قاب (با , جدا)" },
      { kind: "text", key: "stockLabel", label: "متن موجودی" }, { kind: "text", key: "outLabel", label: "متن ناموجود" }, { kind: "text", key: "trustLine", label: "خط اعتماد" },
      { kind: "switch", key: "showRelated", label: "محصولات مشابه" }, { kind: "text", key: "relatedTitle", label: "عنوان مشابه" },
      PRICE_MODE, { kind: "text", key: "priceText", label: "متن جایگزین قیمت" },
      CHECKOUT, { kind: "text", key: "cartLabel", label: "متن دکمه سبد" }, { kind: "text", key: "inquiryLabel", label: "متن دکمه استعلام" }, { kind: "link", key: "inquiryHref", label: "پیوند استعلام" },
      { kind: "text", key: "demoLabel", label: "نشان محصول نمونه" }, photoMode("imageMode", "حالت تصویر در نبود عکس"), logo, SEC, ...colors,
    ],
    create: () => node("poetry-product", { logo: "", slug: "", name: "نام قاب", category: "قاب خوشنویسی", price: "", description: "", images: "", sizeLabel: "اندازه", sizes: "۳۰×۴۰,۵۰×۷۰,۷۰×۱۰۰", colorLabel: "رنگ قاب", frameColors: "طلایی,مشکی,چوبی", stockLabel: "● موجود در انبار", outLabel: "● ناموجود", trustLine: "🚚 ارسال به سراسر کشور · 🔒 پرداخت امن · 🎁 کد تخفیف در سبد خرید", showRelated: true, relatedTitle: "محصولات مشابه", demoLabel: "نمونه", imageMode: "arabesque", ...INQ, sectionBg: DARK, ...C }),
  },
  {
    type: "poet-profile", label: "درباره شاعر (بدون عکس + داستان + گاه‌شمار)", category: "content",
    fields: [
      photoMode(), { kind: "media", key: "image", label: "عکس (فقط در حالت عکس)", accept: "image" }, logo,
      { kind: "text", key: "name", label: "نام" }, { kind: "textarea", key: "info", label: "مشخصات (هر خط یک سطر)" }, SOCIALS,
      { kind: "text", key: "storyTitle", label: "عنوان داستان" },
      { kind: "textarea", key: "story", label: "متن (بندها با خط خالی؛ بندِ آغازشده با > نقل‌قول برجسته)" },
      { kind: "repeater", key: "timeline", label: "گاه‌شمار", fields: [{ key: "value", label: "سال/عنوان", kind: "text" }, { key: "label", label: "توضیح", kind: "text" }] },
      SEC, ...colors,
    ],
    create: () => node("poet-profile", { logo: "", photoMode: "logo", image: "", name: "علی خبری «طه»", info: "متولد بهمن ۱۳۷۹، دزفول\nسرایندهٔ اشعار آیینی اختصاصی و ترکیبی", socials: AKX_SOCIALS_DEFAULT, storyTitle: "از دزفول، با عطر محرم", story: "", timeline: "۱۳۷۹|تولد در دزفول\n۱۳۹۵|آغاز سرودن\nنوجوانی|نخستین سفر به کربلا\nبه‌زودی|کتاب اشعار عاشورایی", sectionBg: DARK, ...C }),
  },
  {
    type: "poetry-site-footer", label: "پاورقی تیره (پیوند + شبکه‌ها)", category: "chrome",
    fields: [
      { kind: "media", key: "logo", label: "لوگوی سفید", accept: "image" }, { kind: "text", key: "brand", label: "نام" },
      { kind: "repeater", key: "links", label: "پیوندها", fields: [{ key: "label", label: "برچسب", kind: "text" }, { key: "href", label: "نشانی", kind: "url" }] },
      SOCIALS, { kind: "text", key: "copyright", label: "کپی‌رایت" },
      { kind: "color", key: "bg", label: "رنگ زمینه" }, { kind: "color", key: "text", label: "رنگ متن" }, ...colors,
    ],
    create: () => node("poetry-site-footer", { logo: "", brand: "علی خبری", links: NAV_DEFAULT, socials: AKX_SOCIALS_DEFAULT, copyright: "", bg: "#1a0507", text: "#d8c3bd", ...C }),
  },
]
