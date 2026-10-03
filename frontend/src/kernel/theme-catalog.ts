import type { SiteThemeManifest } from "./theme-types"

function theme(
  slug: string,
  nameFa: string,
  nameEn: string,
  siteTypes: string[],
  isDemo: boolean,
  sortOrder: number,
): SiteThemeManifest {
  return {
    slug,
    nameFa,
    nameEn,
    siteTypes,
    isDemo,
    preview: `/themes/${slug}/preview.svg`,
    sortOrder,
  }
}

export const THEME_MANIFESTS: SiteThemeManifest[] = [
  theme("ecommerce-starter", "فروشگاه - استارتر", "E-commerce starter", ["ecommerce", "coffee"], false, 0),
  theme("ecommerce-default", "فروشگاه - پیش‌فرض", "E-commerce default", ["ecommerce", "coffee"], false, 1),
  theme("ecommerce-demo-v1", "فروشگاه - دمو ۱", "E-commerce demo v1", ["ecommerce", "coffee"], true, 2),
  theme("ecommerce-ishop", "فروشگاه - آی‌شاپ", "E-commerce ishop", ["ecommerce", "coffee"], false, 3),
  theme("magazine-default", "مجله - پیش‌فرض", "Magazine default", ["magazine"], false, 1),
  theme("magazine-demo-v1", "مجله - دمو ۱", "Magazine demo v1", ["magazine"], true, 2),
  theme("cafe-starter", "کافه - استارتر", "Cafe starter", ["cafe"], false, 0),
  theme("cafe-default", "کافه - پیش‌فرض", "Cafe default", ["cafe"], false, 1),
  theme("cafe-demo-v1", "کافه - دمو ۱", "Cafe demo v1", ["cafe"], true, 2),
  theme("cafe-reyhoon", "کافه ریحون", "Cafe Reyhoon", ["cafe"], false, 3),
  theme("cafe-mash-donald", "فست‌فود مَش‌دانالد", "Mash Donald", ["cafe"], true, 4),
  theme("cafe-kerase", "کافه کِراسِه", "Cafe Kerase", ["cafe"], true, 5),
  theme("cafe-super", "سوپر پریمیوم", "Super premium", ["cafe"], true, 6),
  theme("cafe-menew", "منیو برند", "MeNew brand", ["cafe"], true, 7),
  theme("resume-default", "رزومه - پیش‌فرض", "Resume default", ["resume"], false, 1),
  theme("resume-demo-v1", "رزومه - دمو ۱", "Resume demo v1", ["resume"], true, 2),
  theme("corporate-default", "شرکتی - پیش‌فرض", "Corporate default", ["corporate"], false, 1),
  theme("corporate-demo-v1", "شرکتی - دمو ۱", "Corporate demo v1", ["corporate"], true, 2),
]
