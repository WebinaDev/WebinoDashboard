/* Shared builder gap widgets (v0.2): team, media, layout, chrome, auth forms.
 * Schemas/defaults only — renderers stay per platform. */
import { uid } from "./ids"
import type { SharedOption, SharedWidgetDef, SharedWidgetNode } from "./types"

function node(type: string, props: Record<string, unknown>): SharedWidgetNode {
  return { id: uid("w"), type, props }
}

const ALIGN = {
  kind: "select" as const,
  key: "align",
  label: "تراز",
  options: [
    { value: "center", label: "وسط" },
    { value: "start", label: "راست (شروع)" },
    { value: "end", label: "چپ (پایان)" },
  ],
}

const COLUMNS_1_4 = {
  kind: "select" as const,
  key: "columns",
  label: "ستون‌ها",
  options: [
    { value: "1", label: "۱" },
    { value: "2", label: "۲" },
    { value: "3", label: "۳" },
    { value: "4", label: "۴" },
  ],
}

/** Generic team members: collection-backed or manual repeater. */
export function sharedTeamWidget(): SharedWidgetDef {
  return {
    type: "team-grid",
    label: "اعضای تیم",
    category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان (اختیاری)" },
      { kind: "text", key: "collection", label: "نامک کالکشن (خالی = دستی)" },
      {
        kind: "repeater",
        key: "members",
        label: "اعضا (دستی)",
        fields: [
          { key: "name", label: "نام", kind: "text" },
          { key: "role", label: "سمت", kind: "text" },
          { key: "photo", label: "عکس", kind: "media" },
          { key: "quote", label: "جمله", kind: "textarea" },
          { key: "link", label: "پیوند پروفایل", kind: "url" },
        ],
      },
      COLUMNS_1_4,
      {
        kind: "select",
        key: "layout",
        label: "چیدمان",
        options: [
          { value: "grid", label: "گرید کارت" },
          { value: "slider", label: "اسلایدر" },
          { value: "cards", label: "کارت افقی" },
        ],
      },
      ALIGN,
    ],
    create: () =>
      node("team-grid", {
        title: "تیم ما",
        collection: "",
        members: "نام عضو|سمت||نقل‌قول کوتاه|",
        columns: "3",
        layout: "grid",
        align: "center",
      }),
  }
}

/** YouTube + Aparat embed with player options. */
export function sharedVideoEmbedWidget(): SharedWidgetDef {
  return {
    type: "video-embed",
    label: "امبد ویدیو (یوتیوب / آپارات)",
    category: "media",
    fields: [
      { kind: "url", key: "url", label: "نشانی ویدیو (یوتیوب یا آپارات)" },
      { kind: "text", key: "title", label: "عنوان دسترس‌پذیری" },
      { kind: "media", key: "poster", label: "پوستر (اختیاری)", accept: "image" },
      { kind: "switch", key: "autoplay", label: "پخش خودکار (بی‌صدا)" },
      { kind: "switch", key: "muted", label: "بی‌صدا" },
      { kind: "switch", key: "loop", label: "تکرار" },
      { kind: "switch", key: "controls", label: "نمایش کنترل‌ها" },
      {
        kind: "select",
        key: "aspect",
        label: "نسبت تصویر",
        options: [
          { value: "16/9", label: "۱۶:۹" },
          { value: "4/3", label: "۴:۳" },
          { value: "1/1", label: "۱:۱" },
          { value: "9/16", label: "۹:۱۶ (عمودی)" },
        ],
      },
    ],
    create: () =>
      node("video-embed", {
        url: "",
        title: "ویدیو",
        poster: "",
        autoplay: false,
        muted: true,
        loop: false,
        controls: true,
        aspect: "16/9",
      }),
  }
}

export function sharedAudioWidget(): SharedWidgetDef {
  return {
    type: "audio-block",
    label: "بلوک صوت",
    category: "media",
    fields: [
      { kind: "url", key: "src", label: "نشانی فایل صوت" },
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "caption", label: "توضیح" },
      { kind: "switch", key: "autoplay", label: "پخش خودکار" },
      { kind: "switch", key: "loop", label: "تکرار" },
    ],
    create: () => node("audio-block", { src: "", title: "", caption: "", autoplay: false, loop: false }),
  }
}

