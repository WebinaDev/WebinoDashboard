/* Premium academy / education landing widgets (shared by all tenants).
 * Renderers: render/academy-widgets.tsx. Category: academy. */
import { uid } from "./ids"
import type { FieldDef, WidgetDef, WidgetNode } from "./types"

function node(type: string, props: Record<string, unknown>): WidgetNode {
  return { id: uid("w"), type, props }
}

const tone: FieldDef = {
  kind: "select",
  key: "tone",
  label: "زمینه",
  options: [
    { value: "blush", label: "صورتی روشن (برند گتابی)" },
    { value: "ocean", label: "آبی اقیانوسی (آکادمی زبان)" },
    { value: "ocean-deep", label: "اقیانوس تیره (CTA)" },
    { value: "light", label: "سفید خنثی" },
    { value: "ink", label: "سرمه‌ای تیره (گتابی)" },
    { value: "transparent", label: "شفاف" },
  ],
}

const SECTION_BG: FieldDef[] = [
  { kind: "media", key: "bgImage", label: "تصویر پس‌زمینه", accept: "image" },
  { kind: "color", key: "bgOverlay", label: "رنگ روکش" },
  { kind: "slider", key: "bgOverlayOpacity", label: "شفافیت روکش", min: 0, max: 100, step: 5, unit: "%" },
]

export const ACADEMY_WIDGET_TYPES = [
  "academy-hero",
  "course-grid",
  "instructor-grid",
  "curriculum-timeline",
  "enroll-cta",
  "academy-stats",
  "logo-cloud",
] as const

