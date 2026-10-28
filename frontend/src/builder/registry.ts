import { applyChromeExtras } from "./registry-chrome-extras"
import { applyNavMenuFields } from "./registry-nav-menus"
import { createWidgetRegistry } from "@webina/ui/builder"

import { uid } from "./ids"
import { createSection } from "./tree"
import type { WidgetDef, WidgetNode } from "./types"
import { ICON_OPTIONS } from "./render/icon-options"
import { COMMERCE_PLUGIN } from "./registry-commerce"
import { CONTENT_WIDGETS, FORM_WIDGET, GAP_WIDGETS } from "./registry-content"
import { POETRY_WIDGETS } from "./registry-poetry"
import { POETRY_MODULE_WIDGETS } from "./registry-poetry-module"
import { RESUME_WIDGETS } from "./registry-resume"
import { POETRY_PAGE_WIDGETS } from "./registry-poetry-pages"

function node(type: string, props: Record<string, unknown>, children?: WidgetNode["children"]): WidgetNode {
  return { id: uid("w"), type, props, children }
}

const textFields = [
  { kind: "text" as const, key: "text", label: "متن" },
  { kind: "select" as const, key: "tag", label: "سطح", options: [
    { value: "h1", label: "عنوان اصلی" },
    { value: "h2", label: "عنوان" },
    { value: "h3", label: "زیرعنوان" },
  ] },
]

