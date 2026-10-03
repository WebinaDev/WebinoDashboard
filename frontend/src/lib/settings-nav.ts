export type SettingsArea = "site" | "shop"

export type SettingsUnitId =
  | "site-general"
  | "site-security"
  | "site-ai"
  | "site-analytics"
  | "site-sms"
  | "site-notifications"
  | "site-pwa"
  | "site-dashboard"
  | "site-themes"
  | "shop-general"
  | "shop-accounting"
  | "shop-bots"
  | "shop-marketplace"
  | "shop-pricing"
  | "shop-shipping"
  | "shop-payments"
  | "shop-invoices"
  | "shop-advanced"

export type SettingsSectionDef = {
  id: string
  titleFa: string
  titleEn: string
  route: string
}

export type SettingsUnitDef = {
  id: SettingsUnitId
  area: SettingsArea
  titleFa: string
  titleEn: string
  sections: SettingsSectionDef[]
}

/** Card strip order matches WordPress hub + user-specified module order. */
export const SETTINGS_UNITS: SettingsUnitDef[] = [
  {
    id: "site-general",
    area: "site",
    titleFa: "عمومی سایت",
    titleEn: "Site general",
    sections: [
      {
        id: "general",
        titleFa: "عمومی",
        titleEn: "General",
        route: "/dashboard/settings/site/general",
      },
      {
        id: "privacy",
        titleFa: "حریم خصوصی",
        titleEn: "Privacy",
        route: "/dashboard/settings/site/privacy",
      },
      {
        id: "license",
        titleFa: "لایسنس",
        titleEn: "License",
        route: "/dashboard/license",
      },
      {
        id: "wordpress-import",
        titleFa: "درون‌ریزی وردپرس",
        titleEn: "WordPress import",
        route: "/dashboard/import/wordpress",
      },
      {
        id: "style",
        titleFa: "استایل و برند",
        titleEn: "Brand & style",
        route: "/dashboard/settings/site/style",
      },
      {
        id: "system-logs",
        titleFa: "لاگ سیستم",
        titleEn: "System logs",
        route: "/dashboard/settings/site/system-logs",
      },
    ],
  },
  {
    id: "site-security",
    area: "site",
    titleFa: "امنیت",
    titleEn: "Security",
    sections: [
      {
        id: "security",
        titleFa: "امنیت",
        titleEn: "Security",
        route: "/dashboard/settings/site/security",
      },
    ],
  },
  {
    id: "site-ai",
    area: "site",
    titleFa: "محتوای هوش مصنوعی",
    titleEn: "AI content",
    sections: [
      {
        id: "ai",
        titleFa: "تنظیمات AI",
        titleEn: "AI settings",
        route: "/dashboard/settings/site/ai",
      },
    ],
  },
  {
    id: "site-analytics",
    area: "site",
    titleFa: "آمار",
    titleEn: "Analytics",
    sections: [
      {
        id: "analytics",
        titleFa: "آمار و ردیابی",
        titleEn: "Analytics",
        route: "/dashboard/settings/site/analytics",
      },
    ],
  },
  {
    id: "site-sms",
    area: "site",
    titleFa: "پنل پیامکی",
    titleEn: "SMS panel",
    sections: [
      {
        id: "sms",
        titleFa: "پیامک سایت",
        titleEn: "Site SMS",
        route: "/dashboard/settings/site/sms",
      },
    ],
  },
  {
    id: "site-notifications",
    area: "site",
    titleFa: "اعلان‌ها",
    titleEn: "Notifications",
    sections: [
      {
        id: "notifications",
        titleFa: "اعلان‌ها و ایمیل",
        titleEn: "Notifications & email",
        route: "/dashboard/settings/site/notifications",
      },
    ],
  },
  {
    id: "site-pwa",
    area: "site",
    titleFa: "PWA",
    titleEn: "PWA",
    sections: [
      {
        id: "pwa",
        titleFa: "اپ پیش‌رونده",
        titleEn: "Progressive Web App",
        route: "/dashboard/settings/site/pwa",
      },
    ],
  },
  {
    id: "site-dashboard",
    area: "site",
    titleFa: "داشبورد",
    titleEn: "Dashboard",
    sections: [
      {
        id: "dashboard",
        titleFa: "به‌روزرسانی و ساخت",
        titleEn: "Updates & build",
        route: "/dashboard/settings/site/dashboard",
      },
    ],
  },
  {
    id: "site-themes",
    area: "site",
    titleFa: "تم سایت",
    titleEn: "Site theme",
    sections: [
      {
        id: "themes",
        titleFa: "تم سایت",
        titleEn: "Site theme",
        route: "/dashboard/themes",
      },
    ],
  },
  {
    id: "shop-general",
    area: "shop",
    titleFa: "تنظیمات عمومی",
    titleEn: "General",
    sections: [
      {
        id: "general",
        titleFa: "عمومی",
        titleEn: "General",
        route: "/dashboard/settings/shop/general",
      },
      {
        id: "products",
        titleFa: "محصولات / موجودی",
        titleEn: "Products / Inventory",
        route: "/dashboard/settings/shop/products",
      },
      {
        id: "downloads",
        titleFa: "دانلودها",
        titleEn: "Downloads",
        route: "/dashboard/settings/shop/downloads",
      },
      {
        id: "reviews",
        titleFa: "دیدگاه‌ها",
        titleEn: "Reviews",
        route: "/dashboard/settings/shop/reviews",
      },
      {
        id: "maps",
        titleFa: "نقشه",
        titleEn: "Map",
        route: "/dashboard/settings/shop/maps",
      },
      {
        id: "loyalty",
        titleFa: "باشگاه مشتریان",
        titleEn: "Loyalty",
        route: "/dashboard/settings/shop/loyalty",
      },
      {
        id: "archive",
        titleFa: "بایگانی و فیلتر",
        titleEn: "Archive & filters",
        route: "/dashboard/settings/shop/archive",
      },
    ],
  },
  {
    id: "shop-accounting",
    area: "shop",
    titleFa: "حسابداری",
    titleEn: "Accounting",
    sections: [
      {
        id: "tax",
        titleFa: "مالیات",
        titleEn: "Tax",
        route: "/dashboard/settings/shop/accounting/tax",
      },
      {
        id: "modian",
        titleFa: "مودیان",
        titleEn: "Tax authority",
        route: "/dashboard/settings/shop/accounting/modian",
      },
    ],
  },
  {
    id: "shop-bots",
    area: "shop",
    titleFa: "ربات‌ها",
    titleEn: "Bots",
    sections: [
      {
        id: "bale",
        titleFa: "بله",
        titleEn: "Bale",
        route: "/dashboard/settings/shop/bots/bale",
      },
      {
        id: "telegram",
        titleFa: "تلگرام",
        titleEn: "Telegram",
        route: "/dashboard/settings/shop/bots/telegram",
      },
    ],
  },
  {
    id: "shop-marketplace",
    area: "shop",
    titleFa: "مارکت‌ها",
    titleEn: "Marketplaces",
    sections: [
      {
        id: "marketplace",
        titleFa: "همه مارکت‌ها",
        titleEn: "All marketplaces",
        route: "/dashboard/settings/shop/marketplace",
      },
      {
        id: "marketplace-basalam",
        titleFa: "باسلام",
        titleEn: "Basalam",
        route: "/dashboard/settings/shop/marketplace/basalam",
      },
      {
        id: "marketplace-digikala",
        titleFa: "دیجی‌کالا",
        titleEn: "Digikala",
        route: "/dashboard/settings/shop/marketplace/digikala",
      },
      {
        id: "marketplace-snappshop",
        titleFa: "اسنپ‌شاپ",
        titleEn: "SnappShop",
        route: "/dashboard/settings/shop/marketplace/snappshop",
      },
      {
        id: "marketplace-tapsishop",
        titleFa: "تپسی‌شاپ",
        titleEn: "TapsiShop",
        route: "/dashboard/settings/shop/marketplace/tapsishop",
      },
      {
        id: "marketplace-technolife",
        titleFa: "تکنولایف",
        titleEn: "Technolife",
        route: "/dashboard/settings/shop/marketplace/technolife",
      },
      {
        id: "marketplace-emalls",
        titleFa: "ایمالز",
        titleEn: "Emalls",
        route: "/dashboard/settings/shop/marketplace/emalls",
      },
      {
        id: "marketplace-torob",
        titleFa: "ترب",
        titleEn: "Torob",
        route: "/dashboard/settings/shop/marketplace/torob",
      },
      {
        id: "marketplace-zarehbin",
        titleFa: "ذره‌بین",
        titleEn: "Zarehbin",
        route: "/dashboard/settings/shop/marketplace/zarehbin",
      },
      {
        id: "marketplace-snapppay-search",
        titleFa: "جستجوی اسنپ‌پی",
        titleEn: "SnappPay Search",
        route: "/dashboard/settings/shop/marketplace/snapppay-search",
      },
    ],
  },
  {
    id: "shop-pricing",
    area: "shop",
    titleFa: "قیمت‌گذاری",
    titleEn: "Pricing",
    sections: [
      {
        id: "pricing",
        titleFa: "قیمت‌گذاری",
        titleEn: "Pricing",
        route: "/dashboard/settings/shop/pricing",
      },
    ],
  },
  {
    id: "shop-shipping",
    area: "shop",
    titleFa: "حمل و نقل",
    titleEn: "Shipping",
    sections: [
      {
        id: "zones",
        titleFa: "مناطق ارسال",
        titleEn: "Zones",
        route: "/dashboard/settings/shop/shipping/zones",
      },
      {
        id: "tapin",
        titleFa: "تاپین",
        titleEn: "Tapin",
        route: "/dashboard/settings/shop/shipping/tapin",
      },
    ],
  },
  {
    id: "shop-payments",
    area: "shop",
    titleFa: "درگاه پرداخت",
    titleEn: "Payments",
    sections: [
      {
        id: "gateways",
        titleFa: "درگاه‌های پرداخت",
        titleEn: "Payment gateways",
        route: "/dashboard/settings/shop/gateways",
      },
      {
        id: "payments",
        titleFa: "درگاه‌ها",
        titleEn: "Gateways",
        route: "/dashboard/settings/shop/payments",
      },
      {
        id: "zarinpal",
        titleFa: "زرین‌پال",
        titleEn: "Zarinpal",
        route: "/dashboard/settings/shop/zarinpal",
      },
      {
        id: "digipay",
        titleFa: "دیجی‌پی",
        titleEn: "Digipay",
        route: "/dashboard/settings/shop/digipay",
      },
      {
        id: "snapppay",
        titleFa: "اسنپ‌پی",
        titleEn: "SnappPay",
        route: "/dashboard/settings/shop/snapppay",
      },
      {
        id: "torobpay",
        titleFa: "ترب‌پی",
        titleEn: "TorobPay",
        route: "/dashboard/settings/shop/torobpay",
      },
      {
        id: "bale-pay",
        titleFa: "بله پی",
        titleEn: "Bale Pay",
        route: "/dashboard/settings/shop/bale-pay",
      },
      {
        id: "wallet",
        titleFa: "کیف پول",
        titleEn: "Wallet",
        route: "/dashboard/settings/shop/wallet",
      },
      {
        id: "c2c",
        titleFa: "کارت به کارت",
        titleEn: "Card to card",
        route: "/dashboard/settings/shop/c2c",
      },
    ],
  },
  {
    id: "shop-invoices",
    area: "shop",
    titleFa: "فاکتورها",
    titleEn: "Invoices",
    sections: [
      {
        id: "invoices",
        titleFa: "فاکتورها",
        titleEn: "Invoices",
        route: "/dashboard/settings/shop/invoices",
      },
    ],
  },
  {
    id: "shop-advanced",
    area: "shop",
    titleFa: "پیشرفته",
    titleEn: "Advanced",
    sections: [
      {
        id: "advanced",
        titleFa: "پیشرفته",
        titleEn: "Advanced",
        route: "/dashboard/settings/shop/advanced",
      },
    ],
  },
]

function matchesRoute(path: string, route: string): boolean {
  return path === route || path.startsWith(route + "/")
}

export function findUnitByPath(pathname: string): SettingsUnitDef | undefined {
  const path = pathname.replace(/\/$/, "")
  return SETTINGS_UNITS.find((u) =>
    u.sections.some((s) => matchesRoute(path, s.route))
  )
}

export function activeSectionForPath(
  unit: SettingsUnitDef,
  pathname: string
): SettingsSectionDef | undefined {
  const path = pathname.replace(/\/$/, "")
  const matches = unit.sections.filter((s) => matchesRoute(path, s.route))
  return (
    matches.sort((a, b) => b.route.length - a.route.length)[0] ?? unit.sections[0]
  )
}

export function defaultSettingsPath(): string {
  return SETTINGS_UNITS[0]?.sections[0]?.route ?? "/dashboard/settings/site/security"
}
