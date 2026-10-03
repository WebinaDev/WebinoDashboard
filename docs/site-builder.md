# Site builder and ecommerce-ishop

The dashboard page builder and the `ecommerce-ishop` storefront share one widget registry. A published document is the same JSON the public site renders.

## Try it

1. Open **صفحه‌ساز** in the dashboard (`/dashboard/builder`).
2. Choose **فعال‌کردن پوسته آی‌شاپ** so the storefront uses the pink/navy RTL theme.
3. Choose **بارگذاری قالب آی‌شاپ** to create draft pages (home, shop, product, cart, checkout, account) plus header and footer.
4. Open a page, edit on the canvas, then **انتشار**.
5. Visit `/` for the home document, `/shop` for the shop document, and `/product/{slug}` for a product. Until you publish, the ishop theme still renders its built-in documents.

Header and footer are edited at `/dashboard/builder/chrome/header` and `/dashboard/builder/chrome/footer`. Publishing them replaces the theme chrome. If nothing is published, the theme uses the same widgets with its default document.

## Document

Pages are sections, then columns, then widgets. Container widgets can nest another section. Style fields support desktop, tablet, and mobile. Draft JSON lives on `cms_pages.builder_draft`; publish copies it to `builder_published`.

## WordPress

WordPress import can turn Elementor pages into builder documents and open them at `/dashboard/builder`. See `docs/wordpress-import.md`.