export function sharedBeforeAfterWidget(): SharedWidgetDef {
  return {
    type: "before-after",
    label: "قبل / بعد",
    category: "media",
    fields: [
      { kind: "media", key: "before", label: "تصویر قبل", accept: "image" },
      { kind: "media", key: "after", label: "تصویر بعد", accept: "image" },
      { kind: "text", key: "beforeLabel", label: "برچسب قبل" },
      { kind: "text", key: "afterLabel", label: "برچسب بعد" },
      {
        kind: "select",
        key: "orientation",
        label: "جهت",
        options: [
          { value: "horizontal", label: "افقی" },
          { value: "vertical", label: "عمودی" },
        ],
      },
      { kind: "number", key: "start", label: "موقعیت اولیه (%)", min: 0, max: 100 },
    ],
    create: () =>
      node("before-after", {
        before: "",
        after: "",
        beforeLabel: "قبل",
        afterLabel: "بعد",
        orientation: "horizontal",
        start: 50,
      }),
  }
}

export function sharedLottieWidget(): SharedWidgetDef {
  return {
    type: "lottie",
    label: "انیمیشن Lottie",
    category: "media",
    fields: [
      { kind: "url", key: "src", label: "نشانی فایل JSON (Lottie)" },
      { kind: "switch", key: "autoplay", label: "پخش خودکار" },
      { kind: "switch", key: "loop", label: "تکرار" },
      { kind: "number", key: "speed", label: "سرعت", min: 0, max: 5 },
      { kind: "text", key: "ariaLabel", label: "برچسب دسترس‌پذیری" },
      { kind: "number", key: "height", label: "ارتفاع (px)", min: 40, max: 800 },
    ],
    create: () => node("lottie", { src: "", autoplay: true, loop: true, speed: 1, ariaLabel: "انیمیشن", height: 200 }),
  }
}

/** Login form shell — platform wires auth submit. */
export function sharedLoginFormWidget(): SharedWidgetDef {
  return {
    type: "login-form",
    label: "فرم ورود",
    category: "basic",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "intro", label: "متن بالای فرم" },
      { kind: "text", key: "submit", label: "دکمه ورود" },
      { kind: "text", key: "registerLabel", label: "متن پیوند ثبت‌نام" },
      { kind: "link", key: "registerHref", label: "پیوند ثبت‌نام" },
      { kind: "text", key: "forgotLabel", label: "متن فراموشی رمز" },
      { kind: "link", key: "forgotHref", label: "پیوند فراموشی رمز" },
      { kind: "switch", key: "showRemember", label: "گزینه «مرا به خاطر بسپار»" },
      { kind: "switch", key: "captcha", label: "کپچا" },
      { kind: "text", key: "success", label: "پیام موفقیت (اختیاری)" },
      { kind: "link", key: "redirect", label: "تغییر مسیر پس از ورود" },
    ],
    create: () =>
      node("login-form", {
        title: "ورود",
        intro: "",
        submit: "ورود",
        registerLabel: "ثبت‌نام",
        registerHref: "/register",
        forgotLabel: "فراموشی رمز عبور",
        forgotHref: "/forgot-password",
        showRemember: true,
        captcha: false,
        success: "",
        redirect: "/account",
      }),
  }
}

/** Register form shell — platform wires auth submit. */
export function sharedRegisterFormWidget(): SharedWidgetDef {
  return {
    type: "register-form",
    label: "فرم ثبت‌نام",
    category: "basic",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "textarea", key: "intro", label: "متن بالای فرم" },
      { kind: "text", key: "submit", label: "دکمه ثبت‌نام" },
      { kind: "text", key: "loginLabel", label: "متن پیوند ورود" },
      { kind: "link", key: "loginHref", label: "پیوند ورود" },
      { kind: "switch", key: "showName", label: "فیلد نام" },
      { kind: "switch", key: "showPhone", label: "فیلد موبایل" },
      { kind: "switch", key: "captcha", label: "کپچا" },
      { kind: "switch", key: "terms", label: "تأیید قوانین" },
      { kind: "text", key: "termsLabel", label: "متن تأیید قوانین" },
      { kind: "link", key: "termsHref", label: "پیوند قوانین" },
      { kind: "text", key: "success", label: "پیام موفقیت" },
      { kind: "link", key: "redirect", label: "تغییر مسیر پس از ثبت‌نام" },
    ],
    create: () =>
      node("register-form", {
        title: "ثبت‌نام",
        intro: "",
        submit: "ایجاد حساب",
        loginLabel: "قبلاً حساب دارید؟ ورود",
        loginHref: "/login",
        showName: true,
        showPhone: true,
        captcha: false,
        terms: true,
        termsLabel: "قوانین و شرایط را می‌پذیرم",
        termsHref: "/pages/terms",
        success: "حساب شما ساخته شد.",
        redirect: "/account",
      }),
  }
}

