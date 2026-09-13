# بازاریابی، ربات‌ها و پنل پیامکی

این راهنما پورت بازاریابی را پوشش می‌دهد: کدهای تخفیف، ربات‌های بله/تلگرام (تنظیمات، سشن، پیام همگانی، کمپین) و پروکسی پنل پیامکی ModirPayamak.

## ماژول‌ها

| ماژول | زیرماژول | مسیر ادمین |
|--------|---------|-----------|
| `marketing` | coupons, bot-broadcast, bot-campaigns, sms | `/admin/marketing/*` |
| `bots` | bale, telegram | `/admin/bots/bale` و `/admin/bots/telegram` |
| `sms-panel` | panel | گیت پروکسی `/api/v1/modirpayamak/*` |

پروفایل فروشگاه/کافه/شرکتی: کوپن + ربات + SMS. مجله: فقط خبرنامه.

## کوپن

- CRUD روی `/api/v1/marketing/coupons`
- محدودیت کانال در `restrictions.channels`
- اعمال در `POST /api/v1/checkout` با `coupon_code`

## ربات

- تنظیمات و ارسال تست روی `/api/v1/bots/{provider}/…`
- وب‌هوک عمومی برای ثبت سشن
- صف broadcast با Job و polling حدود ۴ ثانیه در UI

## پیامک

پروکسی authenticated به CRM؛ در نبود لایسنس/CRM پاسخ `unavailable` برمی‌گردد.

## برابری UI با وردپرس

UI ادمین بازاریابی از کلاینت WordPress WebinaDashboard adapt شده (نه iframe جدا):

- تم ادمین نزدیک colorful وردپرس + atmosphere + accentهای کسب‌وکار؛ فونت Yekan Bakh
- کوپن list/editor با پنل‌های General/Usage/Restrictions/Publish
- تمام صفحات SMS با فرم/جدول واقعی (نه JSON dump) و `SmsServiceBanner`
- Broadcast/Campaigns با switcher پروایدر؛ تنظیمات هسته توکن/وب‌هوک/ارسال تست

```bash
php artisan migrate
php artisan queue:work
php artisan test --filter=MarketingBotsSmsApiTest
```
