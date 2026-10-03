# Site builder and ecommerce-ishop

The dashboard page builder and the `ecommerce-ishop` storefront share one widget registry. A published document is the same JSON the public site renders.

## Try it

1. Open **صفحه‌ساز** in the dashboard (`/dashboard/builder`).
2. Choose **فعال‌کردن پوسته آی‌شاپ** so the storefront uses the pink/navy RTL theme.
3. Choose **بارگذاری قالب آی‌شاپ** to create draft pages (home, shop, product, cart, checkout, account) plus header and footer.
4. Open a page, edit on the canvas, then **انتشار**.
5. Visit `/` for the home document, `/shop` for the shop document, and `/product/{slug}` for a product. Until you publish, the ishop theme still renders its built-in documents.

Header and footer are edited at `/dashboard/builder/chrome/header` and `/dashboard/builder/chrome/footer`. Publishing them replaces the theme chrome. If nothing is published, the theme uses the same widgets with its default document.

## Theme builder (پوسته‌ساز)

Open **پوسته‌ساز** at `/dashboard/theme-builder`. Each area can hold several templates: headers, footers, single post, single page, single product, archives, search results, product archive, loop items, and 404. One template per area is the default. Other templates apply only when their include/exclude conditions match (entire site, URL, singular, archive, search, 404). Higher priority wins. Drafts stay off the storefront until **انتشار**.

**کتابخانه** imports ishop and beauty-shop presets, including full starter kits. Applying a preset creates a draft; the first template of a kind becomes the default.

The storefront resolves a published template from the current path (`x-webino-path`) and falls back to the default, then to the theme’s built-in chrome or page.

## Global settings (تنظیمات سراسری)

Site-wide tokens live at `/dashboard/builder/settings`, also linked from the visual builder toolbar and the theme builder. They cover the color palette and semantic colors, font families, H1–H6 / body / small / link scales, button variants, image radius / fit / lazy / lightbox, form fields, container width, gaps, page background, lightbox, and custom CSS variables. Widgets can pick semantic colors (`var(--wb-color-primary)` and the other tokens) in the style panel. Publish copies the draft onto the public site; until then the live storefront keeps the previous published settings.

## Document

Pages are sections, then columns, then widgets. Container widgets can nest another section. Style fields support desktop, tablet, and mobile. Draft JSON lives on `cms_pages.builder_draft`; publish copies it to `builder_published`.

## WordPress

WordPress import can turn Elementor pages into builder documents and open them at `/dashboard/builder`. See `docs/wordpress-import.md`.
