# انتقال کد فروشگاه به ماژول Commerce

ماژول `modules/Commerce` (namespace `Modules\Commerce`، autoload از `composer.json` → `Modules\\` → `modules/`) خانه‌ی کد فروشگاه است.

## انجام‌شده
- فرانت: `modules/commerce/components/{orders,payments,products,coupons}`.
- بک‌اند (برش اول): `CouponController` → `Modules\Commerce\Http\Controllers\CouponController`. مسیرها همان `routes/api.php` با همان URLها.

## روش هر برش (بدون شکستن autoload/route)
1. `git mv` کنترلر به `modules/Commerce/Http/Controllers/` و عوض کردن namespace؛ کلاس‌های هم‌namespace قبلی را صریح `use` کنید.
2. فقط `use` بالای `routes/api.php` عوض شود؛ URL و نام route ثابت می‌ماند.
3. `php -l`، `php artisan route:list --path=…` و تست‌های Feature همان بخش.
4. بعد از دیپلوی: `composer dump-autoload -o` (داخل بیلد ایمیج) و `php artisan route:cache`.

## ترتیب پیشنهادی بعدی
1. کنترلرهای کاتالوگ: Brand، Category، ProductTag، ProductAttribute، ProductVariant، ProductModifier.
2. Product*، ProductCatalog، ProductReview/Question/Story/Compare/Download/Engagement/Report.
3. Cart، PublicGuestCart، AbandonedCart، Checkout، ShippingZones.
4. Order، OrderDocument، PaymentIntent، PaymentCallback، PublicOrderPayment، PaymentsHub، PaymentGatewaySettings، Wallet.
5. سرویس‌ها (`app/Services/Coupons`، …) و در آخر مدل‌ها؛ مدل‌ها چون در morph map، observerها و relationها با FQCN ذخیره می‌شوند، با `class_alias` قدیمی منتقل شوند و هر `*_type` ذخیره‌شده در دیتابیس بررسی شود.
6. جدا کردن `Route::` های فروشگاه به `modules/Commerce/Routes/api.php` که از `CommerceServiceProvider` با همان prefix/middleware لود شود.