/** Core widgets (layout, basic, chrome, parts) + shared landing pack from `@webina/ui/builder`. */
const CORE_WIDGETS: WidgetDef[] = [
  {
    type: "container",
    label: "کانتینر",
    category: "layout",
    fields: [],
    create: () => node("container", { label: "کانتینر" }, [createSection([12])]),
  },
  {
    type: "heading",
    label: "عنوان",
    category: "basic",
    fields: textFields,
    create: () => node("heading", { text: "عنوان تازه", tag: "h2" }),
  },
  {
    type: "text",
    label: "متن",
    category: "basic",
    fields: [{ kind: "textarea", key: "text", label: "متن" }],
    create: () => node("text", { text: "متن معرفی را اینجا بنویسید." }),
  },
  {
    type: "image",
    label: "تصویر",
    category: "basic",
    fields: [
      { kind: "media", key: "src", label: "تصویر" },
      { kind: "text", key: "alt", label: "متن جایگزین" },
    ],
    create: () => node("image", { src: "", alt: "" }),
  },
  {
    type: "button",
    label: "دکمه",
    category: "basic",
    fields: [
      { kind: "text", key: "label", label: "برچسب" },
      { kind: "link", key: "href", label: "پیوند" },
      { kind: "select", key: "tone", label: "رنگ", options: [
        { value: "pink", label: "صورتی" },
        { value: "navy", label: "سرمه‌ای" },
        { value: "ghost", label: "خطی" },
      ] },
    ],
    create: () => node("button", { label: "مشاهده", href: "/shop", tone: "pink" }),
  },
  {
    type: "spacer",
    label: "فاصله",
    category: "basic",
    fields: [{ kind: "number", key: "size", label: "ارتفاع", min: 4, max: 240 }],
    create: () => node("spacer", { size: 32 }),
  },
  {
    type: "divider",
    label: "جداکننده",
    category: "basic",
    fields: [{ kind: "color", key: "color", label: "رنگ" }],
    create: () => node("divider", { color: "#e6eef6" }),
  },
  {
    type: "icon",
    label: "آیکون",
    category: "basic",
    fields: [
      { kind: "select", key: "name", label: "آیکون", options: [
        { value: "spark", label: "درخشش" },
        { value: "truck", label: "ارسال" },
        { value: "shield", label: "ضمانت" },
        { value: "heart", label: "علاقه" },
        { value: "star", label: "امتیاز" },
      ] },
      { kind: "text", key: "label", label: "برچسب" },
    ],
    create: () => node("icon", { name: "spark", label: "ویژگی" }),
  },
  {
    type: "video",
    label: "ویدیو",
    category: "basic",
    fields: [{ kind: "media", key: "src", label: "ویدیو", accept: "video" }],
    create: () => node("video", { src: "" }),
  },
  {
    type: "html",
    label: "HTML",
    category: "basic",
    fields: [{ kind: "textarea", key: "html", label: "HTML" }],
    create: () => node("html", { html: "<p>بلوک سفارشی</p>" }),
  },
  {
    type: "menu",
    label: "منو",
    category: "basic",
    fields: [{ kind: "repeater", key: "links", label: "پیوندها", fields: [{ key: "label", label: "برچسب", kind: "text" }, { key: "href", label: "نشانی", kind: "url" }] }],
    create: () => node("menu", { links: "خانه|/\nفروشگاه|/shop\nحساب|/account" }),
  },
  FORM_WIDGET,
  {
    type: "popup",
    label: "پاپ‌آپ",
    category: "basic",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "text", label: "متن" },
      { kind: "media", key: "image", label: "تصویر" },
      { kind: "text", key: "cta", label: "دکمه" },
      { kind: "link", key: "href", label: "پیوند" },
      { kind: "select", key: "trigger", label: "تریگر", options: [
        { value: "load", label: "ورود به صفحه" },
        { value: "delay", label: "با تأخیر" },
        { value: "scroll", label: "اسکرول درصدی" },
        { value: "element", label: "رسیدن به المان" },
        { value: "click", label: "فقط با کلیک روی پیوند" },
        { value: "inactivity", label: "عدم فعالیت" },
        { value: "exit", label: "قصد خروج" },
      ]},
      { kind: "number", key: "delayMs", label: "تأخیر (ms)", min: 0, max: 60000 },
      { kind: "slider", key: "scrollPercent", label: "درصد اسکرول", min: 5, max: 100, step: 5, unit: "٪" },
      { kind: "text", key: "elementId", label: "شناسه المان (برای «رسیدن به المان»)" },
      { kind: "number", key: "inactivitySec", label: "ثانیه عدم فعالیت", min: 3, max: 600 },
      { kind: "select", key: "frequency", label: "تکرار", options: [
        { value: "session", label: "یک بار در هر نشست" },
        { value: "once", label: "فقط یک بار" },
        { value: "days", label: "هر چند روز" },
        { value: "always", label: "هر بار" },
      ]},
      { kind: "number", key: "frequencyDays", label: "فاصله (روز)", min: 1, max: 365 },
      { kind: "number", key: "minPageViews", label: "حداقل بازدید صفحه در نشست", min: 0, max: 50 },
      { kind: "number", key: "minSessions", label: "حداقل تعداد نشست", min: 0, max: 50 },
      { kind: "text", key: "referrer", label: "ارجاع‌دهنده شامل" },
      { kind: "select", key: "device", label: "دستگاه", options: [{ value: "all", label: "همه" }, { value: "desktop", label: "دسکتاپ" }, { value: "mobile", label: "موبایل" }] },
      { kind: "select", key: "layout", label: "چیدمان", options: [
        { value: "modal", label: "وسط صفحه" },
        { value: "slide-in", label: "کشویی گوشه" },
        { value: "bar-top", label: "نوار بالا" },
        { value: "bar-bottom", label: "نوار پایین" },
        { value: "fullscreen", label: "تمام‌صفحه" },
        { value: "offcanvas-start", label: "کشوی کناری (راست)" },
        { value: "offcanvas-end", label: "کشوی کناری (چپ)" },
      ]},
      { kind: "switch", key: "closeButton", label: "دکمه بستن" },
      { kind: "switch", key: "overlayClose", label: "بستن با کلیک بیرون" },
    ],
    create: () =>
      node("popup", {
        title: "پیشنهاد ویژه",
        text: "با عضویت از تخفیف‌ها باخبر شوید.",
        cta: "متوجه شدم",
        href: "/shop",
        trigger: "delay",
        delayMs: 2500,
        frequency: "session",
        layout: "modal",
        closeButton: true,
        overlayClose: true,
      }),
  },
  {
    type: "store-header",
    label: "سربرگ فروشگاه",
    category: "chrome",
    fields: [
      { kind: "text", key: "mark", label: "نشان" },
      { kind: "repeater", key: "links", label: "منو", fields: [{ key: "label", label: "برچسب", kind: "text" }, { key: "href", label: "نشانی", kind: "url" }] },
    ],
    create: () => node("store-header", { mark: "", links: "" }),
  },
  {
    type: "mega-menu",
    label: "مگامنو",
    category: "chrome",
    fields: [{ kind: "textarea", key: "columns", label: "ستون‌ها (عنوان|لینک)" }],
    create: () => node("mega-menu", { columns: "محصولات|/shop\nتخفیف|/amazing-offers" }),
  },
  {
    type: "store-footer",
    label: "پاورقی فروشگاه",
    category: "chrome",
    fields: [
      { kind: "text", key: "phone", label: "تلفن" },
      { kind: "text", key: "email", label: "ایمیل" },
      { kind: "textarea", key: "about", label: "درباره" },
    ],
    create: () => node("store-footer", { phone: "", email: "", about: "" }),
  },
  {
    type: "banner-grid",
    label: "شبکه بنر",
    category: "basic",
    fields: [
      { kind: "repeater", key: "items", label: "بنرها", fields: [{ key: "image", label: "تصویر", kind: "media" }, { key: "href", label: "پیوند", kind: "url" }, { key: "alt", label: "متن جایگزین", kind: "text" }] },
      { kind: "number", key: "columns", label: "ستون‌ها", min: 1, max: 4 },
      { kind: "select", key: "ratio", label: "نسبت تصویر", options: [
        { value: "16/7", label: "۱۶:۷" },
        { value: "16/9", label: "۱۶:۹" },
        { value: "4/3", label: "۴:۳" },
        { value: "1/1", label: "مربع" },
        { value: "3/4", label: "عمودی" },
      ] },
      { kind: "number", key: "radius", label: "گردی گوشه", min: 0, max: 40 },
    ],
    create: () => node("banner-grid", { items: "", columns: 2, ratio: "16/7", radius: 16 }),
  },
  {
    type: "tabs",
    label: "زبانه‌ها",
    category: "basic",
    fields: [{ kind: "repeater", key: "items", label: "زبانه‌ها", fields: [{ key: "title", label: "عنوان", kind: "text" }, { key: "body", label: "محتوا", kind: "textarea" }] }],
    create: () => node("tabs", { items: "زبانه اول|محتوای زبانه اول\nزبانه دوم|محتوای زبانه دوم" }),
  },
  {
    type: "accordion",
    label: "آکاردئون / سؤالات متداول",
    category: "basic",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "repeater", key: "items", label: "پرسش‌ها", fields: [{ key: "q", label: "پرسش", kind: "text" }, { key: "a", label: "پاسخ", kind: "textarea" }] },
      { kind: "switch", key: "firstOpen", label: "باز بودن مورد اول" },
      { kind: "switch", key: "faqSchema", label: "داده ساختاریافته FAQ (سئو)" },
    ],
    create: () => node("accordion", { title: "سؤالات متداول", items: "", firstOpen: true, faqSchema: true }),
  },
  {
    type: "icon-box",
    label: "باکس آیکن",
    category: "basic",
    fields: [
      { kind: "icon", key: "icon", label: "آیکن", options: ICON_OPTIONS },
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "text", label: "متن" },
      { kind: "link", key: "href", label: "پیوند" },
      { kind: "select", key: "layout", label: "چیدمان", options: [
        { value: "top", label: "آیکن بالا" },
        { value: "side", label: "آیکن کنار" },
      ] },
    ],
    create: () => node("icon-box", { icon: "truck", title: "ارسال سریع", text: "", layout: "top" }),
  },
  {
    type: "icon-list",
    label: "فهرست آیکن‌دار",
    category: "basic",
    fields: [
      { kind: "repeater", key: "items", label: "آیتم‌ها", fields: [{ key: "icon", label: "آیکن", kind: "icon", options: ICON_OPTIONS }, { key: "text", label: "متن", kind: "text" }, { key: "href", label: "پیوند", kind: "url" }] },
      { kind: "select", key: "direction", label: "جهت", options: [
        { value: "column", label: "عمودی" },
        { value: "row", label: "افقی" },
      ] },
    ],
    create: () => node("icon-list", { items: "", direction: "column" }),
  },
  {
    type: "testimonials",
    label: "نظرات مشتریان",
    category: "basic",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "repeater", key: "items", label: "نظرها", fields: [{ key: "name", label: "نام", kind: "text" }, { key: "text", label: "متن", kind: "textarea" }, { key: "rating", label: "امتیاز ۱ تا ۵", kind: "text" }, { key: "image", label: "تصویر", kind: "media" }] },
    ],
    create: () => node("testimonials", { title: "نظر مشتریان", items: "" }),
  },
  {
    type: "image-gallery",
    label: "گالری تصاویر",
    category: "basic",
    fields: [
      { kind: "textarea", key: "images", label: "تصویر|متن جایگزین در هر خط" },
      { kind: "number", key: "columns", label: "ستون‌ها", min: 1, max: 6 },
      { kind: "switch", key: "lightbox", label: "بزرگ‌نمایی با کلیک" },
    ],
    create: () => node("image-gallery", { images: "", columns: 3, lightbox: true }),
  },
  {
    type: "image-carousel",
    label: "کاروسل تصاویر",
    category: "basic",
    fields: [
      { kind: "textarea", key: "images", label: "تصویر|پیوند|متن جایگزین در هر خط" },
      { kind: "number", key: "autoplay", label: "پخش خودکار (ثانیه، ۰ = خاموش)", min: 0, max: 30 },
      { kind: "select", key: "ratio", label: "نسبت", options: [
        { value: "16/6", label: "پهن" },
        { value: "16/9", label: "۱۶:۹" },
        { value: "4/3", label: "۴:۳" },
        { value: "1/1", label: "مربع" },
      ] },
    ],
    create: () => node("image-carousel", { images: "", autoplay: 5, ratio: "16/6" }),
  },
  {
    type: "announcement-bar",
    label: "نوار اطلاعیه",
    category: "basic",
    fields: [
      { kind: "text", key: "text", label: "متن" },
      { kind: "link", key: "href", label: "پیوند" },
      { kind: "color", key: "background", label: "رنگ زمینه" },
      { kind: "color", key: "color", label: "رنگ متن" },
      { kind: "switch", key: "dismissible", label: "قابل بستن" },
    ],
    create: () => node("announcement-bar", { text: "", dismissible: true }),
  },
  {
    type: "map",
    label: "نقشه",
    category: "basic",
    fields: [
      { kind: "text", key: "lat", label: "عرض جغرافیایی" },
      { kind: "text", key: "lng", label: "طول جغرافیایی" },
      { kind: "number", key: "zoom", label: "بزرگ‌نمایی", min: 3, max: 18 },
      { kind: "number", key: "height", label: "ارتفاع (px)", min: 160, max: 800 },
      { kind: "text", key: "address", label: "نشانی" },
    ],
    create: () => node("map", { lat: "35.6892", lng: "51.389", zoom: 15, height: 320, address: "" }),
  },
  {
    type: "counter",
    label: "شمارنده",
    category: "basic",
    fields: [{ kind: "repeater", key: "items", label: "شمارنده‌ها", fields: [{ key: "value", label: "عدد", kind: "text" }, { key: "label", label: "برچسب", kind: "text" }, { key: "suffix", label: "پسوند", kind: "text" }] }],
    create: () => node("counter", { items: "" }),
  },
  {
    type: "social-icons",
    label: "شبکه‌های اجتماعی",
    category: "basic",
    fields: [{ kind: "repeater", key: "items", label: "شبکه‌ها", fields: [{ key: "network", label: "شبکه", kind: "select", options: ["instagram", "telegram", "whatsapp", "x", "linkedin", "youtube", "aparat", "eitaa", "bale", "rubika"].map((value) => ({ value, label: value })) }, { key: "href", label: "پیوند", kind: "url" }] }],
    create: () => node("social-icons", { items: "" }),
  },
  {
    type: "share-buttons",
    label: "دکمه‌های اشتراک‌گذاری",
    category: "basic",
    fields: [{ kind: "text", key: "title", label: "عنوان" }],
    create: () => node("share-buttons", { title: "اشتراک‌گذاری" }),
  },
  {
    type: "pricing-table",
    label: "جدول قیمت",
    category: "basic",
    fields: [
      { kind: "textarea", key: "plans", label: "نام|قیمت|ویژگی‌ها با ; |پیوند|ویژه (1) در هر خط" },
      { kind: "text", key: "cta", label: "متن دکمه" },
    ],
    create: () => node("pricing-table", { plans: "", cta: "انتخاب" }),
  },
  {
    type: "image-box",
    label: "باکس تصویر",
    category: "basic",
    fields: [
      { kind: "media", key: "image", label: "تصویر" },
      { kind: "text", key: "alt", label: "متن جایگزین تصویر" },
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "text", label: "متن" },
      { kind: "link", key: "href", label: "پیوند" },
      { kind: "select", key: "layout", label: "چیدمان", options: [{ value: "top", label: "تصویر بالا" }, { value: "side", label: "تصویر کنار" }] },
    ],
    create: () => node("image-box", { title: "عنوان باکس", text: "توضیح کوتاه", layout: "top" }),
  },
  {
    type: "flip-box",
    label: "باکس چرخشی",
    category: "basic",
    fields: [
      { kind: "icon", key: "icon", label: "آیکن", options: ICON_OPTIONS },
      { kind: "text", key: "frontTitle", label: "عنوان رو" },
      { kind: "textarea", key: "frontText", label: "متن رو" },
      { kind: "text", key: "backTitle", label: "عنوان پشت" },
      { kind: "textarea", key: "backText", label: "متن پشت" },
      { kind: "text", key: "button", label: "متن دکمه" },
      { kind: "link", key: "href", label: "پیوند دکمه" },
      { kind: "slider", key: "height", label: "ارتفاع", min: 160, max: 480, step: 10, unit: "px" },
    ],
    create: () => node("flip-box", { icon: "gift", frontTitle: "پیشنهاد ویژه", frontText: "برای دیدن جزئیات نگه دارید", backTitle: "۲۰٪ تخفیف", backText: "فقط این هفته", button: "خرید", href: "/shop", height: 240 }),
  },
  {
    type: "toc",
    label: "فهرست مطالب خودکار",
    category: "basic",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "select", key: "levels", label: "تیترها", options: [{ value: "h2,h3", label: "H2 و H3" }, { value: "h2", label: "فقط H2" }, { value: "h2,h3,h4", label: "H2 تا H4" }] },
      { kind: "switch", key: "collapsed", label: "بسته در ابتدا" },
    ],
    create: () => node("toc", { title: "فهرست مطالب", levels: "h2,h3" }),
  },
  {
    type: "hotspot",
    label: "نقاط داغ روی تصویر",
    category: "basic",
    fields: [
      { kind: "media", key: "image", label: "تصویر" },
      { kind: "text", key: "alt", label: "متن جایگزین" },
      { kind: "repeater", key: "points", label: "نقطه‌ها", fields: [{ key: "x", label: "افقی ٪ (از راست)", kind: "text" }, { key: "y", label: "عمودی ٪", kind: "text" }, { key: "title", label: "عنوان", kind: "text" }, { key: "text", label: "توضیح", kind: "textarea" }, { key: "href", label: "پیوند", kind: "url" }] },
    ],
    create: () => node("hotspot", { points: "30|40|نقطه اول|توضیح|" }),
  },
  {
    type: "nav-dropdown",
    label: "منوی چندسطحی",
    category: "chrome",
    fields: [
      { kind: "repeater", key: "items", label: "آیتم‌ها", fields: [{ key: "label", label: "برچسب", kind: "text" }, { key: "href", label: "نشانی", kind: "url" }, { key: "level", label: "سطح", kind: "select", options: [{ value: "0", label: "۱" }, { value: "1", label: "۲ (زیرمنو)" }, { value: "2", label: "۳" }] }] },
      { kind: "select", key: "direction", label: "جهت", options: [{ value: "row", label: "افقی" }, { value: "column", label: "عمودی" }] },
      { kind: "text", key: "ariaLabel", label: "نام دسترس‌پذیر منو" },
    ],
    create: () => node("nav-dropdown", { items: "خانه|/|0\nفروشگاه|/shop|0\nپوشاک|/shop?category=clothes|1\nکفش|/shop?category=shoes|1\nتماس|/contact|0", direction: "row" }),
  },
  {
    type: "state-box",
    label: "باکس چندحالته",
    category: "basic",
    fields: [
      { kind: "repeater", key: "states", label: "حالت‌ها (پیوند #state-شناسه-شماره)", fields: [{ key: "title", label: "عنوان", kind: "text" }, { key: "text", label: "متن", kind: "textarea" }, { key: "image", label: "تصویر", kind: "media" }] },
      { kind: "switch", key: "showButtons", label: "دکمه‌های تغییر حالت" },
    ],
    create: () => node("state-box", { states: "حالت اول|متن حالت اول|\nحالت دوم|متن حالت دوم|", showButtons: true }),
  },
  {
    type: "menu-cart",
    label: "سبد کشویی",
    category: "chrome",
    fields: [{ kind: "text", key: "label", label: "برچسب" }],
    create: () => node("menu-cart", { label: "سبد خرید" }),
  },
  {
    type: "linked-products",
    label: "پیشنهاد ارتقا / مکمل",
    category: "parts",
    fields: [
      { kind: "select", key: "type", label: "نوع", options: [{ value: "upsell", label: "پیشنهاد ارتقا (Upsell)" }, { value: "cross_sell", label: "مکمل (Cross-sell)" }] },
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "text", key: "slug", label: "نامک محصول (خالی = محصول همین صفحه)" },
    ],
    create: () => node("linked-products", { type: "upsell" }),
  },
  {
    type: "feed",
    label: "فید اینستاگرام",
    category: "basic",
    fields: [{ kind: "text", key: "title", label: "عنوان" }, { kind: "text", key: "handle", label: "نام کاربری (@)" }, { kind: "url", key: "profileUrl", label: "پیوند پروفایل" }, { kind: "repeater", key: "items", label: "پست‌ها", fields: [{ key: "image", label: "تصویر", kind: "media" }, { key: "href", label: "پیوند پست", kind: "url" }, { key: "caption", label: "توضیح", kind: "text" }] }, { kind: "number", key: "columns", label: "ستون‌ها", min: 2, max: 6 }],
    create: () => node("feed", { title: "ما را در اینستاگرام دنبال کنید", items: "", columns: 4 }),
  },
  {
    type: "price-filter",
    label: "فیلتر قیمت",
    category: "parts",
    fields: [{ kind: "text", key: "title", label: "عنوان" }],
    create: () => node("price-filter", { title: "محدوده قیمت (تومان)" }),
  },
  {
    type: "product-title",
    label: "عنوان محصول",
    category: "parts",
    fields: [{ kind: "text", key: "slug", label: "نامک محصول (خالی = محصول همین صفحه)" }, { kind: "select", key: "tag", label: "سطح", options: [{ value: "h1", label: "H1" }, { value: "h2", label: "H2" }, { value: "h3", label: "H3" }] }],
    create: () => node("product-title", {}),
  },
  {
    type: "product-price",
    label: "قیمت محصول",
    category: "parts",
    fields: [{ kind: "text", key: "slug", label: "نامک محصول (خالی = محصول همین صفحه)" }, { kind: "select", key: "size", label: "اندازه", options: [{ value: "lg", label: "بزرگ" }, { value: "md", label: "معمولی" }] }],
    create: () => node("product-price", {}),
  },
  {
    type: "product-rating",
    label: "امتیاز محصول",
    category: "parts",
    fields: [{ kind: "text", key: "slug", label: "نامک محصول (خالی = محصول همین صفحه)" }],
    create: () => node("product-rating", {}),
  },
  {
    type: "product-stock",
    label: "موجودی محصول",
    category: "parts",
    fields: [{ kind: "text", key: "slug", label: "نامک محصول (خالی = محصول همین صفحه)" }, { kind: "text", key: "inText", label: "متن موجود" }, { kind: "text", key: "outText", label: "متن ناموجود" }, { kind: "number", key: "lowAt", label: "هشدار موجودی کم از", min: 0, max: 100 }],
    create: () => node("product-stock", {}),
  },
  {
    type: "product-attributes",
    label: "ویژگی‌های محصول",
    category: "parts",
    fields: [{ kind: "text", key: "slug", label: "نامک محصول (خالی = محصول همین صفحه)" }],
    create: () => node("product-attributes", {}),
  },
  {
    type: "product-description",
    label: "توضیحات محصول",
    category: "parts",
    fields: [{ kind: "text", key: "slug", label: "نامک محصول (خالی = محصول همین صفحه)" }],
    create: () => node("product-description", {}),
  },
  {
    type: "product-faq",
    label: "سؤالات متداول محصول",
    category: "parts",
    fields: [{ kind: "text", key: "slug", label: "نامک محصول (خالی = محصول همین صفحه)" }],
    create: () => node("product-faq", {}),
  },
  {
    type: "related-products",
    label: "محصولات مرتبط",
    category: "parts",
    fields: [{ kind: "text", key: "slug", label: "نامک محصول (خالی = محصول همین صفحه)" }, { kind: "text", key: "title", label: "عنوان" }, { kind: "number", key: "limit", label: "تعداد", min: 1, max: 24 }, { kind: "select", key: "sort", label: "مرتب‌سازی", options: [{ value: "best_selling", label: "پرفروش" }, { value: "newest", label: "جدید" }, { value: "popular", label: "محبوب" }] }, { kind: "select", key: "layout", label: "چیدمان", options: [{ value: "slider", label: "اسلایدر" }, { value: "grid", label: "شبکه" }] }],
    create: () => node("related-products", { title: "محصولات مرتبط", limit: 8, sort: "best_selling", layout: "slider" }),
  },
  {
    type: "archive-title",
    label: "عنوان آرشیو",
    category: "parts",
    fields: [{ kind: "text", key: "fallback", label: "عنوان صفحه فروشگاه" }],
    create: () => node("archive-title", { fallback: "فروشگاه" }),
  },
  {
    type: "archive-description",
    label: "توضیح دسته",
    category: "parts",
    fields: [{ kind: "textarea", key: "items", label: "نامک دسته|متن در هر خط" }, { kind: "textarea", key: "shopText", label: "متن صفحه فروشگاه (بدون دسته)" }],
    create: () => node("archive-description", {}),
  },
  {
    type: "archive-sort",
    label: "مرتب‌سازی آرشیو",
    category: "parts",
    fields: [],
    create: () => node("archive-sort", {}),
  },
  {
    type: "archive-count",
    label: "تعداد نتایج آرشیو",
    category: "parts",
    fields: [],
    create: () => node("archive-count", {}),
  },
  {
    type: "archive-subcategories",
    label: "زیردسته‌های آرشیو",
    category: "parts",
    fields: [{ kind: "number", key: "limit", label: "تعداد", min: 1, max: 48 }],
    create: () => node("archive-subcategories", { limit: 12 }),
  },
  {
    type: "cart-totals",
    label: "جمع سبد",
    category: "parts",
    fields: [{ kind: "text", key: "title", label: "عنوان" }, { kind: "text", key: "button", label: "متن دکمه" }],
    create: () => node("cart-totals", { title: "خلاصه سبد", button: "ادامه فرایند خرید" }),
  },
  {
    type: "cart-coupon",
    label: "کد تخفیف سبد",
    category: "parts",
    fields: [{ kind: "text", key: "title", label: "عنوان" }],
    create: () => node("cart-coupon", { title: "کد تخفیف" }),
  },
  {
    type: "free-shipping-bar",
    label: "نوار ارسال رایگان",
    category: "parts",
    fields: [{ kind: "number", key: "threshold", label: "حد ارسال رایگان (۰ = تنظیمات قالب)", min: 0, max: 100000000 }, { kind: "text", key: "leftText", label: "متن باقی‌مانده" }, { kind: "text", key: "doneText", label: "متن تکمیل" }],
    create: () => node("free-shipping-bar", { threshold: 0 }),
  },
  {
    type: "site-logo",
    label: "لوگو",
    category: "parts",
    fields: [{ kind: "number", key: "height", label: "ارتفاع (px)", min: 16, max: 160 }],
    create: () => node("site-logo", { height: 40 }),
  },
  {
    type: "nav-menu",
    label: "منوی ناوبری",
    category: "parts",
    fields: [{ kind: "repeater", key: "links", label: "پیوندها", fields: [{ key: "label", label: "برچسب", kind: "text" }, { key: "href", label: "نشانی", kind: "url" }] }, { kind: "select", key: "direction", label: "جهت", options: [{ value: "row", label: "افقی" }, { value: "column", label: "عمودی" }] }],
    create: () => node("nav-menu", { links: "خانه|/\nفروشگاه|/shop\nمجله|/blog", direction: "row" }),
  },
  {
    type: "cart-button",
    label: "دکمه سبد",
    category: "parts",
    fields: [{ kind: "text", key: "label", label: "برچسب" }, { kind: "switch", key: "showLabel", label: "نمایش برچسب" }],
    create: () => node("cart-button", { label: "سبد خرید", showLabel: true }),
  },
  {
    type: "account-button",
    label: "دکمه حساب",
    category: "parts",
    fields: [{ kind: "text", key: "label", label: "برچسب" }],
    create: () => node("account-button", { label: "حساب کاربری" }),
  },
  {
    type: "wishlist-button",
    label: "دکمه علاقه‌مندی",
    category: "parts",
    fields: [],
    create: () => node("wishlist-button", {}),
  },
  {
    type: "phone-link",
    label: "تلفن",
    category: "parts",
    fields: [{ kind: "text", key: "phone", label: "تلفن (خالی = تنظیمات فوتر)" }],
    create: () => node("phone-link", {}),
  },
  {
    type: "footer-links",
    label: "ستون پیوندها",
    category: "parts",
    fields: [{ kind: "text", key: "title", label: "عنوان" }, { kind: "repeater", key: "links", label: "پیوندها", fields: [{ key: "label", label: "برچسب", kind: "text" }, { key: "href", label: "نشانی", kind: "url" }] }],
    create: () => node("footer-links", { title: "دسترسی سریع", links: "" }),
  },
  {
    type: "contact-info",
    label: "اطلاعات تماس",
    category: "parts",
    fields: [{ kind: "text", key: "phone", label: "تلفن" }, { kind: "text", key: "email", label: "ایمیل" }, { kind: "textarea", key: "address", label: "نشانی" }],
    create: () => node("contact-info", {}),
  },
  {
    type: "trust-seals",
    label: "نماد اعتماد",
    category: "parts",
    fields: [],
    create: () => node("trust-seals", {}),
  },
  {
    type: "copyright",
    label: "کپی‌رایت",
    category: "parts",
    fields: [],
    create: () => node("copyright", {}),
  },
  {
    type: "post-title",
    label: "عنوان نوشته",
    category: "parts",
    fields: [],
    create: () => node("post-title", {}),
  },
  {
    type: "post-cover",
    label: "تصویر نوشته",
    category: "parts",
    fields: [],
    create: () => node("post-cover", {}),
  },
  {
    type: "post-meta",
    label: "اطلاعات نوشته",
    category: "parts",
    fields: [],
    create: () => node("post-meta", {}),
  },
  {
    type: "post-content",
    label: "محتوای نوشته",
    category: "parts",
    fields: [],
    create: () => node("post-content", {}),
  },
  ...CONTENT_WIDGETS,
  ...GAP_WIDGETS,
  ...POETRY_WIDGETS,
  ...POETRY_MODULE_WIDGETS,
  ...RESUME_WIDGETS,
  ...POETRY_PAGE_WIDGETS,
]

/** Registry: shared core first, then Dashboard plugins (Iranian commerce). */
const registry = createWidgetRegistry<WidgetDef>(CORE_WIDGETS, (type, plugin) => {
  if (process.env.NODE_ENV !== "production") console.warn(`[builder] widget "${type}" overridden by plugin "${plugin}"`)
})
registry.register(COMMERCE_PLUGIN)

applyChromeExtras(registry.list())
applyNavMenuFields(registry.list())
export const WIDGETS: WidgetDef[] = registry.list()

export function widgetDef(type: string): WidgetDef | undefined {
  return registry.get(type)
}

export function createWidget(type: string): WidgetNode | null {
  const def = registry.get(type)
  return def ? def.create() : null
}


export const WIDGET_CATEGORIES: { id: WidgetDef["category"]; label: string }[] = [
  { id: "layout", label: "چیدمان" },
  { id: "basic", label: "پایه" },
  { id: "content", label: "محتوا و لندینگ" },
  { id: "media", label: "رسانه" },
  { id: "commerce", label: "فروشگاه" },
  { id: "chrome", label: "قالب" },
  { id: "parts", label: "قطعات قالب" },
]