/** Nested section shell (platforms create column children in their own create()). */
export function sharedSectionWidget(): SharedWidgetDef {
  return {
    type: "section",
    label: "سکشن (چند ستون)",
    category: "layout",
    fields: [
      { kind: "text", key: "label", label: "نام در ناوبری ادیتور" },
      {
        kind: "select",
        key: "columnPreset",
        label: "پیش‌فرض ستون‌ها",
        options: [
          { value: "12", label: "۱ ستون" },
          { value: "6-6", label: "۲ ستون مساوی" },
          { value: "4-4-4", label: "۳ ستون" },
          { value: "3-3-3-3", label: "۴ ستون" },
          { value: "4-8", label: "۱/۳ + ۲/۳" },
          { value: "8-4", label: "۲/۳ + ۱/۳" },
        ],
      },
      { kind: "switch", key: "fullWidth", label: "تمام‌عرض" },
      {
        kind: "select",
        key: "display",
        label: "حالت چیدمان فرزندان",
        options: [
          { value: "grid", label: "گرید" },
          { value: "flex", label: "فلکس" },
          { value: "block", label: "بلاک" },
        ],
      },
      { kind: "switch", key: "bgVideo", label: "ویدیوی پس‌زمینه (از پیشرفتهٔ سکشن)" },
    ],
    create: () => node("section", { label: "سکشن", columnPreset: "6-6", fullWidth: false, display: "grid", bgVideo: false }),
  }
}

export function sharedColumnsWidget(): SharedWidgetDef {
  return {
    type: "columns",
    label: "ردیف ستون‌ها (تو در تو)",
    category: "layout",
    fields: [
      {
        kind: "select",
        key: "columnPreset",
        label: "تعداد ستون",
        options: [
          { value: "6-6", label: "۲" },
          { value: "4-4-4", label: "۳" },
          { value: "3-3-3-3", label: "۴" },
          { value: "4-8", label: "۱/۳ + ۲/۳" },
          { value: "8-4", label: "۲/۳ + ۱/۳" },
        ],
      },
      { kind: "number", key: "gap", label: "فاصله (px)", min: 0, max: 80 },
      {
        kind: "select",
        key: "stackOn",
        label: "چیدمان زیر هم از",
        options: [
          { value: "mobile", label: "موبایل" },
          { value: "tablet", label: "تبلت" },
          { value: "never", label: "هرگز" },
        ],
      },
    ],
    create: () => node("columns", { columnPreset: "6-6", gap: 24, stackOn: "mobile" }),
  }
}

export function sharedOffCanvasWidget(): SharedWidgetDef {
  return {
    type: "off-canvas",
    label: "آف‌بوم (پنل کناری)",
    category: "layout",
    fields: [
      { kind: "text", key: "title", label: "عنوان پنل" },
      { kind: "text", key: "triggerLabel", label: "متن دکمه باز کردن" },
      {
        kind: "select",
        key: "side",
        label: "سمت",
        options: [
          { value: "start", label: "شروع (راست در RTL)" },
          { value: "end", label: "پایان (چپ در RTL)" },
        ],
      },
      {
        kind: "select",
        key: "width",
        label: "عرض",
        options: [
          { value: "sm", label: "کم" },
          { value: "md", label: "متوسط" },
          { value: "lg", label: "زیاد" },
          { value: "full", label: "تمام‌صفحه" },
        ],
      },
      { kind: "textarea", key: "body", label: "محتوای متنی (ساده)" },
      { kind: "text", key: "ctaLabel", label: "دکمه داخل پنل" },
      { kind: "link", key: "ctaHref", label: "پیوند دکمه" },
    ],
    create: () =>
      node("off-canvas", {
        title: "منو",
        triggerLabel: "باز کردن",
        side: "start",
        width: "md",
        body: "",
        ctaLabel: "",
        ctaHref: "",
      }),
  }
}

export function sharedFlexContainerWidget(): SharedWidgetDef {
  return {
    type: "flex-container",
    label: "کانتینر فلکس",
    category: "layout",
    fields: [
      { kind: "text", key: "label", label: "نام" },
      {
        kind: "select",
        key: "direction",
        label: "جهت",
        options: [
          { value: "row", label: "افقی" },
          { value: "column", label: "عمودی" },
          { value: "row-reverse", label: "افقی معکوس" },
          { value: "column-reverse", label: "عمودی معکوس" },
        ],
      },
      {
        kind: "select",
        key: "justify",
        label: "توزیع افقی",
        options: [
          { value: "start", label: "شروع" },
          { value: "center", label: "وسط" },
          { value: "end", label: "پایان" },
          { value: "space-between", label: "فاصله یکنواخت" },
          { value: "space-around", label: "اطراف" },
        ],
      },
      {
        kind: "select",
        key: "align",
        label: "تراز عمودی",
        options: [
          { value: "start", label: "شروع" },
          { value: "center", label: "وسط" },
          { value: "end", label: "پایان" },
          { value: "stretch", label: "کشیده" },
        ],
      },
      {
        kind: "select",
        key: "wrap",
        label: "شکستن خط",
        options: [
          { value: "wrap", label: "بله" },
          { value: "nowrap", label: "خیر" },
        ],
      },
      { kind: "number", key: "gap", label: "فاصله (px)", min: 0, max: 80 },
    ],
    create: () =>
      node("flex-container", { label: "فلکس", direction: "row", justify: "start", align: "stretch", wrap: "wrap", gap: 16 }),
  }
}

