# LinkHub (لینک کوتاه)

ماژول `link-hub` یک صفحهٔ لینک‌در‌بیو روی ساب‌دامین جدا (پیشفرض `contact`) برای هر سایت مشتری فراهم می‌کند.

## URL

| سطح | مثال |
|-----|------|
| صفحهٔ اصلی کسب‌وکار | `https://contact.shop.example.com/` |
| پروفایل عضو | `https://contact.shop.example.com/amir` |
| مدیریت | `https://shop.example.com/dashboard/link-hub` |

برچسب ساب‌دامین از **لینک کوتاه → تنظیمات** قابل تغییر است (مثلاً `bio` → `bio.shop.example.com`).

## DNS و SSL (اپراتور)

1. دامنهٔ اصلی سایت از قبل روی سرور پلتفرم باشد.
2. برای alias یک رکورد **A/AAAA** به **همان IP سرور** بسازید: `{alias}.{primary-domain}`.
3. پس از ذخیرهٔ برچسب ساب‌دامین، Dashboard از طریق HMAC به ERP می‌گوید Caddy را بازنویسی کند (`POST /api/v1/site-builder/sync/alias`).
4. Caddy برای hostname جدید گواهی Let's Encrypt می‌گیرد (پورت ۸۰/۴۴۳ باز باشد).

ERP Site Builder نیز فیلد `alias_subdomain` را روی provision نگه می‌دارد و هنگام launch/changeDomain آن را در snippet چند-host می‌نویسد.

## فعال‌سازی

- در پروفایل‌های site type (ecommerce، cafe، coffee، resume، corporate) ماژول پیشفرض است.
- برای سایت‌های قدیمی: از کنترل سایت ERP ماژول `link-hub` را فعال کنید یا `TenantActivationService::applySiteType` را دوباره اجرا کنید.

## بلاک‌های فاز ۱

`link` · `contact` · `form` · `faq` · `event`

- پاسخ فرم‌ها / هماهنگی‌ها: `/dashboard/link-hub/inbox`
- آمار بازدید و کلیک (۳۰ روز): `/dashboard/link-hub`
- رویدادها در این فاز فقط بلاک نمایشی/CTA هستند؛ رزرو تقویمی در فاز ۲ می‌آید.
