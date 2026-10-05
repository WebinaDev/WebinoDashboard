import { uid } from "./ids"
import { createSection } from "./tree"
import type { WidgetDef, WidgetNode } from "./types"

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

export const WIDGETS: WidgetDef[] = [
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
      { kind: "url", key: "src", label: "نشانی تصویر" },
      { kind: "text", key: "alt", label: "متن جایگزین" },
    ],
    create: () => node("image", { src: "", alt: "تصویر ویبینو" }),
  },
  {
    type: "button",
    label: "دکمه",
    category: "basic",
    fields: [
      { kind: "text", key: "label", label: "برچسب" },
      { kind: "url", key: "href", label: "پیوند" },
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
    fields: [{ kind: "url", key: "src", label: "نشانی ویدیو" }],
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
    fields: [{ kind: "textarea", key: "links", label: "پیوندها (برچسب|نشانی)" }],
    create: () => node("menu", { links: "خانه|/\nفروشگاه|/shop\nحساب|/account" }),
  },
  {
    type: "form",
    label: "فرم",
    category: "basic",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "text", key: "submit", label: "دکمه" },
    ],
    create: () => node("form", { title: "پیام به ویبینو", submit: "ارسال" }),
  },
  {
    type: "hero-slider",
    label: "اسلایدر هیرو",
    category: "commerce",
    fields: [{ kind: "text", key: "eyebrow", label: "برچسب اسلاید اول" }],
    create: () => node("hero-slider", {}),
  },
  {
    type: "category-grid",
    label: "شبکه دسته‌ها",
    category: "commerce",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "select", key: "variant", label: "حالت", options: [
        { value: "popular", label: "محبوب" },
        { value: "strip", label: "نوار" },
      ] },
    ],
    create: () => node("category-grid", { title: "دسته‌بندی‌های محبوب", variant: "popular" }),
  },
  {
    type: "product-grid",
    label: "شبکه محصول",
    category: "commerce",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "number", key: "limit", label: "تعداد", min: 1, max: 12 },
      { kind: "select", key: "source", label: "منبع", options: [
        { value: "new", label: "تازه‌ها" },
        { value: "featured", label: "پرفروش" },
        { value: "related", label: "مرتبط" },
        { value: "all", label: "همه" },
      ] },
      { kind: "switch", key: "showSort", label: "مرتب‌سازی" },
    ],
    create: () => node("product-grid", { title: "محصولات تازه", limit: 4, source: "new", showSort: false }),
  },
  {
    type: "product-card",
    label: "کارت محصول",
    category: "commerce",
    fields: [{ kind: "text", key: "slug", label: "نامک محصول" }],
    create: () => node("product-card", { slug: "" }),
  },
  {
    type: "promo-banner",
    label: "بنر تبلیغ",
    category: "commerce",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "text", label: "متن" },
      { kind: "text", key: "cta", label: "دکمه" },
      { kind: "url", key: "href", label: "پیوند" },
      { kind: "select", key: "tone", label: "زمینه", options: [
        { value: "pink", label: "صورتی" },
        { value: "navy", label: "سرمه‌ای" },
        { value: "mist", label: "روشن" },
      ] },
    ],
    create: () => node("promo-banner", {
      title: "هدیه مراقبت پوست",
      text: "با خرید از مجموعه ویبینو، نمونه کوچک همراه سفارش می‌آید.",
      cta: "جزئیات",
      href: "/shop",
      tone: "pink",
    }),
  },
  {
    type: "deal-bar",
    label: "نوار پیشنهاد",
    category: "commerce",
    fields: [{ kind: "text", key: "title", label: "عنوان" }],
    create: () => node("deal-bar", { title: "پیشنهاد امروز ویبینو" }),
  },
  {
    type: "countdown",
    label: "شمارش معکوس",
    category: "commerce",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "text", key: "ends", label: "پایان (ISO)" },
    ],
    create: () => node("countdown", { title: "تا پایان پیشنهاد", ends: "" }),
  },
  {
    type: "trust-badges",
    label: "نشان اعتماد",
    category: "commerce",
    fields: [],
    create: () => node("trust-badges", {}),
  },
  {
    type: "newsletter",
    label: "خبرنامه",
    category: "commerce",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "text", key: "text", label: "توضیح" },
    ],
    create: () => node("newsletter", { title: "تازه‌های ویبینو", text: "تخفیف‌های مجموعه را در ایمیل بگیرید." }),
  },
  {
    type: "brand-row",
    label: "ردیف برند",
    category: "commerce",
    fields: [{ kind: "text", key: "title", label: "عنوان" }],
    create: () => node("brand-row", { title: "خانه‌های ویبینو" }),
  },
  {
    type: "blog-teasers",
    label: "مجله",
    category: "commerce",
    fields: [{ kind: "text", key: "title", label: "عنوان" }],
    create: () => node("blog-teasers", { title: "از مجله ویبینو" }),
  },
  {
    type: "filter-panel",
    label: "فیلتر فروشگاه",
    category: "commerce",
    fields: [],
    create: () => node("filter-panel", {}),
  },
  {
    type: "product-detail",
    label: "جزئیات محصول",
    category: "commerce",
    fields: [],
    create: () => node("product-detail", {}),
  },
  {
    type: "cart-lines",
    label: "سبد خرید",
    category: "commerce",
    fields: [],
    create: () => node("cart-lines", {}),
  },
  {
    type: "checkout-stub",
    label: "تسویه",
    category: "commerce",
    fields: [],
    create: () => node("checkout-stub", {}),
  },
  {
    type: "account-stub",
    label: "حساب کاربری",
    category: "commerce",
    fields: [],
    create: () => node("account-stub", {}),
  },
  {
    type: "account-dashboard",
    label: "پیشخوان حساب",
    category: "commerce",
    fields: [],
    create: () => node("account-dashboard", {}),
  },
  {
    type: "product-reviews",
    label: "دیدگاه محصول",
    category: "commerce",
    fields: [{ kind: "text", key: "slug", label: "نامک (اختیاری)" }],
    create: () => node("product-reviews", {}),
  },
  {
    type: "breadcrumbs",
    label: "مسیر راهنما",
    category: "commerce",
    fields: [{ kind: "textarea", key: "trail", label: "برچسب|نشانی در هر خط" }],
    create: () => node("breadcrumbs", { trail: "خانه|/\nفروشگاه|/shop" }),
  },
  {
    type: "store-header",
    label: "سربرگ فروشگاه",
    category: "chrome",
    fields: [
      { kind: "text", key: "mark", label: "نشان" },
      { kind: "textarea", key: "links", label: "منو (برچسب|نشانی)" },
    ],
    create: () => node("store-header", { mark: "ویبینو", links: "" }),
  },
  {
    type: "taste-box",
    label: "باکس سلیقه",
    category: "commerce",
    fields: [{ kind: "text", key: "title", label: "عنوان" }],
    create: () => node("taste-box", { title: "پیشنهاد برای سلیقه شما" }),
  },
  {
    type: "package-block",
    label: "پکیج محصول",
    category: "commerce",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "text", label: "توضیح" },
      { kind: "url", key: "href", label: "پیوند" },
    ],
    create: () => node("package-block", { title: "پکیج ویژه", text: "", href: "/shop" }),
  },
  {
    type: "blog-toc",
    label: "فهرست مطالب",
    category: "commerce",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "items", label: "عنوان|#anchor در هر خط" },
    ],
    create: () => node("blog-toc", { title: "فهرست مطالب", items: "" }),
  },
  {
    type: "most-viewed",
    label: "پربازدیدترین",
    category: "commerce",
    fields: [{ kind: "number", key: "limit", label: "تعداد", min: 1, max: 12 }],
    create: () => node("most-viewed", { limit: 6 }),
  },
  {
    type: "mega-menu",
    label: "مگامنو",
    category: "chrome",
    fields: [{ kind: "textarea", key: "columns", label: "ستون‌ها (عنوان|لینک)" }],
    create: () => node("mega-menu", { columns: "محصولات|/shop\nتخفیف|/amazing-offers" }),
  },
  {
    type: "amazing-offers",
    label: "پیشنهاد شگفت‌انگیز",
    category: "commerce",
    fields: [{ kind: "text", key: "title", label: "عنوان" }],
    create: () => node("amazing-offers", { title: "پیشنهادهای شگفت‌انگیز" }),
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
    create: () => node("store-footer", { phone: "۰۲۱۹۱۰۹۱۰۹۱", email: "hello@webino.shop", about: "" }),
  },
]

const byType = new Map(WIDGETS.map((widget) => [widget.type, widget]))

export function widgetDef(type: string): WidgetDef | undefined {
  return byType.get(type)
}

export function createWidget(type: string): WidgetNode | null {
  const def = byType.get(type)
  return def ? def.create() : null
}

export const WIDGET_CATEGORIES: { id: WidgetDef["category"]; label: string }[] = [
  { id: "layout", label: "چیدمان" },
  { id: "basic", label: "پایه" },
  { id: "commerce", label: "فروشگاه" },
  { id: "chrome", label: "قالب" },
]
