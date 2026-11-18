/* Cafe / restaurant / bakery landing widgets. Renderers: render/cafe-widgets.tsx */
import { uid } from "./ids"
import type { FieldDef, WidgetDef, WidgetNode } from "./types"

function node(type: string, props: Record<string, unknown>): WidgetNode {
  return { id: uid("w"), type, props }
}

const tone: FieldDef = {
  kind: "select",
  key: "tone",
  label: "زمینه برند",
  options: [
    { value: "saloon", label: "سالن غربی (لیمبو)" },
    { value: "bakery", label: "نانوایی گرم (لاینا)" },
    { value: "espresso", label: "اسپرسو تیره" },
    { value: "light", label: "روشن خنثی" },
  ],
}

const SECTION_BG: FieldDef[] = [
  { kind: "media", key: "bgImage", label: "تصویر پس‌زمینه", accept: "image" },
  { kind: "color", key: "bgOverlay", label: "رنگ روکش" },
  { kind: "slider", key: "bgOverlayOpacity", label: "شفافیت روکش", min: 0, max: 100, step: 5, unit: "%" },
]

export const CAFE_WIDGET_TYPES = [
  "cafe-hero",
  "cafe-menu-board",
  "cafe-hours",
  "cafe-gallery",
  "cafe-story",
  "cafe-reserve-cta",
  "cafe-category-strip",
] as const

