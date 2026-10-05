import type { BuilderDocument, ColumnNode, SectionNode, WidgetNode } from "../types"

function w(id: string, type: string, props: Record<string, unknown> = {}): WidgetNode {
  return { id, type, props }
}

function col(id: string, span: number, widgets: WidgetNode[], mobileSpan = 12): ColumnNode {
  return { id, span, mobileSpan, widgets }
}

function sec(id: string, columns: ColumnNode[], fullWidth = false, padding?: string): SectionNode {
  return {
    id,
    fullWidth,
    columns,
    style: padding ? { base: { padding: { top: padding, bottom: padding } } } : undefined,
  }
}

function doc(sections: SectionNode[]): BuilderDocument {
  return { version: 1, sections }
}

const NAV = "خانه|/\nفروشگاه|/shop\nتازه‌ها|/shop?sort=new\nمجله|/blog\nدرباره|/pages/about"

export function classicHeaderDocument(siteName = "ویبینو"): BuilderDocument {
  return doc([
    sec("sec_header", [
      col("col_header", 12, [w("w_header", "store-header", { mark: siteName, links: NAV })]),
    ], true),
  ])
}

export function classicFooterDocument(siteName = "ویبینو"): BuilderDocument {
  return doc([
    sec("sec_footer", [
      col("col_footer", 12, [w("w_footer", "store-footer", {
        phone: "۰۲۱۹۱۰۹۱۰۹۱",
        email: "hello@webino.shop",
        about: `${siteName} گالری مراقبت و آرایش است؛ انتخاب کوتاه، توضیح روشن، و فروش روی وبینو. این متن نمونه ویبینو است.`,
      })]),
    ], true),
  ])
}

export function classicHomeDocument(): BuilderDocument {
  return doc([
    sec("sec_hero", [col("col_hero", 12, [w("w_hero", "hero-slider")])]),
    sec("sec_mega", [col("col_mega", 12, [w("w_mega", "mega-menu", { columns: "مراقبت|/shop?category=skin\nآرایش|/shop?category=makeup\nمو|/shop?category=hair" })])]),
    sec("sec_offers", [col("col_offers", 12, [w("w_offers", "amazing-offers", { title: "پیشنهادهای شگفت‌انگیز" })])]),
    sec("sec_taste", [col("col_taste", 12, [w("w_taste", "taste-box", { title: "بر اساس سلیقه شما" })])]),
    sec("sec_deal", [col("col_deal", 12, [w("w_deal", "deal-bar", { title: "پیشنهاد امروز ویبینو" })])]),
    sec("sec_cats", [col("col_cats", 12, [w("w_cats", "category-grid", { title: "دسته‌بندی‌های محبوب", variant: "popular" })])]),
    sec("sec_new", [col("col_new", 12, [w("w_new", "product-grid", { title: "محصولات تازه", limit: 4, source: "new" })])]),
    sec("sec_promo", [
      col("col_promo_a", 7, [w("w_promo", "promo-banner", {
        title: "هدیه مراقبت پوست",
        text: "با سفارش از مجموعه ویبینو، یک نمونه کوچک همراه بسته می‌آید.",
        cta: "دیدن فروشگاه",
        href: "/shop",
        tone: "pink",
      })]),
      col("col_promo_b", 5, [w("w_count", "countdown", { title: "تا پایان پیشنهاد بهار" })]),
    ]),
    sec("sec_best", [col("col_best", 12, [w("w_best", "product-grid", { title: "پرفروش‌های ویبینو", limit: 3, source: "featured" })])]),
    sec("sec_brands", [col("col_brands", 12, [w("w_brands", "brand-row", { title: "خانه‌های ویبینو" })])]),
    sec("sec_blog", [col("col_blog", 12, [w("w_blog", "blog-slider", { title: "از مجله ویبینو" })])]),
    sec("sec_trust", [
      col("col_trust", 12, [
        w("w_trust", "trust-badges"),
        w("w_news", "newsletter", { title: "تازه‌های ویبینو", text: "تخفیف مجموعه را در ایمیل بگیرید." }),
      ]),
    ]),
  ])
}