export const ACADEMY_WIDGETS: WidgetDef[] = [
  {
    type: "academy-hero",
    label: "هیرو آکادمی (تمام‌عرض)",
    category: "content",
    fields: [
      { kind: "text", key: "eyebrow", label: "برچسب بالا" },
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "text", label: "متن کوتاه" },
      { kind: "text", key: "primaryLabel", label: "دکمه اصلی" },
      { kind: "link", key: "primaryHref", label: "پیوند دکمه اصلی" },
      { kind: "text", key: "secondaryLabel", label: "دکمه دوم" },
      { kind: "link", key: "secondaryHref", label: "پیوند دکمه دوم" },
      { kind: "media", key: "image", label: "تصویر/پرتره هیرو", accept: "image" },
      { kind: "text", key: "imageAlt", label: "متن جایگزین تصویر" },
      {
        kind: "select",
        key: "layout",
        label: "چیدمان",
        options: [
          { value: "split", label: "متن + تصویر کنار هم" },
          { value: "overlay", label: "تصویر تمام‌عرض پشت متن" },
          { value: "centered", label: "متن وسط بدون تصویر کناری" },
        ],
      },
      {
        kind: "repeater",
        key: "stats",
        label: "آمار سریع زیر هیرو",
        fields: [
          { key: "value", label: "عدد", kind: "text" },
          { key: "label", label: "برچسب", kind: "text" },
        ],
      },
      tone,
      ...SECTION_BG,
      { kind: "switch", key: "fullBleed", label: "تمام‌عرض لبه به لبه" },
      { kind: "switch", key: "motion", label: "انیمیشن ورود" },
    ],
    create: () =>
      node("academy-hero", {
        eyebrow: "آکادمی زبان",
        title: "مسیر روان صحبت کردن را با ما بسازید",
        text: "دوره‌های هدفمند مکالمه، آیلتس و آمادگی آزمون با اساتید باتجربه.",
        primaryLabel: "مشاهده دوره‌ها",
        primaryHref: "/academy",
        secondaryLabel: "مشاوره رایگان",
        secondaryHref: "/pages/contact",
        image: "",
        imageAlt: "",
        layout: "split",
        stats: "۱۳+|سال تجربه\n۵۰۰+|زبان‌آموز\n۴.۹|رضایت",
        tone: "blush",
        fullBleed: true,
        motion: true,
        mobileFullWidth: true,
      }),
  },
  {
    type: "course-grid",
    label: "شبکه دوره‌ها",
    category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان بخش" },
      { kind: "textarea", key: "subtitle", label: "زیرعنوان" },
      {
        kind: "select",
        key: "source",
        label: "منبع",
        options: [
          { value: "live", label: "خودکار از ماژول آکادمی" },
          { value: "manual", label: "ردیف‌های دستی" },
        ],
      },
      { kind: "number", key: "count", label: "تعداد (خودکار)", min: 1, max: 24 },
      { kind: "link", key: "detailHref", label: "الگوی پیوند دوره ({slug})" },
      {
        kind: "repeater",
        key: "items",
        label: "دوره‌های دستی",
        fields: [
          { key: "title", label: "عنوان", kind: "text" },
          { key: "level", label: "سطح", kind: "text" },
          { key: "meta", label: "مدت/جلسات", kind: "text" },
          { key: "price", label: "قیمت", kind: "text" },
          { key: "image", label: "تصویر", kind: "media" },
          { key: "href", label: "پیوند", kind: "url" },
          { key: "badge", label: "برچسب", kind: "text" },
        ],
      },
      { kind: "text", key: "moreLabel", label: "متن همه دوره‌ها" },
      { kind: "link", key: "moreHref", label: "پیوند همه دوره‌ها" },
      { kind: "number", key: "columns", label: "ستون‌ها", min: 1, max: 4 },
      tone,
      ...SECTION_BG,
    ],
    create: () =>
      node("course-grid", {
        title: "دوره‌های پیشنهادی",
        subtitle: "از مبتدی تا پیشرفته — مسیر یادگیری شفاف",
        source: "live",
        count: 6,
        detailHref: "/academy/{slug}",
        items: "مکالمه روزمره|A2–B1|۱۲ جلسه|—||/academy|محبوب\nآیلتس آکادمیک|B2+|۱۶ جلسه|—||/academy|آزمون\nانگلیسی کسب‌وکار|B1–B2|۱۰ جلسه|—||/academy|",
        moreLabel: "همه دوره‌ها",
        moreHref: "/academy",
        columns: 3,
        tone: "light",
      }),
  },
  {
    type: "instructor-grid",
    label: "اساتید آکادمی",
    category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان بخش" },
      { kind: "textarea", key: "subtitle", label: "زیرعنوان" },
      {
        kind: "repeater",
        key: "items",
        label: "اساتید",
        fields: [
          { key: "name", label: "نام", kind: "text" },
          { key: "role", label: "نقش/تخصص", kind: "text" },
          { key: "creds", label: "مدارک", kind: "text" },
          { key: "bio", label: "بیو کوتاه", kind: "text" },
          { key: "photo", label: "عکس", kind: "media" },
          { key: "href", label: "پیوند", kind: "url" },
        ],
      },
      { kind: "number", key: "columns", label: "ستون‌ها", min: 1, max: 4 },
      tone,
      ...SECTION_BG,
    ],
    create: () =>
      node("instructor-grid", {
        title: "اساتید",
        subtitle: "تجربه واقعی کلاس و آزمون",
        items: "ساناز گتابی|مدرس زبان انگلیسی|TTC عالی|۱۳ سال آموزش از مبتدی تا آیلتس||/pages/teachers",
        columns: 3,
        tone: "blush",
      }),
  },
  {
    type: "curriculum-timeline",
    label: "مسیر یادگیری (کوریکولوم)",
    category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان بخش" },
      { kind: "textarea", key: "subtitle", label: "زیرعنوان" },
      {
        kind: "repeater",
        key: "items",
        label: "مراحل",
        fields: [
          { key: "title", label: "عنوان", kind: "text" },
          { key: "text", label: "توضیح", kind: "text" },
          { key: "meta", label: "برچسب کنار", kind: "text" },
        ],
      },
      tone,
      ...SECTION_BG,
      { kind: "switch", key: "motion", label: "انیمیشن اسکرول" },
    ],
    create: () =>
      node("curriculum-timeline", {
        title: "مسیر یادگیری",
        subtitle: "از ارزیابی تا تسلط — قدم‌به‌قدم",
        items: "ارزیابی سطح|تعیین نقطه شروع واقعی|هفته ۱\nطرح اختصاصی|برنامه متناسب با هدف شما|هفته ۱\nکلاس‌های تعاملی|مکالمه، بازخورد، تکالیف هدفمند|هفته‌های بعد\nآزمون و گواهی|سنجش پیشرفت و مسیر ادامه|پایان دوره",
        tone: "light",
        motion: true,
      }),
  },
  {
    type: "enroll-cta",
    label: "فراخوان ثبت‌نام / قیمت",
    category: "content",
    fields: [
      { kind: "text", key: "eyebrow", label: "برچسب" },
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "text", label: "متن" },
      { kind: "text", key: "price", label: "قیمت نمایشی" },
      { kind: "text", key: "priceNote", label: "توضیح قیمت" },
      { kind: "text", key: "primaryLabel", label: "دکمه اصلی" },
      { kind: "link", key: "primaryHref", label: "پیوند دکمه اصلی" },
      { kind: "text", key: "secondaryLabel", label: "دکمه دوم" },
      { kind: "link", key: "secondaryHref", label: "پیوند دکمه دوم" },
      {
        kind: "repeater",
        key: "perks",
        label: "مزایا",
        fields: [{ key: "text", label: "متن", kind: "text" }],
      },
      tone,
      ...SECTION_BG,
      { kind: "switch", key: "fullBleed", label: "تمام‌عرض" },
    ],
    create: () =>
      node("enroll-cta", {
        eyebrow: "شروع کنید",
        title: "همین ترم جایتان را رزرو کنید",
        text: "ظرفیت کلاس‌های خصوصی و نیمه‌خصوصی محدود است.",
        price: "",
        priceNote: "پس از مشاوره سطح، شهریه اعلام می‌شود",
        primaryLabel: "درخواست مشاوره",
        primaryHref: "/pages/contact",
        secondaryLabel: "مشاهده دوره‌ها",
        secondaryHref: "/academy",
        perks: "جلسه مشاوره رایگان\nبرنامه شخصی‌سازی‌شده\nپشتیبانی بین جلسات",
        tone: "ink",
        fullBleed: true,
      }),
  },
  {
    type: "academy-stats",
    label: "آمار آکادمی",
    category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان (اختیاری)" },
      {
        kind: "repeater",
        key: "items",
        label: "آمار",
        fields: [
          { key: "value", label: "عدد", kind: "text" },
          { key: "label", label: "برچسب", kind: "text" },
          { key: "hint", label: "توضیح کوچک", kind: "text" },
        ],
      },
      tone,
      ...SECTION_BG,
      { kind: "switch", key: "motion", label: "انیمیشن شمارش" },
    ],
    create: () =>
      node("academy-stats", {
        title: "",
        items: "۱۳+|سال تدریس|از ۱۳۹۰\n۵۰۰+|زبان‌آموز|گروه‌های سنی مختلف\n۴.۹|رضایت|از بازخورد کلاس‌ها\n۲|زبان رابط|فارسی و انگلیسی",
        tone: "light",
        motion: true,
      }),
  },
  {
    type: "logo-cloud",
    label: "لوگوها / اعتماد",
    category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      {
        kind: "repeater",
        key: "items",
        label: "لوگوها",
        fields: [
          { key: "name", label: "نام", kind: "text" },
          { key: "image", label: "لوگو", kind: "media" },
          { key: "href", label: "پیوند", kind: "url" },
        ],
      },
      tone,
      { kind: "switch", key: "marquee", label: "حرکت آرام افقی" },
    ],
    create: () =>
      node("logo-cloud", {
        title: "همکاری و گواهی‌ها",
        items: "TTC||\nIELTS||\nTOEFL||",
        tone: "transparent",
        marquee: true,
      }),
  },
]

for (const d of ACADEMY_WIDGETS) {
  if (!d.fields.some((f) => "key" in f && f.key === "mobileFullWidth")) {
    d.fields.push({ kind: "switch", key: "mobileFullWidth", label: "تمام‌عرض در موبایل" })
  }
}