export const CAFE_WIDGETS: WidgetDef[] = [
  {
    type: "cafe-hero",
    label: "هیرو کافه (تمام‌عرض)",
    category: "content",
    fields: [
      { kind: "text", key: "eyebrow", label: "برچسب بالا" },
      { kind: "text", key: "title", label: "عنوان برند" },
      { kind: "textarea", key: "text", label: "جمله کوتاه" },
      { kind: "text", key: "primaryLabel", label: "دکمه اصلی" },
      { kind: "link", key: "primaryHref", label: "پیوند دکمه اصلی" },
      { kind: "text", key: "secondaryLabel", label: "دکمه دوم" },
      { kind: "link", key: "secondaryHref", label: "پیوند دکمه دوم" },
      { kind: "media", key: "logo", label: "لوگو", accept: "image" },
      { kind: "media", key: "image", label: "تصویر هیرو", accept: "image" },
      {
        kind: "select",
        key: "layout",
        label: "چیدمان",
        options: [
          { value: "overlay", label: "تصویر تمام‌عرض + متن روی تصویر" },
          { value: "split", label: "متن + تصویر کنار هم" },
        ],
      },
      tone,
      ...SECTION_BG,
      { kind: "switch", key: "fullBleed", label: "تمام‌عرض لبه به لبه" },
      { kind: "switch", key: "motion", label: "انیمیشن ورود" },
    ],
    create: () =>
      node("cafe-hero", {
        eyebrow: "کافه و رستوران",
        title: "LIMBO",
        text: "قهوه تخصصی، برگر دست‌ساز و فضای سالن غربی.",
        primaryLabel: "منوی دیجیتال",
        primaryHref: "/menu",
        secondaryLabel: "رزرو میز",
        secondaryHref: "/reservations",
        logo: "",
        image: "",
        layout: "overlay",
        tone: "saloon",
        fullBleed: true,
        motion: true,
      }),
  },
  {
    type: "cafe-menu-board",
    label: "تابلوی منو کافه",
    category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان بخش" },
      { kind: "textarea", key: "subtitle", label: "زیرعنوان" },
      {
        kind: "select",
        key: "source",
        label: "منبع",
        options: [
          { value: "live", label: "خودکار از کاتالوگ کافه" },
          { value: "manual", label: "ردیف‌های دستی" },
        ],
      },
      { kind: "number", key: "count", label: "حداکثر آیتم", min: 4, max: 48 },
      { kind: "text", key: "category", label: "فیلتر نامک دسته (اختیاری)" },
      { kind: "link", key: "menuHref", label: "پیوند «همه منو»" },
      { kind: "text", key: "menuLabel", label: "متن دکمه منو" },
      {
        kind: "select",
        key: "layout",
        label: "چیدمان",
        options: [
          { value: "board", label: "تابلوی قیمت کلاسیک" },
          { value: "cards", label: "کارت‌های تصویری" },
          { value: "bakery", label: "شبکه نانوایی" },
        ],
      },
      {
        kind: "repeater",
        key: "items",
        label: "آیتم‌های دستی",
        fields: [
          { key: "title", label: "نام", kind: "text" },
          { key: "price", label: "قیمت", kind: "text" },
          { key: "desc", label: "توضیح", kind: "text" },
          { key: "category", label: "دسته", kind: "text" },
          { key: "image", label: "تصویر", kind: "media" },
        ],
      },
      tone,
      { kind: "switch", key: "motion", label: "انیمیشن" },
    ],
    create: () =>
      node("cafe-menu-board", {
        title: "منوی امروز",
        subtitle: "تازه‌ترین‌ها از پیشخوان",
        source: "live",
        count: 12,
        category: "",
        menuHref: "/menu",
        menuLabel: "مشاهده کامل منو",
        layout: "board",
        items: "",
        tone: "saloon",
        motion: true,
      }),
  },
  {
    type: "cafe-hours",
    label: "ساعت کاری کافه",
    category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "note", label: "یادداشت" },
      {
        kind: "select",
        key: "source",
        label: "منبع",
        options: [
          { value: "live", label: "از تنظیمات کافه" },
          { value: "manual", label: "دستی" },
        ],
      },
      { kind: "textarea", key: "days", label: "روزها (روز|باز|بسته در هر خط)" },
      { kind: "text", key: "phone", label: "تلفن" },
      { kind: "text", key: "address", label: "آدرس" },
      tone,
      { kind: "switch", key: "motion", label: "انیمیشن" },
    ],
    create: () =>
      node("cafe-hours", {
        title: "ساعت کاری",
        note: "رزرو میز برای گروه‌های بالای ۶ نفر پیشنهاد می‌شود.",
        source: "live",
        days: "",
        phone: "",
        address: "",
        tone: "saloon",
        motion: true,
      }),
  },
  {
    type: "cafe-gallery",
    label: "گالری فضای کافه",
    category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "subtitle", label: "زیرعنوان" },
      {
        kind: "select",
        key: "source",
        label: "منبع",
        options: [
          { value: "live", label: "گالری ماژول کافه" },
          { value: "manual", label: "تصاویر دستی" },
        ],
      },
      {
        kind: "repeater",
        key: "images",
        label: "تصاویر دستی",
        fields: [
          { key: "url", label: "تصویر", kind: "media" },
          { key: "caption", label: "شرح", kind: "text" },
        ],
      },
      tone,
      { kind: "switch", key: "motion", label: "انیمیشن" },
    ],
    create: () =>
      node("cafe-gallery", {
        title: "فضای سالن",
        subtitle: "نور گرم، چوب تیره، میزهای کنار پنجره",
        source: "live",
        images: "",
        tone: "saloon",
        motion: true,
      }),
  },
  {
    type: "cafe-story",
    label: "داستان / سرآشپز کافه",
    category: "content",
    fields: [
      { kind: "text", key: "eyebrow", label: "برچسب" },
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "text", label: "متن داستان" },
      { kind: "media", key: "image", label: "تصویر", accept: "image" },
      { kind: "text", key: "imageAlt", label: "متن جایگزین" },
      {
        kind: "select",
        key: "source",
        label: "متن خودکار",
        options: [
          { value: "manual", label: "فقط متن ویجت" },
          { value: "venue", label: "ترکیب با دربارهٔ کافه" },
        ],
      },
      tone,
      ...SECTION_BG,
      { kind: "switch", key: "motion", label: "انیمیشن" },
    ],
    create: () =>
      node("cafe-story", {
        eyebrow: "داستان ما",
        title: "از یک اسپرسو تا یک سالن",
        text: "لیمبو با عشق به قهوه تازه و غذای دست‌ساز در واوان شروع شد.",
        image: "",
        imageAlt: "",
        source: "venue",
        tone: "saloon",
        motion: true,
      }),
  },
  {
    type: "cafe-reserve-cta",
    label: "فراخوان رزرو میز",
    category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "text", label: "متن" },
      { kind: "text", key: "primaryLabel", label: "دکمه رزرو" },
      { kind: "link", key: "primaryHref", label: "پیوند رزرو" },
      { kind: "text", key: "secondaryLabel", label: "دکمه تماس" },
      { kind: "link", key: "secondaryHref", label: "پیوند تماس" },
      tone,
      ...SECTION_BG,
      { kind: "switch", key: "motion", label: "انیمیشن" },
    ],
    create: () =>
      node("cafe-reserve-cta", {
        title: "میزتان را از قبل رزرو کنید",
        text: "برای عصرهای شلوغ و جمع‌های دوستانه، یک تماس کافی است.",
        primaryLabel: "رزرو آنلاین",
        primaryHref: "/reservations",
        secondaryLabel: "تماس",
        secondaryHref: "tel:02156288677",
        tone: "saloon",
        motion: true,
      }),
  },
  {
    type: "cafe-category-strip",
    label: "نوار دسته‌های منو",
    category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      {
        kind: "select",
        key: "source",
        label: "منبع",
        options: [
          { value: "live", label: "دسته‌های کاتالوگ" },
          { value: "manual", label: "دستی" },
        ],
      },
      {
        kind: "repeater",
        key: "items",
        label: "دسته‌های دستی",
        fields: [
          { key: "title", label: "نام", kind: "text" },
          { key: "href", label: "پیوند", kind: "url" },
          { key: "image", label: "تصویر", kind: "media" },
        ],
      },
      { kind: "link", key: "baseHref", label: "پایه پیوند ({slug})" },
      tone,
      { kind: "switch", key: "motion", label: "انیمیشن" },
    ],
    create: () =>
      node("cafe-category-strip", {
        title: "از کجا شروع کنیم؟",
        source: "live",
        items: "",
        baseHref: "/menu?category={slug}",
        tone: "saloon",
        motion: true,
      }),
  },
]