export function sharedGridContainerWidget(): SharedWidgetDef {
  return {
    type: "grid-container",
    label: "کانتینر گرید",
    category: "layout",
    fields: [
      { kind: "text", key: "label", label: "نام" },
      { kind: "number", key: "columns", label: "تعداد ستون", min: 1, max: 12 },
      { kind: "text", key: "template", label: "قالب ستون (مثلاً 2fr 1fr)" },
      { kind: "number", key: "gap", label: "فاصله (px)", min: 0, max: 80 },
    ],
    create: () => node("grid-container", { label: "گرید", columns: 2, template: "", gap: 16 }),
  }
}

export function sharedSiteHeaderWidget(): SharedWidgetDef {
  return {
    type: "site-header",
    label: "هدر عمومی سایت",
    category: "chrome",
    fields: [
      { kind: "media", key: "logo", label: "لوگو", accept: "image" },
      { kind: "text", key: "siteName", label: "نام سایت (جایگزین لوگو)" },
      {
        kind: "repeater",
        key: "links",
        label: "پیوندهای منو",
        fields: [
          { key: "label", label: "برچسب", kind: "text" },
          { key: "href", label: "نشانی", kind: "url" },
        ],
      },
      { kind: "text", key: "ctaLabel", label: "دکمه CTA" },
      { kind: "link", key: "ctaHref", label: "پیوند CTA" },
      { kind: "switch", key: "sticky", label: "چسبان به بالا" },
      {
        kind: "select",
        key: "tone",
        label: "ظاهر",
        options: [
          { value: "light", label: "روشن" },
          { value: "dark", label: "تیره" },
          { value: "transparent", label: "شفاف" },
        ],
      },
    ],
    create: () =>
      node("site-header", {
        logo: "",
        siteName: "",
        links: "خانه|/\nدرباره|/about\nتماس|/contact",
        ctaLabel: "شروع کنید",
        ctaHref: "/consultation",
        sticky: true,
        tone: "light",
      }),
  }
}

export function sharedSiteFooterWidget(): SharedWidgetDef {
  return {
    type: "site-footer",
    label: "فوتر عمومی سایت",
    category: "chrome",
    fields: [
      { kind: "media", key: "logo", label: "لوگو", accept: "image" },
      { kind: "textarea", key: "blurb", label: "متن معرفی کوتاه" },
      {
        kind: "repeater",
        key: "columns",
        label: "ستون‌های پیوند",
        fields: [
          { key: "title", label: "عنوان ستون", kind: "text" },
          { key: "links", label: "پیوندها (برچسب|نشانی هر خط)", kind: "textarea" },
        ],
      },
      {
        kind: "repeater",
        key: "socials",
        label: "شبکه‌های اجتماعی",
        fields: [
          { key: "network", label: "شبکه", kind: "text" },
          { key: "href", label: "پیوند", kind: "url" },
        ],
      },
      { kind: "text", key: "copyright", label: "متن کپی‌رایت" },
      {
        kind: "select",
        key: "tone",
        label: "ظاهر",
        options: [
          { value: "light", label: "روشن" },
          { value: "dark", label: "تیره" },
        ],
      },
    ],
    create: () =>
      node("site-footer", {
        logo: "",
        blurb: "",
        columns: "محصولات|فروشگاه|/shop\nشرکت|درباره|/about",
        socials: "instagram|\nlinkedin|",
        copyright: "© همه حقوق محفوظ است.",
        tone: "dark",
      }),
  }
}

/** All gap widgets (team + media + layout + chrome + auth). */
export function sharedGapWidgets(_iconOptions: SharedOption[] = []): SharedWidgetDef[] {
  return [
    sharedTeamWidget(),
    sharedVideoEmbedWidget(),
    sharedAudioWidget(),
    sharedBeforeAfterWidget(),
    sharedLottieWidget(),
    sharedLoginFormWidget(),
    sharedRegisterFormWidget(),
    sharedSectionWidget(),
    sharedColumnsWidget(),
    sharedOffCanvasWidget(),
    sharedFlexContainerWidget(),
    sharedGridContainerWidget(),
    sharedSiteHeaderWidget(),
    sharedSiteFooterWidget(),
  ]
}