export function classicShopDocument(): BuilderDocument {
  return doc([
    sec("sec_shop_bc", [col("col_shop_bc", 12, [w("w_shop_bc", "breadcrumbs", { trail: "خانه|/\nفروشگاه|/shop" })])]),
    sec("sec_shop_head", [
      col("col_shop_head", 12, [
        w("w_shop_title", "heading", { text: "فروشگاه ویبینو", tag: "h1" }),
        w("w_shop_cats", "category-grid", { title: "خرید بر اساس دسته", variant: "strip" }),
      ]),
    ]),
    sec("sec_shop_grid", [
      col("col_filters", 3, [w("w_filters", "filter-panel")], 12),
      col("col_grid", 9, [w("w_grid", "product-grid", { title: "همه محصولات", limit: 9, source: "all", showSort: true })], 12),
    ]),
  ])
}

export function classicProductDocument(): BuilderDocument {
  return doc([
    sec("sec_pdp", [col("col_pdp", 12, [w("w_pdp", "product-detail")])]),
    sec("sec_reviews", [col("col_reviews", 12, [w("w_reviews", "product-reviews")])]),
    sec("sec_related", [col("col_related", 12, [w("w_related", "product-grid", { title: "پیشنهادهای همراه", limit: 4, source: "related" })])]),
    sec("sec_package", [col("col_package", 12, [w("w_package", "package-block", { title: "پکیج مکمل", text: "محصولات مرتبط با قیمت مناسب‌تر" })])]),
    sec("sec_most", [col("col_most", 12, [w("w_most", "most-viewed", { title: "پربازدیدترین‌ها", limit: 3 })])]),
  ])
}

export function classicCartDocument(): BuilderDocument {
  return doc([
    sec("sec_cart_bc", [col("col_cart_bc", 12, [w("w_cart_bc", "breadcrumbs", { trail: "خانه|/\nسبد خرید|/cart" })])]),
    sec("sec_cart", [
      col("col_cart", 12, [
        w("w_cart_title", "heading", { text: "سبد خرید", tag: "h1" }),
        w("w_cart", "cart-lines"),
      ]),
    ]),
  ])
}

export function classicCheckoutDocument(): BuilderDocument {
  return doc([
    sec("sec_checkout_bc", [col("col_checkout_bc", 12, [w("w_checkout_bc", "breadcrumbs", { trail: "خانه|/\nسبد|/cart\nتسویه|/checkout" })])]),
    sec("sec_checkout", [col("col_checkout", 12, [w("w_checkout", "checkout")])]),
  ])
}

export function classicAccountDocument(): BuilderDocument {
  return doc([
    sec("sec_account_bc", [col("col_account_bc", 12, [w("w_account_bc", "breadcrumbs", { trail: "خانه|/\nحساب کاربری|/account" })])]),
    sec("sec_account", [
      col("col_account", 12, [
        w("w_account_title", "heading", { text: "حساب ویبینو", tag: "h1" }),
        w("w_account", "account-dashboard"),
      ]),
    ]),
  ])
}

export function classicNotFoundDocument(): BuilderDocument {
  return doc([
    sec("sec_404", [
      col("col_404", 12, [
        w("w_404_title", "heading", { text: "این صفحه پیدا نشد", tag: "h1" }),
        w("w_404_text", "text", { text: "نشانی را دوباره بررسی کنید یا به فروشگاه ویبینو برگردید." }),
        w("w_404_btn", "button", { label: "بازگشت به خانه", href: "/", tone: "pink" }),
      ]),
    ]),
  ])
}

export const CLASSIC_PAGE_TEMPLATES: { slug: string; title: string; document: BuilderDocument }[] = [
  { slug: "home", title: "خانه", document: classicHomeDocument() },
  { slug: "shop", title: "فروشگاه", document: classicShopDocument() },
  { slug: "product", title: "محصول", document: classicProductDocument() },
  { slug: "cart", title: "سبد خرید", document: classicCartDocument() },
  { slug: "checkout", title: "تسویه", document: classicCheckoutDocument() },
  { slug: "account", title: "حساب کاربری", document: classicAccountDocument() },
]

export function previewHref(slug: string): string {
  if (slug === "home") return "/"
  if (slug === "product") return "/product/lumen-serum"
  return `/${slug}`
}
