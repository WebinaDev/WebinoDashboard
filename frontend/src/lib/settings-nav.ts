export type SettingsArea = "site" | "shop"

export type SettingsUnitId =
  | "site-security"
  | "site-ai"
  | "site-analytics"
  | "site-sms"
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
    titleFa: "بازارچه",
    titleEn: "Marketplace",
    sections: [
      {
        id: "marketplace",
        titleFa: "بازارچه",
        titleEn: "Marketplace",
        route: "/dashboard/settings/shop/marketplace",
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

export function findUnitByPath(pathname: string): SettingsUnitDef | undefined {
  const path = pathname.replace(/\/$/, "")
  return SETTINGS_UNITS.find((u) =>
    u.sections.some((s) => path === s.route || path.startsWith(s.route + "/"))
  )
}

export function activeSectionForPath(
  unit: SettingsUnitDef,
  pathname: string
): SettingsSectionDef | undefined {
  const path = pathname.replace(/\/$/, "")
  return (
    unit.sections.find((s) => path === s.route || path.startsWith(s.route + "/")) ??
    unit.sections[0]
  )
}

export function defaultSettingsPath(): string {
  return SETTINGS_UNITS[0]?.sections[0]?.route ?? "/dashboard/settings/site/security"
}
