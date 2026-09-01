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
  theme("ecommerce-default", "فروشگاه — پیش‌فرض", "E-commerce default", ["ecommerce"], false, 1),
  theme("ecommerce-demo-v1", "فروشگاه — دمو ۱", "E-commerce demo v1", ["ecommerce"], true, 2),
  theme("magazine-default", "مجله — پیش‌فرض", "Magazine default", ["magazine"], false, 1),
  theme("magazine-demo-v1", "مجله — دمو ۱", "Magazine demo v1", ["magazine"], true, 2),
  theme("cafe-default", "کافه — پیش‌فرض", "Cafe default", ["cafe"], false, 1),
  theme("cafe-demo-v1", "کافه — دمو ۱", "Cafe demo v1", ["cafe"], true, 2),
  theme("resume-default", "رزومه — پیش‌فرض", "Resume default", ["resume"], false, 1),
  theme("resume-demo-v1", "رزومه — دمو ۱", "Resume demo v1", ["resume"], true, 2),
  theme("corporate-default", "شرکتی — پیش‌فرض", "Corporate default", ["corporate"], false, 1),
  theme("corporate-demo-v1", "شرکتی — دمو ۱", "Corporate demo v1", ["corporate"], true, 2),
]
