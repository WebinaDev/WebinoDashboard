# ممیزی کامل هم‌ترازی داشبورد وردپرسی ↔ WebinoDashboard

سند کاری برای رساندن `WebinoDashboard` (Next + Laravel) به هم‌ترازی کامل با داشبورد وردپرسی.

- **مرجع (WP):** `/mnt/Mine/Projects/Webina/Webina/Plugins/Wordpress/WebinaDashboard`
  - `client/src` = اپ React (SPA)، `includes/` = REST و منطق PHP، `Modules/` = ماژول‌های افزودنی
- **هدف (TARGET):** `/mnt/Mine/Projects/Webina/Webina/Plugins/Webina/WebinoDashboard`
  - `frontend/src`، `frontend/modules/<module>/{manifest.ts,admin/*,site/*}`، `frontend/messages/{fa,en}.json`، `backend/app/...`، `backend/routes/api.php`
- **ERP:** `/mnt/Mine/Projects/Webina/Webina/Plugins/Webina/WebinoERP`



## قوانین پایه این ممیزی

1. هر چیزی که در WP هست باید در TARGET باشد — با همان **UI، جزئیات، قوانین، امکانات و فیچرها**.
2. **تنها تفاوت مجاز:** هرجا WP با افزونهٔ وردپرسی «WebinaCRM» حرف می‌زند، TARGET باید با **ERP اختصاصی** سینک شود.
3. اگر TARGET چیزی را **واقعاً بهتر** پیاده کرده، نگه داشته می‌شود (فهرستش در انتهای سند آمده) — ولی «بهتر» نباید بهانهٔ «ناقص» باشد.
4. هیچ نام فروشنده‌ای (`ModirPayamak`, `IPPanel`, `WebinaCRM`, `مدیرپیامک`) نباید در UI دیده شود؛ سرویس پیامک باید مثل یک سرویس داخلی داشبورد به نظر برسد.
5. هیچ «به‌زودی / coming soon / placeholder» در UI نهایی نباید بماند.
6. هیچ رشتهٔ انگلیسی hardcode در UI فارسی نباید بماند؛ همه‌چیز از `messages/fa.json` و `en.json`.



## راهنمای وضعیت‌ها


| نشان           | معنی                                      |
| -------------- | ----------------------------------------- |
| `ندارد`        | در TARGET اصلاً وجود ندارد                |
| `ناقص`         | هست ولی کم‌عمق‌تر از WP                   |
| `اشتباه`       | هست ولی رفتار/داده/مسیرش غلط است          |
| `باگ فنی`      | خطای برنامه‌نویسی، ریسک runtime یا امنیتی |
| `قانون متفاوت` | منطق کسب‌وکار با WP فرق دارد              |
| `محتوا/ترجمه`  | متن، i18n، برچسب                          |
| `UI`           | ظاهر، چیدمان، کلاس، حالت خالی             |


موارد با علامت `(؟)` حین پیاده‌سازی باید یک‌بار دوباره راستی‌آزمایی شوند.

## نقشهٔ فازها


| فاز | عنوان                                          | چرا این ترتیب                                          |
| --- | ---------------------------------------------- | ------------------------------------------------------ |
| ۰   | باگ‌های بحرانی و امنیتی                        | بدون اینها بقیه روی پایهٔ خراب ساخته می‌شود            |
| ۱   | زیرساخت UI مشترک                               | تقریباً همهٔ فازهای بعدی به این کامپوننت‌ها نیاز دارند |
| ۲   | پوسته، ناوبری، مسیرها، احراز هویت، لایسنس، PWA | چارچوب کل اپ                                           |
| ۳   | پیشخوان (Home)                                 | صفحهٔ اول محصول                                        |
| ۴   | سفارش‌ها و عملیات سفارش                        | قلب فروشگاه                                            |
| ۵   | محصولات و کاتالوگ                              |                                                        |
| ۶   | کاربران، نقش‌ها، نظرات، پرتال مشتری            |                                                        |
| ۷   | بازاریابی: کوپن، پیامک، ربات، اعلان‌ها         |                                                        |
| ۸   | محتوا و رسانه                                  |                                                        |
| ۹   | گزارش‌ها و آنالیتیکس                           |                                                        |
| ۱۰  | تنظیمات، ماژول‌ها، بازارچه، امنیت              |                                                        |
| ۱۱  | سینک کامل با ERP                               | بعد از اینکه مصرف‌کننده‌ها آماده شدند                  |
| ۱۲  | پاک‌سازی، i18n sweep، تست، مستندسازی           | بستن پرونده                                            |


---





## بازبینی هم‌ترازی کد (۱ اکتبر ۲۰۲۶ / Asia/Tehran)

> این بخش نتیجهٔ راستی‌آزمایی مستقیم روی کدبیس TARGET است. بسیاری از وضعیت‌های «ندارد/ناقص» در جدول‌های فاز ۱–۹ **کهنه** بودند (کامپوننت‌ها و صفحات بعداً پیاده شده‌اند). چک‌باکس‌های زیر هر فاز تا حد امکان با وضعیت واقعی هم‌تراز شدند؛ موارد بازمانده عمداً `[ ]` مانده‌اند.

| فاز | انجام‌شده (تقریبی) | ناقص/جزئی | هنوز غایب یا عمیق | یادداشت کوتاه |
| --- | --- | --- | --- | --- |
| ۱ زیرساخت UI | ~۱۲/۱۶ | ~۳ | ~۱ | MoneyDisplay/MobileListCard/ScrollTable/QueryErrorState/RouteErrorBoundary/PermissionGate/enum-labels/PostsPagination/ConfirmDialog/SimpleSeoFields موجود؛ پذیرش سراسری هنوز ۱۰۰٪ نیست |
| ۲ پوسته/Auth/RBAC | بخش عمده | چند UI | PWA تصمیم، updater | OTP+bootstrap+LicenseGate+legacy redirects+RBAC ماتریس موجود؛ capability روی مسیرهای catalog/orders/marketing/content در این پاس گسترش یافت |
| ۳ پیشخوان | نزدیک | جزئی | — | Home* + SSR initialOverview + wd-home-hero |
| ۴ سفارش‌ها | بخش عمدهٔ ۴.۱–۴.۲ | جزئیات/POS | عمق WP در چند زیربخش | Order::STATUSES + shipping + Tapin + smsMap؛ لیست سفارش با فیلتر/MoneyDisplay/MobileListCard |
| ۵ محصولات | لیست/ادیتور پایه قوی | تنوع/SEO عمیق | لیبل بارکد و… | ستون‌های localStorage، MoneyDisplay، bulk |
| ۶ کاربران/پرتال | صفحات و مسیرها هست | عمق جزئیات کاربر | ERP notes | users/comments، RBAC، portal capability |
| ۷ بازاریابی | کوپن‌ساز+SMS مسیرها+هاب اعلان | ربات افزونه‌ها | برخی stub ERP | CouponBuilder؛ NotificationsSettingsPanel؛ نشت ippanel در UI اصلاح شد |
| ۸ محتوا | RichText غنی (~۶۰۰ خط) + مسیرها | CMS/مجله عمق | SERP/OG کامل | blog/categories موجود؛ MediaPicker i18n |
| ۹ گزارش/آنالیتیکس | بک‌اند salesStatuses() درست | UI پنل‌ها | عمق WP | OrderReports::salesStatuses شامل وضعیت‌های حمل |


# فاز ۰ — باگ‌های بحرانی و امنیتی

> این فاز کوچک است و باید اول انجام شود.



## ۰.۱ نشت دسترسی: APIهای ادمین بدون بررسی نقش

- **وضعیت:** `باگ فنی` (امنیتی)
- **TARGET:** [backend/routes/api.php](WebinoDashboard/backend/routes/api.php) خطوط ۲۶۹–۲۷۶
- **شرح:** این مسیرها فقط پشت `auth:sanctum` و `module:`* هستند و **هیچ بررسی نقشی** ندارند:

```
Route::get('/product-reviews', [ProductReviewController::class, 'adminIndex']);
Route::patch('/product-reviews/{review}', [ProductReviewController::class, 'moderate']);
Route::get('/shop/tickets', [SupportTicketController::class, 'staffIndex']);
Route::get('/shop/tickets/{ticket}', [SupportTicketController::class, 'staffShow']);
Route::patch('/shop/tickets/{ticket}', [SupportTicketController::class, 'staffPatch']);
Route::post('/shop/tickets/{ticket}/replies', [SupportTicketController::class, 'staffReply']);
```

یعنی هر مشتری لاگین‌شده می‌تواند **همهٔ تیکت‌های همهٔ کاربران** آن مستاجر را بخواند و نظرات را تأیید/رد کند. WP معادل‌ها را با `moderate_comments` و `edit_shop_orders` می‌بندد.

- **کار لازم:**
  - [x] middleware نقش (`role:admin,staff` یا معادل) روی همهٔ مسیرهای ادمین
  - [x] ممیزی کل `api.php` و پیدا کردن بقیهٔ مسیرهای ادمین که فقط `auth:sanctum` دارند
  - [x] تست Feature: مشتری روی هر مسیر ادمین `403` بگیرد



## ۰.۲ لاگین بدون scope مستاجر

- **وضعیت:** `باگ فنی` **(؟)**
- **TARGET:** `backend/app/Http/Controllers/Api/V1/AuthController.php` (کوئری اول روی `email`)
- **شرح:** اگر ایمیل بین مستاجرها یکتا نباشد، ریسک ورود cross-tenant وجود دارد.
- **کار لازم:**
  - [x] یا فیلتر مستاجر در کوئری لاگین، یا unique ترکیبی `(email, tenant_id)` در migration
  - [x] تست: دو مستاجر با ایمیل یکسان



## ۰.۳ لینک‌های شکسته در UI

- **وضعیت:** `باگ فنی`


| لینک اشتباه                                                  | محل                                                                                             | باید باشد                        |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------- |
| `/dashboard/settings/site/security` به‌عنوان «تنظیمات اعلان» | `frontend/modules/marketing/admin/notifications-page.tsx` خط ۸۸                                 | هاب تنظیمات اعلان (فاز ۷.۵)      |
| `/dashboard/settings/shop?tab=reviews`                       | `frontend/src/components/home/HomeCommentsQueue.tsx` و `DashboardOverviewBuilder::tasksSection` | صفحهٔ moderation نظرات (فاز ۶.۴) |
| `/dashboard/security`                                        | `frontend/src/components/home/HomeMiniCardsStrip.tsx`                                           | `settings/site/security`         |
| `/dashboard/marketing/bots`                                  | `HomeMiniCardsStrip.tsx`                                                                        | `bots/bale` و `bots/telegram`    |
| `visit site` همیشه `/`                                       | `frontend/src/views/DashboardLayoutPage.tsx`                                                    | URL واقعی سایت/مستاجر            |


- [x] هر پنج مورد اصلاح شود
- [x] یک اسکریپت smoke که همهٔ `href="/dashboard/..."` را با مسیرهای `manifest.ts` تطبیق دهد و در CI اجرا شود



## ۰.۴ صفحات یتیم پیامک (۴ صفحه ساخته‌شده ولی بدون مسیر)

- **وضعیت:** `باگ فنی`
- **TARGET:** این فایل‌ها وجود دارند ولی در [frontend/modules/marketing/manifest.ts](WebinoDashboard/frontend/modules/marketing/manifest.ts) مسیر ندارند:
  - `sms-targeted-page.tsx` + client
  - `sms-scheduled-page.tsx` + client
  - `sms-drafts-page.tsx` + client
  - `sms-newsletter-page.tsx` + client
- کلیدهای ناوبری فارسی‌شان (`nav.sms_targeted`, `sms_drafts`, `sms_scheduled`, `sms_newsletter`) هم در `fa.json` هست.
- **کار لازم:** تصمیم در فاز ۷.۳ (ثبت مسیر + پیاده‌سازی ERP، یا حذف کامل فایل‌ها). فعلاً نباید کد مرده بماند.



## ۰.۵ کلید تکراری در `fa.json`

- **وضعیت:** `باگ فنی`
- **TARGET:** [frontend/messages/fa.json](WebinoDashboard/frontend/messages/fa.json) خطوط ۱۲۱ و ۱۲۲ — `"group_sms"` دو بار.

- [x] حذف تکراری + اسکریپت CI برای کلید تکراری در fa/en



## ۰.۶ کامپوننت مرده

- **وضعیت:** `باگ فنی`
- `frontend/src/components/DashboardPrefetch.tsx` تعریف شده ولی **هیچ‌جا import نمی‌شود**.

- [x] یا در layout وصل شود (WP معادلش را برای prefetch + hydrate SSR دارد) یا حذف شود



## ۰.۷ setState حین render

- **وضعیت:** `باگ فنی`
- `frontend/modules/core/admin/media-page-client.tsx` (حدود خط ۱۳۸–۱۴۱): `editDraft` حین render ست می‌شود.

- [x] انتقال به `useEffect` یا مشتق‌سازی از props



## ۰.۸ unwrap اشتباه پاسخ API در پرتال

- **وضعیت:** `باگ فنی` **(؟)**
- `AccountOrdersPageClient` انتظار آرایه دارد، ولی `AccountPortalController::ordersIndex` پاسخ `meta`دار می‌دهد و `api()` در آن حالت `{data, meta}` برمی‌گرداند → `.map` می‌شکند.
- همین الگو در `ShopReviewsSettingsPanel` هم هست (`Array.isArray` روی شیء).

- [x] تایپ درست + unwrap صریح در هر دو

---



# فاز ۱ — زیرساخت UI مشترک

> WP یک مجموعه کامپوننت مشترک دارد که تقریباً همهٔ صفحاتش از آن استفاده می‌کنند. نبودشان دلیل اصلی «ناقص بودن UI» در همهٔ صفحات TARGET است. این فاز پیش‌نیاز فازهای ۳ تا ۱۰ است.


| #    | کامپوننت                                                         | WP                                                                        | TARGET                                                                  | وضعیت         |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------- |
| ۱.۱  | `MoneyDisplay` + `IrtIcon`                                       | `client/src/components/currency/` + `class-webino-dashboard-currency.php` | ندارد (فقط `formatCurrency` و `CurrencyMark`)                           | `ندارد`       |
| ۱.۲  | `MobileListCard`                                                 | `client/src/components/MobileListCard.tsx`                                | ندارد                                                                   | `ندارد`       |
| ۱.۳  | `ScrollTable`                                                    | `client/src/components/ScrollTable.tsx`                                   | ندارد                                                                   | `ندارد`       |
| ۱.۴  | `QueryErrorState`                                                | `client/src/components/QueryErrorState.tsx`                               | ندارد                                                                   | `ندارد`       |
| ۱.۵  | `RouteErrorBoundary`                                             | `client/src/components/RouteErrorBoundary.tsx`                            | ندارد                                                                   | `ندارد`       |
| ۱.۶  | `PermissionGate`                                                 | `client/src/components/PermissionGate.tsx`                                | ندارد                                                                   | `ندارد`       |
| ۱.۷  | `ListFiltersCollapsible`                                         | WP نسخهٔ i18n‌شده                                                         | هست ولی `label="Filters"` و `"Hide"/"Show"` انگلیسی hardcode            | `محتوا/ترجمه` |
| ۱.۸  | `ListStatsStrip`                                                 | با پشتیبانی پول                                                           | هست بدون فرمت پول                                                       | `ناقص`        |
| ۱.۹  | `TableListSkeleton`                                              | هست                                                                       | `PageSkeleton` با پوشش کمتر                                             | `ناقص`        |
| ۱.۱۰ | `PostsPagination` (با انتخابگر per-page)                         | هست                                                                       | هیچ صفحه‌ای per-page ندارد؛ اغلب فقط prev/next انگلیسی                  | `ناقص`        |
| ۱.۱۱ | `translateOrderStatus` / `translateEnum` / `translatePostStatus` | `client/src/lib/enumLabels.ts`                                            | ندارد — همه‌جا slug خام انگلیسی نمایش داده می‌شود                       | `ندارد`       |
| ۱.۱۲ | `localizeDigits` همه‌جا                                          | `lib/digits.ts`                                                           | `toLocaleDigits` هست ولی استفادهٔ ناهمگون                               | `ناقص`        |
| ۱.۱۳ | `formatDisplayDate` / `formatDisplayDateTime` جلالی              | dayjs + jalaliday                                                         | `format-date.ts` هست ولی در صفحات جدید `toLocaleString` خام استفاده شده | `ناقص`        |
| ۱.۱۴ | `SimpleSeoFields`                                                | `components/seo/`                                                         | inline و تکراری در هر ادیتور                                            | `ناقص`        |
| ۱.۱۵ | `AlertDialog` تأیید حذف                                          | همه‌جای WP                                                                | اغلب حذف بدون تأیید                                                     | `ناقص`        |
| ۱.۱۶ | `MediaPickerDialog` با فیلتر پوشه/دسته                           | `components/magazine/MediaPickerDialog.tsx`                               | فقط search؛ متن‌های فارسی hardcode                                      | `ناقص`        |


**کار لازم فاز ۱:**

- [x] ساخت `MoneyDisplay` با قرارداد واحد پول (پذیرش گسترده؛ چند نقطهٔ فرمت خام احتمالاً باقی) (تصمیم صریح: minor units در API، major در نمایش) و جایگزینی **همهٔ** `toLocaleString()`های پول در کل کدبیس
- [x] ساخت `MobileListCard` و `ScrollTable` (استفاده در سفارش/محصول/کوپن/…؛ پوشش همهٔ جداول هنوز کامل نیست)
- [x] ساخت `QueryErrorState` + `RouteErrorBoundary` + `PermissionGate` (گیت در `render-pages` + nav)
- [x] ماژول `lib/enum-labels.ts` + کلیدهای `enums.*` در fa/en
- [x] `PostsPagination` مشترک با per-page
- [x] `ConfirmDialog` / `useConfirm` (پذیرش گسترده؛ همهٔ حذف‌ها تضمین نشده)
- [x] i18n کردن `ListFiltersCollapsible` و `MediaPickerDialog` (+ فیلتر پوشه/دسته)
- [x] تصمیم: کلاس‌های `wd-*` و `wd-home-hero` **نگه داشته** و در پیشخوان/پوسته استفاده می‌شوند (`Card` variants در UI موجود) (`wd-home-hero`, `wd-mini-tint`, `wd-icon-chip`, `wd-app-atmosphere`) و `Card variant="stat" | "glass"`: یا در `@webina/ui` پیاده و همه‌جا استفاده شوند، یا رسماً حذف شوند. وضعیت فعلی نیمه‌کاره است.

---



# فاز ۲ — پوسته، ناوبری، مسیرها، احراز هویت، لایسنس



## ۲.۱ هدر


| #      | وضعیت         | شرح                                                                                               | کار                                             |
| ------ | ------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| ۲.۱.۱  | `محتوا/ترجمه` | اولین breadcrumb در WP «داشبورد» (`nav.overview`) است؛ در TARGET «عملیات» (`breadcrumb_building`) | تغییر به «داشبورد/پیشخوان»                      |
| ۲.۱.۲  | `ندارد`       | منوی سه‌نقطهٔ موبایل (fullscreen، بازدید سایت، زبان)                                              | افزودن؛ الان در موبایل هیچ‌کدام در دسترس نیستند |
| ۲.۱.۳  | `اشتباه`      | «بازدید سایت» همیشه `/`                                                                           | URL واقعی از bootstrap                          |
| ۲.۱.۴  | `ندارد`       | بستن خودکار سایدبار موبایل پس از navigate (`CloseMobileSidebarOnNavigate`)                        | افزودن                                          |
| ۲.۱.۵  | `ندارد`       | ست کردن عنوان تب مرورگر بر اساس صفحه (`applyDashboardDocumentSeo`)                                | افزودن                                          |
| ۲.۱.۶  | `ناقص`        | تم: WP سه حالت light/dark/**system** + ذخیره روی سرور؛ TARGET فقط toggle دوحالته محلی             | افزودن system + persist                         |
| ۲.۱.۷  | `ناقص`        | accent: در TARGET فقط محلی ذخیره می‌شود                                                           | persist سمت سرور                                |
| ۲.۱.۸  | `محتوا/ترجمه` | `aria-label`های انگلیسی در `LocaleThemeToolbar` (`accent`, `light`, `dark`)                       | i18n                                            |
| ۲.۱.۹  | `ناقص`        | زبان: WP پرچم + ذخیرهٔ `ui_locale` روی سرور؛ TARGET فقط cookie                                    | هم‌ترازی                                        |
| ۲.۱.۱۰ | `UI`          | فاصلهٔ بالای محتوا: WP `pt-0`، TARGET `pt-3/sm:pt-4`                                              | یکسان‌سازی                                      |
| ۲.۱.۱۱ | `ندارد`       | اعمال `brandStyle.fonts` و رنگ برند از bootstrap روی `--wd-font-*` و `data-accent`                | افزودن                                          |




## ۲.۲ سایدبار


| #     | وضعیت          | شرح                                                                                                                       | کار                                       |
| ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| ۲.۲.۱ | `UI`           | WP `SiteBrand` (نام سایت + زیرعنوان + لوگوی برند)؛ TARGET `TeamSwitcher` با لوگوی ثابت `/brand/logo.png`                  | هم‌ترازی با برند مستاجر                   |
| ۲.۲.۲ | `ندارد`        | `SidebarMenuSkeleton` هنگام بارگذاری ناوبری                                                                               | افزودن                                    |
| ۲.۲.۳ | `ندارد`        | `footerHint` وقتی کاربر فقط خانه را می‌بیند                                                                               | افزودن                                    |
| ۲.۲.۴ | `باگ فنی`      | `projects={[]}` همیشه پاس داده می‌شود                                                                                     | شرط `length > 0` مثل WP                   |
| ۲.۲.۵ | `ناقص`         | آیکن‌ها در TARGET با heuristic از آخرین segment مسیر حدس زده می‌شوند (مثلاً `Package` برای media و cms)                   | نگاشت صریح آیکن مثل `module-icons` وردپرس |
| ۲.۲.۶ | `قانون متفاوت` | WP علاوه بر فعال بودن ماژول، **capability هر آیتم** و **ACL منو per-role** را هم چک می‌کند؛ TARGET فقط `TenantActivation` | افزودن لایهٔ capability (وابسته به ۲.۵)   |




### ۲.۲.۷ نگاشت کامل آیتم‌های منو

منبع WP: `includes/class-webino-dashboard-modules.php` (خطوط ۸۷–۳۱۳) + برچسب‌ها از `client/src/i18n/locales/fa.json` + ترتیب گروه‌ها از `lib/nav-modules.ts`.

**گروه‌ها:**


| گروه WP           | ترتیب | TARGET                                                             | وضعیت                                        |
| ----------------- | ----- | ------------------------------------------------------------------ | -------------------------------------------- |
| (خانه، بدون گروه) | ۰     | `section_overview`                                                 | `محتوا/ترجمه` — «پیشخوان» در برابر «داشبورد» |
| مدیریت محتوا      | ۱     | `section_content`                                                  | OK                                           |
| مدیریت فروشگاه    | ۲     | شکسته به `section_commerce` + `section_marketing` + `section_cafe` | `قانون متفاوت` — تصمیم بگیرید                |
| کاربران           | ۳     | `section_users`                                                    | OK                                           |
| ابزار             | ۴     | `section_tools`                                                    | OK                                           |
| گزارشات           | ۵     | `section_reports` («گزارش‌ها»)                                     | `محتوا/ترجمه`                                |
| مدیریت            | ۶     | `section_admin`                                                    | OK                                           |


**آیتم‌ها (آنچه باید اصلاح شود):**

- [ ] «مجله» به‌عنوان والد با آیکن `newspaper` و فرزندان «همهٔ نوشته‌ها»/«دسته‌ها» — الان والد مستقیماً «همه نوشته‌ها» است
- [x] «کتابخانهٔ رسانه» + آیکن Images
- [x] «برگه‌های سایت» (`nav.cms_pages`)
- [ ] والد «فروشگاه» با آیکن `shopping-bag` و مسیرهای `shop/products`, `shop/brands`, `shop/product-categories`, `shop/attributes` — TARGET پیشوند `shop/` را حذف کرده
- [x] «سفارشات» آیکن Package
- [x] «صندوق» آیکن ShoppingCart
- [x] برچسب‌های حساب من هم‌تراز WP
- [x] «کوپن‌ساز»
- [x] کاربران + مشتریان + کارکنان + دیدگاه‌ها در ناوبری (customers/staff از navHidden خارج شدند)
- [x] برچسب «تیکت» + redirect از `shop/tickets`
- [ ] والد «ربات‌ها» با آیکن `bot` و فرزندان bale/telegram؛ برچسب «ربات بله (WooBale)» → «ربات بله» درست است
- [x] «سیستم اعلان» در section tools
- [x] بازارچه: کاتالوگ + ماژول‌های من
- [x] تنظیمات سایت/فروشگاه در ناوبری
- [x] پروفایل قهوه در ناوبری (دیگر navHidden نیست)
- [x] «فروش و سود» (`nav.reports_sales`)؛ مالی را دوباره چک کنید



## ۲.۳ مسیرها

- **وضعیت:** `اشتباه` (قرارداد) + `ندارد` (چند مسیر)
- TARGET قرارداد مسیر WP را شکسته بدون redirect: `shop/products` → `products`، `orders/list` → `orders`، `shop/tickets` → `tickets`، `shop/wfcp/*` → `pricing/*`.
- **کار لازم:**
  - [x] alias/redirectهای legacy در `legacy-redirects.mjs` (+ گسترش marketplace/account tickets/analytics)
  - [x] redirectهای legacy وردپرس (wfcp/bots/basalam/sms ads/analytics/…)

**مسیرهای WP که در TARGET نیستند:**

- [x] `marketing/coupons/table` → redirect به `marketing/coupons`
- [x] `users/list|new|:id` redirect + `users/comments` مسیر واقعی
- [x] `marketplace` → `modules/catalog` (+ payment-callback)
- [x] `settings/shop/ext/:moduleSlug` مسیر واقعی
- [x] `account/tickets/:id` redirect به تیکت‌ها / مسیر حساب
- [x] `blog/categories` مسیر ادمین
- [x] مسیرهای پیامک + redirect `sms/ads` → targeted



## ۲.۴ ورود و OTP

- **وضعیت:** `ندارد` (بزرگ)
- **WP:** `client/src/pages/LoginPage.tsx` + `includes/class-webino-dashboard-auth-otp.php`
- **TARGET:** فقط ایمیل + رمز (+ TOTP دوعاملی برای ادمین)

**قوانین OTP وردپرس که باید پیاده شوند:**


| قانون             | مقدار WP                                     | وضعیت TARGET                            |
| ----------------- | -------------------------------------------- | --------------------------------------- |
| طول کد            | پیش‌فرض ۵، محدودهٔ ۴–۸                       | تنظیمات هست، موتور نیست                 |
| انقضا             | ۵ دقیقه، محدودهٔ ۱–۳۰                        | تنظیمات هست                             |
| حداکثر تلاش       | **۵** (محدودهٔ ۱–۲۰)                         | ناسازگاری داخلی: UI پیش‌فرض ۳، کنترلر ۵ |
| محدودیت نرخ       | حداکثر ۵ درخواست در ۱۵ دقیقه به ازای هر کلید | `ندارد`                                 |
| کانال‌ها          | sms / email / bale / telegram                | `ندارد`                                 |
| ضد شمارش کاربر    | پاسخ موفق جعلی وقتی کاربر وجود ندارد         | `ندارد`                                 |
| ثبت‌نام با موبایل | `login = phone`، رمز تصادفی، meta شماره      | `ندارد`                                 |
| شناسه ورود        | ایمیل **یا** موبایل                          | فقط ایمیل                               |


- [x] endpointهای `auth/send-otp` و `auth/verify-otp`
- [x] UI لاگین دوحالته (رمز / OTP) در `login-form.tsx`
- [x] یکسان‌سازی پیش‌فرض تلاش‌ها روی ۵ (throttle + تنظیمات)
- [ ] کارت لاگین `md:max-w-4xl` با تصویر مثل WP **(؟)**



## ۲.۵ نقش‌ها و قابلیت‌ها (RBAC)

- **وضعیت:** `قانون متفاوت` + `ندارد`


| نقش WP                             | قابلیت‌های کلیدی                                                                 | TARGET         |
| ---------------------------------- | -------------------------------------------------------------------------------- | -------------- |
| `administrator`                    | whitelist کامل                                                                   | `admin` با `*` |
| `shop_manager`                     | Woo + POS + حسابداری                                                             | `ندارد`        |
| `webino_seller`                    | `read`, `webino_pos`, `webino_create_shop_orders`, `webino_view_own_shop_orders` | `ندارد`        |
| `webino_accountant`                | `read`, `webino_manage_accounting`, `view_woocommerce_reports`                   | `ندارد`        |
| `customer`                         | `webino_account_portal`                                                          | `customer`     |
| `webino_partner`                   | `webino_account_portal` + `webino_partner_portal`                                | `ندارد`        |
| `subscriber` / `author` / `editor` | در دیالوگ تغییر نقش                                                              | `ندارد`        |


قابلیت‌های غایب در TARGET: `list_users`, `create_users`, `edit_users`, `delete_users`, `promote_users`, `moderate_comments`, `webino_pos`, `webino_manage_accounting`, `webino_account_portal`, `webino_partner_portal`, و **ACL منو به ازای هر نقش**.

- [x] مدل نقش/قابلیت واقعی (`role_capabilities` + `CapabilityChecker` + `EnsureCapability`)
- [x] `PermissionGate` در فرانت + middleware `can:` در بک‌اند (پوشش مسیرها در این پاس گسترش یافت)
- [x] صفحهٔ RBAC با ماتریس قابلیت و ACL منو (`RbacPage` / `users/admin/rbac-page`)
- [x] ACL منو per-role (`menu_acl` در bootstrap + ویرایش در RBAC)



## ۲.۶ لایسنس

- **وضعیت:** `ندارد`

- [x] صفحهٔ `/license`
- [x] `LicenseGate` + `LicenseSoftBanner` (`NAG_FORCE_DAYS = 2`)
- [x] بنر عدم دسترسی / soft nag لایسنس
- [ ] `اشتباه`: تشخیص فعلی لایسنس در `DashboardOverviewBuilder` فقط «کلید خالی نیست» است — باید وضعیت واقعی از ERP بیاید (فاز ۱۱)



## ۲.۷ Bootstrap واحد و SSR

- **وضعیت:** `ندارد`
- WP یک payload واحد `bootstrap` روی `window` دارد (ماژول‌ها، capabilities، لایسنس، `uiTheme`، `uiAccent`، `brandStyle`، site، user، `otpAuth`) + `useBootstrapQuery` + SSR کردن overview در HTML.
- TARGET همه را تکه‌تکه می‌گیرد (`auth/user`، `kernel/activations`، settings جدا).

- [x] `GET /api/v1/bootstrap` + `useBootstrapQuery`
- [x] SSR/initialData برای پیشخوان (`dashboard-page.tsx`)
- [x] بنر/حالت خطای API در پوسته (جزئی؛ QueryErrorState در صفحات)



## ۲.۸ PWA

- **وضعیت:** `ندارد` (کامل)
- WP: `class-webino-dashboard-pwa.php` + `PwaInstallBanner` + `PwaSplashOverlay` + `ServiceWorkerRegister` + تنظیمات.

- [ ] تصمیم محصولی: پیاده‌سازی کامل یا حذف رسمی از دامنهٔ کار (فاز ۱۰.۳ فیلدهای تنظیماتش را دارد)



## ۲.۹ به‌روزرسان هسته و خط لولهٔ build

- **وضعیت:** `ندارد`
- `class-webino-dashboard-core-updater.php`, `class-webino-dashboard-build-pipeline.php` + worker + پنل‌های UI.

- [ ] یا معادل مبتنی بر ERP، یا مستندسازی رسمی مسیر جایگزین deploy



## ۲.۱۰ صفحهٔ ۴۰۴ و بارگذاری

- [ ] `app/not-found.tsx` — راستی‌آزمایی i18n هنوز لازم است
- [x] `RouteErrorBoundary` موجود؛ اتصال per-route جزئی

---



# فاز ۳ — پیشخوان (Home)

> پورت اولیه انجام شده است: `frontend/src/views/DashboardHome.tsx`, `frontend/src/components/home/*`, `frontend/src/types/dashboardOverview.ts`, `backend/app/Services/Dashboard/DashboardOverviewBuilder.php`. این فاز، تکمیل و اصلاح همان است.



## ۳.۱ منطق بک‌اند


| #      | وضعیت          | WP                                                                                                                                                                                  | TARGET                                                                                                               | کار                                                                    |
| ------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| ۳.۱.۱  | `قانون متفاوت` | بازهٔ فروش = **ماه تقویمی** (جلالی برای fa)، `range=month`                                                                                                                          | ۳۰ روز غلتان، `range=last30`                                                                                         | ماه تقویمی؛ عنوان «نمای کلی این ماه» الان با دادهٔ ۳۰روزه ناسازگار است |
| ۳.۱.۲  | `قانون متفاوت` | هر بخش پشت capability: `can_products`, `can_sales`, `edit_shop_orders`, `moderate_comments`, `can_sms`, `can_traffic`                                                               | فقط بررسی فعال بودن ماژول                                                                                            | بعد از فاز ۲.۵                                                         |
| ۳.۱.۳  | `ندارد`        | بخش `account` / `partner` (تعداد سفارش، آخرین سفارش، کیف پول، علاقه‌مندی، تیکت، سفارش‌های اخیر)                                                                                     | ساخته نمی‌شود؛ UI آماده است ولی داده نمی‌آید                                                                         | افزودن به builder                                                      |
| ۳.۱.۴  | `ندارد`        | پنل `bots` (نشست ۲۴ ساعت، کاربران متصل، webhook، خطا) و پنل `security` (score، حالت WAF، یافته‌های باز)                                                                             | پر نمی‌شوند                                                                                                          | افزودن                                                                 |
| ۳.۱.۵  | `اشتباه`       | `status_label = wc_get_order_status_name()`                                                                                                                                         | `status_label = $o->status` (slug خام)                                                                               | ترجمه از نگاشت فاز ۱.۱۱                                                |
| ۳.۱.۶  | `اشتباه`       | fulfillment: pack = `processing` + `sent-to-warehouse`؛ ship = `packaged`؛ tracking = completedهای بدون کد رهگیری؛ returns از موتور مرجوعی؛ `purchase_type` و `shipping_kind` واقعی | pack=`processing`، ship=`paid`، tracking=`shipped`، refund=`cancelled` ۱۴روزه، returns همیشه خالی                    | بازنویسی کامل بعد از فاز ۴.۱ (وضعیت‌های حمل)                           |
| ۳.۱.۷  | `اشتباه`       | سفارش‌های اخیر: ماه جاری، وضعیت‌های فعال، سقف ۲۰                                                                                                                                    | ۸ سفارش آخر بدون فیلتر                                                                                               | هم‌ترازی                                                               |
| ۳.۱.۸  | `قانون متفاوت` | محصولات اخیر ۵ تا با فیلتر وضعیت؛ `top_*` پنج‌تایی                                                                                                                                  | ۸ تایی بدون فیلتر                                                                                                    | هم‌ترازی                                                               |
| ۳.۱.۹  | `ناقص`         | `enrich_product_report_rows` تصویر محصولات برتر را می‌آورد                                                                                                                          | `image_url: ''`                                                                                                      | افزودن                                                                 |
| ۳.۱.۱۰ | `اشتباه`       | `top_products_by_views` از بازدید صفحات analytics                                                                                                                                   | از ستون `products.views_count`                                                                                       | هم‌ترازی                                                               |
| ۳.۱.۱۱ | `باگ فنی`      | شمارش موجودی با aggregate SQL                                                                                                                                                       | همهٔ محصولات publish را `->get()` می‌کند و در PHP می‌شمارد                                                           | `selectRaw` + `groupBy`                                                |
| ۳.۱.۱۲ | `محتوا/ترجمه`  | هشدارها i18n + منبع ترجمه‌شده + هشدار ربات ۷روزه                                                                                                                                    | `"SMS balance is low"` و `"License inactive"` انگلیسی hardcode؛ بدون هشدار ربات؛ سطح لایسنس `warning` به‌جای `error` | i18n + تکمیل                                                           |
| ۳.۱.۱۳ | `قانون متفاوت` | بخش traffic **همیشه** در `sections` هست حتی اگر غیرفعال باشد (کارت «غیرفعال» نشان داده شود)                                                                                         | فقط اگر فعال یا آنلاین > ۰                                                                                           | هم‌ترازی                                                               |
| ۳.۱.۱۴ | `اشتباه`       | شناسهٔ دوره‌ها: `last7_excl_today`, `last14_excl_today`, `all_time`                                                                                                                 | `today`, `yesterday`, `last7`                                                                                        | هم‌ترازی با جدول دوره‌ها                                               |
| ۳.۱.۱۵ | `باگ فنی`      | —                                                                                                                                                                                   | `trafficSection` چند بار پشت‌سرهم `AnalyticsQuery::overview` صدا می‌زند                                              | یک کوئری تجمیعی                                                        |
| ۳.۱.۱۶ | `ناقص`         | در خطا، payload با کلید `error` برمی‌گردد                                                                                                                                           | exception بلعیده می‌شود                                                                                              | برگرداندن خطا                                                          |
| ۳.۱.۱۷ | `قانون متفاوت` | `provider` پنل پیامک `modirpayamak`                                                                                                                                                 | `dashboard`                                                                                                          | آگاهانه است (قانون ۴)؛ فقط مطمئن شوید UI به provider وابسته نیست       |




## ۳.۲ کامپوننت‌های UI پیشخوان


| کامپوننت                    | وضعیت           | شکاف                                                                                                                                                                                |
| --------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HomeActionBar`             | `ناقص`          | `HomeAlertsPanel` جدا وجود ندارد؛ هشدارها به لیست ساده تبدیل شده‌اند (بدون آیکن سطح، منبع ترجمه‌شده، تاریخ). prop `locale` بلااستفاده است                                           |
| `HomeMiniCardsStrip`        | `UI` + `اشتباه` | کلاس‌های `wd-mini-tint`/`wd-icon-chip` نیستند؛ کارت ترافیک غیرفعال `variant=error` ندارد؛ کارت فروشگاه باید به تنظیمات فروشگاه برود نه محصولات؛ لینک‌های امنیت/ربات شکسته (فاز ۰.۳) |
| `HomeKpiStrip`              | `UI`            | بدون `Card variant="stat"` و بدون `MoneyDisplay`                                                                                                                                    |
| `HomeFulfillmentTodos`      | `ناقص`          | `slice(0,5)`؛ بدون badge تعداد هر گروه؛ متن `refund_cash` همیشه بدون درگاه؛ پیام‌های `return_approved` و `refund_installment` وجود ندارند                                           |
| `HomeOrderWorkflow`         | `UI`            | WP یک دیاگرام شاخه‌دار رنگی است (pack → شاخه‌های پیک/پست/تیپاکس → رهگیری → مسیرهای بازگشت وجه)؛ TARGET یک لیست شماره‌دار ۶ مرحله‌ای                                                 |
| `HomeSalesStatCard`         | `ناقص`          | بدون محور، بدون `ChangePctBadge`، بدون خط سفارش‌ها                                                                                                                                  |
| `HomeTrafficAnalyticsPanel` | `ناقص`          | WP حدود ۲۰۰ خط با حالت‌های خالی، badge منبع، legend، محورها، «روزهای اخیر»، لینک تنظیمات؛ TARGET ~۱۰۰ خط با دو عدد و یک نمودار                                                      |
| `HomeTrafficPeriodsTable`   | `ندارد`         | کل جدول دوره‌ها                                                                                                                                                                     |
| `HomeProfitChart`           | `ناقص`          | ارتفاع `h-28/36` در برابر `h-64/80`؛ بدون tooltip/legend؛ سری مقایسه محاسبه می‌شود ولی رسم نمی‌شود                                                                                  |
| `HomeOrdersBreakdown`       | `ناقص`          | WP سه نمودار دارد (`StatusPieChart`, `PaymentBarChart`, `HourlyOrdersChart`)؛ TARGET دو لیست متنی با slug خام + یک نمودار ساده                                                      |
| `HomeOrdersTable`           | `ناقص`          | بدون کارت موبایل، بدون `MoneyDisplay`، badge با `status_label` خام                                                                                                                  |
| `HomeProductTable`          | `ناقص`          | بدون کارت موبایل؛ برچسب ستون قیمت اشتباهاً «مبلغ» است                                                                                                                               |
| `HomeCommentsQueue`         | `ناقص`          | WP اکشن سریع تأیید/اسپم/حذف دارد؛ TARGET فقط لینک                                                                                                                                   |
| `HomeProductStatsCard`      | `UI`            | بدون `variant="stat"`                                                                                                                                                               |
| `HomeTopTables`             | `UI`            | بدون `MoneyDisplay`/نماد ارز                                                                                                                                                        |
| `HomeOverviewSkeleton`      | OK              | —                                                                                                                                                                                   |




## ۳.۳ صفحه

- [x] هدایت پرتال بر اساس capability (`account.portal` / `partner.portal`) در `PermissionGate`/`render-pages`
- [x] `initialData` از SSR
- [x] کلاس `wd-home-hero` در پیشخوان هست
- [ ] `محتوا/ترجمه` — دکمهٔ تلاش مجدد خطای overview از کلید `home.sms.retry` استفاده می‌کند
- [x] `HomeProfitChart` / breakdown lazy
- [ ] `باگ فنی` — `frontend/src/views/CommerceReportsPage.tsx` یک صفحهٔ قدیمی موازی است؛ حذف یا redirect

---



# فاز ۴ — سفارش‌ها



## ۴.۱ وضعیت‌های حمل سفارشی (پیش‌نیاز بقیهٔ فاز)

- **وضعیت:** `نزدیک` (بازبینی اکتبر ۲۰۲۶) — وضعیت‌های حمل در بک‌اند/فرانت/Tapin/SMS پیاده شده‌اند
- **WP:** `Modules/shipping-module/.../class-webino-shipping-order-statuses.php`
- **TARGET:** `Order::STATUSES` + `OrderShippingStatuses` + `order-statuses.ts` + enums i18n
- **کار لازم:**
  - [x] وضعیت‌های حمل در `Order::STATUSES` + `OrderShippingStatuses`
  - [x] `order-statuses.ts` هم‌تراز بک‌اند
  - [x] نگاشت Tapin (`fromTapinCode` در `TapinShipmentService`)
  - [x] `smsMap` / `smsEventFor` + `OrderStatusNotifier`



## ۴.۲ فهرست سفارش‌ها

**ستون‌ها** — WP: شماره، مشتری، تاریخ، وضعیت، استان، مقصد ارسال (+روش +لینک نقشه)، پرداخت، UTM، مبلغ، منبع/بازارچه، مشاهده. TARGET: شماره، وضعیت، مبلغ، مشتری، تاریخ، ابزار پرداخت، ویرایش.

- [x] ستون‌های استان/مقصد/روش/UTM/بازارچه در لیست سفارش (نقشه/درگاه را نقطه‌ای چک کنید)
- [x] اکشن اصلی مشاهده/جزئیات
- [x] badge وضعیت با `useEnumLabel`
- [x] کارت موبایل سفارش‌ها
- [ ] `محتوا/ترجمه` — `POS` hardcode
- [x] مبلغ با `MoneyDisplay`؛ تاریخ با فرمت محلی

**تب‌های وضعیت**

- [x] برچسب تب وضعیت ترجمه‌شده
- [ ] `باگ فنی` — `status_counts` بدون اعمال فیلترهای فعال محاسبه می‌شود ولی `stats` با فیلتر؛ رفتار را یکدست کنید
- [ ] شمارش `all` باید جمع همه باشد نه `meta.total` فیلترشده

**فیلترها** — WP: after/before، روش پرداخت، استان، روش ارسال، بازارچه، `utm_source/medium/campaign`، مشتری، نقش مشتری، حداقل/حداکثر مبلغ. TARGET: فقط تاریخ، ابزار پرداخت، کانال فروش.

- [x] فیلترها + `filter-options` در UI/API (ممکن است چند فیلتر WP هنوز نباشد)
- [x] `filter-options` غنی + فراخوانی از فرانت
- [ ] `محتوا/ترجمه` — `PAYMENT_TENDERS` با برچسب انگلیسی hardcode
- [x] جستجوی debounce

**عملیات گروهی و صفحه‌بندی**

- [ ] `ناقص` — WP: تغییر وضعیت، ارسال ایمیل (۴ نوع)، زباله، حذف + دیالوگ تأیید. TARGET: فقط تغییر وضعیت + دکمهٔ **"Trash"** انگلیسی
- [ ] `ناقص` — گزینه‌های وضعیت در select گروهی slug خام‌اند
- [ ] `ناقص` — API `sort`/`dir` را پشتیبانی می‌کند ولی UI ستون قابل مرتب‌سازی ندارد
- [ ] `ناقص` — `per_page` ثابت ۲۰، فقط prev/next
- [ ] `ناقص` — `ListStatsStrip` بدون «تکمیل‌شده»؛ فرمول AOV باید با WP بررسی شود **(؟)**



## ۴.۳ جزئیات سفارش


| #      | وضعیت          | شکاف                                                                                                                                                               | کار                                  |
| ------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| ۴.۳.۱  | `ناقص`         | WP `OrderStatusStepper` با pipeline و قوانین انتقال؛ TARGET یک `<select>` آزاد                                                                                     | stepper + قوانین انتقال              |
| ۴.۳.۲  | `ندارد`        | `OrderShipDialog` (کد رهگیری، سرویس‌دهنده، ارسال پیامک، تغییر وضعیت حمل)                                                                                           | پیاده‌سازی                           |
| ۴.۳.۳  | `باگ فنی`      | UI انتظار `tracking_code`/`tracking_url` دارد ولی **مدل Order این فیلدها را ندارد و API نمی‌سازد** → پنل رهگیری عملاً مرده است؛ عنوانش هم `"Tracking"` انگلیسی است | فیلد در مدل/meta + serializer + i18n |
| ۴.۳.۴  | `ناقص`         | یادداشت: WP چک‌باکس «یادداشت مشتری» دارد؛ API TARGET `is_customer` را پشتیبانی می‌کند ولی UI نه                                                                    | چک‌باکس + badge                      |
| ۴.۳.۵  | `قانون متفاوت` | مرجوعی WP بر اساس **آیتم** (تعداد قابل مرجوع، شرایط، آدرس مرجوعی، سفارش تعویض، refund واقعی)؛ TARGET فقط دلیل + مبلغ و همهٔ اکشن‌ها همیشه فعال‌اند                 | بازنویسی UI/API مرجوعی               |
| ۴.۳.۶  | `ناقص`         | refund فقط وضعیت را `refunded` می‌کند؛ بدون برگشت پرداخت/دفتر                                                                                                      | منطق واقعی                           |
| ۴.۳.۷  | `باگ فنی`      | کلید i18n `return_exchange` وجود ندارد                                                                                                                             | افزودن                               |
| ۴.۳.۸  | `ندارد`        | پنل پروفایل/تاریخچهٔ مشتری + نوار تماس + ارسال و تاریخچهٔ پیامک                                                                                                    | پیاده‌سازی                           |
| ۴.۳.۹  | `محتوا/ترجمه`  | `"Attribution"`, `"Subtotal"`, `"Discount"`, `"Shipping"` انگلیسی hardcode (کلیدهای `orders_admin.*` موجودند)                                                      | i18n                                 |
| ۴.۳.۱۰ | `ناقص`         | آدرس به‌صورت `<pre>` متنی؛ WP بلوک ساخت‌یافتهٔ صورتحساب/ارسال                                                                                                      | بازنویسی                             |
| ۴.۳.۱۱ | `قانون متفاوت` | نوع خرید: WP `cash/credit/installment/wholesale`؛ TARGET `retail/wholesale/credit`                                                                                 | هم‌ترازی                             |
| ۴.۳.۱۲ | `ندارد`        | پنل اطلاعات درگاه (`transaction_id` و…)                                                                                                                            | افزودن                               |
| ۴.۳.۱۳ | `ندارد`        | ارسال مجدد ایمیل/پیامک به مشتری و ادمین                                                                                                                            | افزودن                               |
| ۴.۳.۱۴ | `ندارد`        | خط زمانی تغییر وضعیت                                                                                                                                               | افزودن                               |
| ۴.۳.۱۵ | `ناقص`         | ردیف اقلام: WP تصویر، ویژگی‌ها، قابلیت مرجوع، متادیتای اقساط                                                                                                       | غنی‌سازی                             |
| ۴.۳.۱۶ | `محتوا/ترجمه`  | گزینه‌های سرویس Tapin (`pishtaz` و…) انگلیسی                                                                                                                       | i18n                                 |
| ۴.۳.۱۷ | OK             | چاپ اسناد و پنل‌های بازارچه نسبتاً هم‌تراز است                                                                                                                     | نگه داشتن                            |




## ۴.۴ ثبت/ویرایش سفارش (Composer)

- [ ] `قانون متفاوت` — انواع خرید (بند ۴.۳.۱۱)
- [ ] `ناقص` — آدرس کامل، نوع شخص، کد ملی، کد اقتصادی، کوپن، مؤدیان
- [ ] `ناقص` — پشتیبانی از تنوع محصول در جستجو
- [ ] `محتوا/ترجمه` — وضعیت‌ها در select انگلیسی



## ۴.۵ صندوق (POS)

- [ ] `ناقص` — WP: افزودن خودکار با بارکد، تنوع‌ها، کانال‌های کامل، تخفیف/هزینهٔ ارسال، چاپ. TARGET: کانال فقط `in_store/phone/other` و بدون بارکد/تنوع/تخفیف
- [ ] `ناقص` — لینک پرداخت: WP آدرس کامل، استعلام ارسال، نوع خرید، `allowBothTypes`، تخفیف، انتخاب درگاه‌ها
- [ ] `ناقص` — صفحهٔ عمومی پرداخت سفارش (`class-webino-dashboard-pay-order.php`) شامل فیلتر درگاه **(؟)**



## ۴.۶ کیف پول و کارت‌به‌کارت

- [ ] `ناقص` — فیلدهای متنی درگاه کیف پول (عنوان، توضیح، متن دکمه، پیام ورود، برچسب موجودی، آیکن)
- [ ] `قانون متفاوت` — `min_topup`: WP پیش‌فرض ۱۰۰۰، TARGET `min_topup_minor` ۱۰۰۰۰
- [ ] `قانون متفاوت` — مهلت کارت‌به‌کارت: WP ۲ ساعت، TARGET ۲۴ ساعت
- [ ] `ناقص` — تأیید/رد رسید بدون اعلان به مشتری



## ۴.۷ درگاه‌های پرداخت


| درگاه                                                           | وضعیت TARGET                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| zarinpal, digipay, snapppay, torobpay, wallet, c2c, basalam_pay | نسبتاً هم‌تراز                                                                                                                 |
| **bale_pay**                                                    | `باگ فنی` — `configured()` همیشه `false`، وضعیت ربات hardcode، و **در لیست مجاز** `createIntent` **نیست** → پرداخت واقعی ندارد |
| cod                                                             | `ناقص` — `settings_path` خالی                                                                                                  |


- [ ] اصلاح bale_pay
- [ ] پر کردن مسیر تنظیمات cod



## ۴.۸ ارسال، جغرافیا، آدرس

- [ ] `ناقص` — دادهٔ استان/شهر ایران (`shipping-module/data/state_city.php`) برای فیلتر سفارش و checkout
- [ ] `ناقص` — schema آدرس: WP استان، پلاک، واحد، کد پستی ۱۰ رقمی، مختصات؛ TARGET ساده‌تر و بدون `province_code`
- [ ] `ندارد` — نگاشت وضعیت Tapin به وضعیت سفارش
- [ ] توجه: `class-webino-dashboard-checkout-geo.php` برخلاف نامش **اعلان VPN/خارج از ایران** است نه استان/شهر؛ معادلش در TARGET `geo_notice` است (فاز ۱۰.۲)



## ۴.۹ اعلان تغییر وضعیت سفارش

- **وضعیت:** `ندارد` (کامل)
- WP: `on_order_status_changed` → اعلان داخل سایت + ایمیل + پیامک + ربات، با کاتالوگ رویداد و قالب‌های `notify-copy`.
- TARGET: هیچ observer/سرویسی برای تغییر وضعیت سفارش وجود ندارد.

- [ ] موتور اعلان (مشترک با فاز ۷.۵) + dispatch روی تغییر وضعیت، sync تاپین، و مرجوعی
- [ ] متغیرها: `{order_number}`, `{status_label}`, `{tracking_code}`, `{return_*}`

---



# فاز ۵ — محصولات و کاتالوگ



## ۵.۱ فهرست محصولات

- [x] ستون‌های قابل انتخاب + localStorage (`webino-products-list-columns`)
- [ ] `ندارد` — ستون تصویر بندانگشتی
- [ ] `ناقص` — بازهٔ قیمت خرید/خرده برای محصول متغیر و قیمت‌های WFCP
- [x] قیمت با `MoneyDisplay`
- [x] badge وضعیت با enum labels
- [ ] `ناقص` — آمار: WP کل + منتشر + پیش‌نویس + ناموجود + **موجود**
- [ ] `ناقص` — فیلترها: تگ، مرتب‌سازی، بازهٔ تاریخ، دکمهٔ پاک‌کردن؛ `محتوا/ترجمه` برای دید کاتالوگ
- [ ] `قانون متفاوت` — نوع محصول: WP `grouped`/`external`، TARGET `downloadable`؛ تصمیم صریح
- [x] انتخاب چندتایی + bulk (لیبل/english-slugs را نقطه‌ای چک کنید)
- [ ] `ناقص` — اکشن ردیف: «مشاهده در فروشگاه» و «همگام‌سازی با بله/تلگرام»
- [ ] `ناقص` — پس از duplicate باید به ادیتور نسخهٔ جدید برود
- [x] صفحه‌بندی با per-page
- [x] کارت موبایل محصولات
- [ ] `UI` — `description={route.fullPath}` مسیر داخلی را به کاربر نشان می‌دهد (این الگو در چند صفحه تکرار شده)



## ۵.۲ ادیتور محصول

**ساختار**

- [ ] `قانون متفاوت` — WP تب `seo` جدا دارد؛ TARGET SEO را داخل content گذاشته
- [ ] `ناقص` — ذخیرهٔ خودکار قیمت خرید روی blur (WP `handlePurchaseBlur` → PATCH wfcp)
- [ ] `ناقص` — قوانین slug انگلیسی (`class-webino-dashboard-product-slugs.php`)
- [ ] `ناقص` — permalink باید از API بیاید نه `base + slug`

**فیلدها**


| فیلد                               | وضعیت          | کار                                                                          |
| ---------------------------------- | -------------- | ---------------------------------------------------------------------------- |
| توضیح کوتاه/بلند                   | `UI`           | WP ویرایشگر غنی جدا برای هر دو؛ TARGET Textarea ساده در برخی مسیرها **(؟)**  |
| گالری                              | `ناقص`         | بدون drag reorder                                                            |
| نوع محصول                          | `قانون متفاوت` | WP وقتی تنوع دارد نوع را قفل می‌کند                                          |
| وضعیت                              | `قانون متفاوت` | `trash` نباید در select ادیتور باشد                                          |
| دید کاتالوگ                        | `محتوا/ترجمه`  | گزینه‌ها متن خام                                                             |
| مدیریت موجودی                      | `اشتباه`       | برای محصول متغیر هم نمایش داده می‌شود؛ WP مخفی می‌کند و موجودی روی تنوع‌هاست |
| `backorders` (خیر/اطلاع/بله)       | `ندارد`        | فیلد + API                                                                   |
| وزن/ابعاد                          | `UI`           | WP پنل ارسال جدا                                                             |
| اقساط در نمایش قیمت‌های محاسبه‌شده | `ناقص`         | badge اقساط                                                                  |
| قواعد عمده‌فروشی                   | `ناقص`         | WP فرم ساخت‌یافته؛ TARGET **Textarea با JSON خام**                           |
| قفل/قیمت پلتفرم‌ها                 | `ناقص`         | در pricing نیست                                                              |
| URL مرجع                           | `ناقص`         | بدون نمایش منبع و آخرین همگام‌سازی                                           |
| محصولات مرتبط/بیش‌فروش/جانبی       | `ناقص`         | چک‌باکس از ۸۰ محصول اول؛ باید جستجو باشد                                     |
| حذف محصول از ادیتور                | `ناقص`         | فقط در لیست هست                                                              |
| دکمهٔ AI کلی محصول                 | `ناقص`         | WP در هدر                                                                    |


**ویژگی‌ها و تنوع‌ها**

- [ ] `ناقص` — WP: مرتب‌سازی کشیدنی (`@dnd-kit`)، ویژگی سفارشی، انتخاب ترم، پرچم «استفاده در تنوع»، **گروه‌های ویژگی**. TARGET: فقط چک‌باکس از فهرست سراسری
- [ ] `ندارد` — UI گروه‌های ویژگی (API `/attribute-groups` در بک‌اند **هست** ولی هیچ صفحه‌ای ندارد)
- [ ] `ناقص` — تنوع‌ها: WP پیش‌نمایش/تأیید هنگام تولید، حذف همه، ویرایش گروهی قیمت/موجودی/خرید، تعیین تنوع پیش‌فرض، تصویر تنوع، عمده‌فروشی هر تنوع. TARGET: لیست ساده + افزودن + تولید + ویرایش SKU/قیمت روی blur
- [ ] `ناقص` — swatches فروشگاهی (رنگ/تصویر/دکمه + `show_swatch_label`)

**SEO**

- [ ] `ناقص` — WP پنل Rank Math کامل (امتیاز، بررسی‌ها، robots، schema، شبکه‌های اجتماعی، متغیرها)؛ TARGET سه فیلد ساده. حداقل: امتیاز + بررسی‌ها + robots + OG



## ۵.۳ دسته‌های محصول

- [ ] `ناقص` — لیست: ستون تصویر، تعداد، بازدید، فیلتر والد
- [ ] `ناقص` — فرم: توضیح با ویرایشگر غنی، انتخاب تصویر از رسانه (الان URL متنی)، درخت والد با عمق، auto-slug
- [ ] `ندارد` — فیلدهای SEO دسته



## ۵.۴ برندها

- [ ] `ناقص` — همان ارتقاهای دسته (ویرایشگر غنی، رسانه، درخت والد)
- [ ] `ناقص` — جدول و اکشن‌های ردیف
- [ ] SEO برند **(؟)**



## ۵.۵ ویژگی‌ها

- [ ] `محتوا/ترجمه` — نوع ویژگی در select متن خام انگلیسی؛ WP کارت نوع با آیکن و راهنما
- [ ] `ناقص` — فیلد `order_by` در state هست ولی **در فرم رندر نمی‌شود**
- [ ] `ناقص` — پیش‌نمایش swatch
- [ ] `ناقص` — دیالوگ ترم: انتخاب رنگ و تصویر از رسانه (الان متنی)



## ۵.۶ قیمت‌گذاری (WFCP) و ماژول‌های مرتبط

- [ ] `ناقص` — «افزودن سریع»: انتخاب تصویر از رسانه، دسته/برند، پیش‌نمایش قیمت
- [ ] `ناقص` — «تغییر قیمت گروهی»: انتخاب دسته از UI (الان `category_slugs` متنی)، پیش‌نمایش
- [ ] `ناقص` — «لیست قیمت گروهی»: ستون‌های اعتباری/برند
- [ ] `ناقص` — تب‌های بازارچه/موتور جستجو در تنظیمات قیمت‌گذاری **(؟)**
- [ ] `ناقص` — `product-catalog`: import خارجی + placeholder انگلیسی `"SKU / name"`
- [ ] `ناقص` — استخراج‌کنندهٔ محصولات ترب
- [ ] `ناقص` — پروفایل قهوه (قیمت‌گذاری وزنی برای محصول متغیر)



## ۵.۷ موجودی

- [ ] `ناقص` — آستانهٔ موجودی کم فقط نمایش داده می‌شود، قابل ویرایش نیست
- [ ] `UI` — نام محصول در جدول موجودی کم لینک ندارد



## ۵.۸ تگ‌های محصول

- [ ] `ناقص` — صفحهٔ مدیریت تگ محصول وجود ندارد (فقط از داخل ادیتور)
- [ ] `ناقص` — فیلتر تگ در لیست (API `tag_id` را دارد)



## ۵.۹ باگ‌های فنی این حوزه

- [ ] `باگ فنی` — قوانین اعتبارسنجی وضعیت در `ProductController` ناسازگارند: خط ۲۱۷ `in:publish,draft,trash` ولی خط ۳۱۲ `publish,draft,trash,pending,private`
- [ ] `ناقص` — بازیابی از زباله در UI **(؟)**
- [ ] `ندارد` — endpointهای slug انگلیسی
- [ ] `ندارد` — چاپ لیبل بارکد محصول (بارکد فقط در اسناد سفارش استفاده شده)

---



# فاز ۶ — کاربران، نقش‌ها، نظرات، پرتال مشتری



## ۶.۱ فهرست کاربران

- [x] صفحهٔ `/users` + مشتریان/کارکنان در ناوبری (دیگر navHidden نیستند؛ مسیر employees جدا نیست)
- [x] مسیر واقعی کاربران در `modules/users`؛ stubهای views کمتر گمراه‌کننده‌اند (Orders stub حذف شد)
- [ ] `ناقص` — ستون‌ها: WP آواتار، نام کاربری، نام، ایمیل، **تلفن**، نقش
- [ ] `ندارد` — فیلتر نقش با شمارش (all/customer/partner/subscriber/shop_manager)
- [ ] `ندارد` — تب‌های ربات (همه/بله/تلگرام) + ورود CSV
- [ ] `ناقص` — جستجو: WP روی نام/ایمیل/**تلفن**/**کد ملی** با debounce؛ TARGET فقط نام و ایمیل با Enter
- [ ] `ندارد` — انتخاب گروهی + تغییر نقش گروهی (`users/bulk-role`)
- [ ] `ناقص` — حذف کاربر با تأیید (الان اصلاً حذف ندارد)
- [ ] `ندارد` — دیالوگ ارسال پیام (پیامک/تلگرام/بله)
- [ ] `ندارد` — دیالوگ بازنشانی رمز و تغییر نقش
- [ ] `ندارد` — کارت موبایل
- [ ] `محتوا/ترجمه` — `"New"`, `"Cancel"`, `"Search name or email"`, `"Active"`, `"Sheba"`, `"Password (optional)"`, `"Admins"` انگلیسی hardcode
- [ ] `ناقص` — ایجاد کاربر: بدون تلفن، بدون نام کاربری جدا، بدون نام/نام خانوادگی



## ۶.۲ صفحهٔ جزئیات کاربر

- **وضعیت:** `ندارد` (کامل) — هیچ مسیر `users/:id` وجود ندارد؛ ویرایش فقط inline است.

پنل‌های WP که باید ساخته شوند:

- [ ] حساب: نام کاربری، نام، نام خانوادگی، تلفن، ایمیل، انتخاب نقش (۸ نقش)
- [ ] پروفایل: شغل، کد ملی، تاریخ تولد، تلفن ثابت
- [ ] بانکی: نام بانک، شماره حساب، شماره کارت، شبا (TARGET فقط `bank_sheba` دارد)
- [ ] نوار تماس + پنل ارتباط (پیامک/ایمیل/ربات)
- [ ] تاریخچه و آمار سفارش‌ها
- [ ] آدرس‌ها (فرم ایرانی)
- [ ] دیدگاه‌های کاربر
- [ ] یادداشت‌های CRM (باید از ERP بیاید)
- [ ] علاقه‌مندی‌ها
- [ ] اتصال‌های ربات + امتیاز وفاداری
- [ ] تنظیم موجودی کیف پول در UI جزئیات کاربر (API هست) — هنوز باز
- [ ] حالت پرتال برای نقش partner



## ۶.۳ نقش‌ها

به فاز ۲.۵ مراجعه کنید (مدل نقش/قابلیت). در این فاز فقط UI:

- [x] صفحهٔ RBAC با ماتریس قابلیت و ACL منو
- [ ] `محتوا/ترجمه` — `"Assign role"`, `"Role updated"`, `"User ID"`



## ۶.۴ نظرات و دیدگاه‌ها

- **وضعیت:** `ندارد` — صفحهٔ اختصاصی وجود ندارد؛ فقط یک پنل کوچک داخل تنظیمات فروشگاه.

- [x] صفحهٔ `/users/comments` (عمق تب‌ها را نقطه‌ای چک کنید)
- [ ] `قانون متفاوت` — وضعیت‌های TARGET `approved/rejected/pending`؛ باید `hold/spam/trash` هم نگاشت شوند
- [ ] جستجو، انتخاب ستون، صفحه‌بندی، ویرایش سریع، پاسخ
- [ ] نمایش امتیاز و badge «خریدار تأییدشده»
- [ ] اتصال لینک‌های فاز ۰.۳ به این صفحه



## ۶.۵ پرتال حساب مشتری


| صفحه          | وضعیت              | شکاف                                                                                                                                                                      |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| پیشخوان حساب  | `ناقص`             | WP کارت‌های لینک‌دار + کیف پول + جدول سفارش‌های اخیر؛ TARGET سه عدد بدون لینک. فیلدهای `order_groups`, `wallet_balance`, `wallet_enabled`, `wishlist_count` نیستند        |
| سفارش‌ها      | `ناقص` + `باگ فنی` | بدون فیلتر وضعیت، بدون فرمت پول؛ باگ unwrap (فاز ۰.۸)                                                                                                                     |
| آدرس‌ها       | `اشتباه`           | **Textarea با JSON خام**؛ WP فرم ایرانی کامل (استان، شهر، پلاک، واحد، کد پستی ۱۰ رقمی، تلفن `09...`، مختصات + نقشهٔ نشان). API هم `province/plaque/unit/lat/lng` را ندارد |
| علاقه‌مندی‌ها | `ناقص`             | بدون دکمهٔ حذف (API دارد) و بدون لینک محصول                                                                                                                               |
| اعلان‌ها      | `ناقص`             | بدون «خوانده شد» در UI (API دارد)                                                                                                                                         |
| دیدگاه‌ها     | `ناقص`             | WP سه تب: در انتظار ثبت نظر، نظرات من، پرسش‌های من + ثبت نظر. TARGET فقط لیست                                                                                             |
| پروفایل       | `ناقص`             | فیلدهای کم + برچسب‌های `"Name"/"Email"/"Phone"` انگلیسی                                                                                                                   |
| کیف پول       | `ناقص`             | فقط نمایش موجودی؛ WP شارژ، برداشت، دفتر تراکنش، شبا، روش بازگشت وجه                                                                                                       |
| تیکت‌ها       | `ناقص`             | بدون ایجاد تیکت و **بدون مسیر جزئیات** (`account/tickets/:id` در manifest نیست)                                                                                           |
| پرتال همکار   | `ندارد`            | نقش و capability partner وجود ندارد                                                                                                                                       |


- [x] پرتال با `account.portal` / `partner.portal` در PermissionGate



## ۶.۶ تیکت پشتیبانی

- [ ] `باگ فنی` — لینک اعلان به `/dashboard/tickets/{id}` اشاره می‌کند؛ با مسیر واقعی تطبیق داده شود
- [ ] `محتوا/ترجمه` — پیام‌های `'Ticket is closed.'` و `'Support replied...'` انگلیسی
- [ ] `ناقص` — امتیاز رضایت (CSAT) در UI مشتری
- [ ] `ندارد` — همگام‌سازی با تیکت‌های ERP (فاز ۱۱)

---



# فاز ۷ — بازاریابی: کوپن، پیامک، ربات، اعلان



## ۷.۱ کوپن‌ها

- [x] **Offer Builder** (`CouponBuilder` در مسیر `marketing/coupons`)
- [x] فیلدهای Offer در مدل/API + `CouponService` auto_apply (عمق قالب‌ها جزئی)
- [ ] `ناقص` — لیست کلاسیک روی `marketing/coupons/table`؛ ستون محصولات، `MoneyDisplay`، اکشن‌های ردیف، فیلتر منقضی
- [ ] `محتوا/ترجمه` — نوع کوپن در select متن خام `percent`/`fixed_cart`/`fixed_product`؛ کانال‌ها هم خام
- [ ] `ندارد` — پنل انتشار: وضعیت pending، دیده‌شدن (عمومی/خصوصی/رمزدار)، رمز، زمان‌بندی انتشار
- [ ] `ناقص` — پنل محدودیت‌ها: WP انتخابگر چندتایی محصول/کاربر؛ TARGET **متن CSV**
- [x] `UserMultiSelect` و `ProductMultiSelect`

**قوانینی که ذخیره می‌شوند ولی اعمال نمی‌شوند یا اصلاً نیستند:**


| قانون                                                      | وضعیت                       |
| ---------------------------------------------------------- | --------------------------- |
| `free_shipping`, `individual_use`, `exclude_sale_items`    | فیلد هست، **اعمال نمی‌شود** |
| محصولات/دسته‌های مستثنی                                    | `ندارد`                     |
| برند include/exclude                                       | UI هست، اعمال `ندارد`       |
| محدودیت ایمیل                                              | UI هست، بررسی `ندارد`       |
| کاربران مجاز                                               | سرویس دارد، UI `ندارد`      |
| استان/شهر/روش پرداخت/روش ارسال/نوع خرید مجاز               | `ندارد`                     |
| `order_nth` (اولین/n اُمین سفارش)، `min_items`، درصد ارسال | `ندارد`                     |
| وضعیت‌های `pending`/`future`/`private`                     | `ندارد`                     |


- [ ] `قانون متفاوت` — واحد مبلغ کوپن (integer در برابر اعشاری WC) باید صریح و در UI درست نمایش داده شود



## ۷.۲ قیمت حراجی

- [ ] `ناقص` — فیلترهای محصول (دسته، برند، تگ، نوع، موجودی، وضعیت، دید، مرتب‌سازی)؛ بک‌اند پشتیبانی می‌کند ولی UI نمی‌فرستد
- [ ] `ناقص` — دیالوگ: پیش‌تنظیم مدت ۱/۳/۷/۳۰ روز، تاریخ پایان دلخواه، و **پیش‌نمایش** (اکشن `preview` در بک‌اند هست ولی UI صدایش نمی‌زند)
- [ ] `باگ فنی` — `BulkSaleController::applyProduct` پارامترهای `days`/`until` را می‌پذیرد ولی **فقط** `sale_price_minor` **را می‌نویسد**؛ زمان‌بندی حراج اعمال نمی‌شود
- [ ] `محتوا/ترجمه` — نمایش خام `price_minor`



## ۷.۳ پنل پیامک


| ویژگی WP                             | TARGET UI                | وضعیت ERP                                       | اقدام                                    |
| ------------------------------------ | ------------------------ | ----------------------------------------------- | ---------------------------------------- |
| داشبورد                              | هست                      | `dashboard` موجود                               | `ناقص` — لینک‌های ناوبری و فهرست تبلیغات |
| ارسال + محاسبهٔ قیمت                 | هست                      | موجود                                           | نزدیک                                    |
| گزارش‌ها / صندوق خروج                | هست                      | موجود (`reports/bulk-*` غیرفعال)                | `ناقص`                                   |
| صندوق ورودی                          | هست                      | موجود                                           | OK                                       |
| ارسال هدفمند                         | فایل هست، **مسیر ندارد** | وابسته به send                                  | ثبت مسیر                                 |
| زمان‌بندی‌شده                        | فایل هست، **مسیر ندارد** | `send/cancel-scheduled` **غیرفعال**             | ERP + مسیر                               |
| پیش‌نویس                             | فایل هست، **مسیر ندارد** | `drafts`* **غیرفعال**                           | ERP + مسیر یا حذف                        |
| خبرنامه                              | فایل هست، **مسیر ندارد** | `newsletter`* **غیرفعال**                       | ERP + مسیر یا حذف                        |
| دفترچه تلفن                          | هست                      | `phonebooks/edge` غیرفعال                       | `ناقص`                                   |
| پترن‌ها                              | هست                      | موجود                                           | `ناقص`                                   |
| منشی پیامکی                          | هست                      | `secretaries/process` فقط stub `{skipped:true}` | ERP واقعی                                |
| کیف پول / خطوط / شارژ                | هست                      | موجود                                           | OK                                       |
| **تبلیغات پیامکی (ویزارد + جزئیات)** | `ندارد`                  | —                                               | پیاده‌سازی                               |
| **پیامک رویداد سفارش**               | `ندارد`                  | `orders/notify` و `test-notify` فقط stub        | پیاده‌سازی (با فاز ۴.۹)                  |
| OTP سایت                             | هست                      | موجود                                           | OK                                       |


**نشت نام فروشنده (نقض قانون ۴):**

- [x] کلید فروشنده حذف/جایگزین شد (`sms.pattern_code_col`)
- [x] ستون پترن با برچسب «کد پترن» (فیلد داده ممکن است هنوز `ippanel_code` از ERP باشد)
- [ ] بررسی اینکه همهٔ صفحات پیامک از `SmsServiceBanner` استفاده می‌کنند تا پیام خام ERP/SQL به UI نرسد



## ۷.۴ ربات‌ها

- [ ] `محتوا/ترجمه` — کلید `bots.settings.paritySoon` («به‌زودی») باید حذف شود با پیاده‌سازی واقعی
- [ ] `محتوا/ترجمه` — متن پیش‌فرض تست `"Hello from WebinoDashboard"`
- [ ] `محتوا/ترجمه` — segment و نوع در `BotBroadcastPanel` متن خام انگلیسی
- [ ] `ندارد` — افزونه‌ها: کارت‌به‌کارت، سؤالات متداول، تیکت، باشگاه، انتشار در کانال
- [ ] `ندارد` — باشگاه وفاداری (امتیاز، معرفی، تبدیل به کوپن، خوشامد، یادآوری غیرفعال‌ها، فیلدهای checkout)
- [ ] `ندارد` — پنل کوپن‌های ربات و پنل لاگ‌ها
- [ ] `ندارد` — اعلان آبشاری سفارش، ویجت سایت، قالب‌ها، بخش‌بندی
- [ ] `ناقص` — کمپین‌ها در برابر نسخهٔ WP **(؟)**



## ۷.۵ اعلان‌ها (شکاف بحرانی)

- **وضعیت:** `ندارد` — کل هاب تنظیمات چندکاناله.
- WP: `NotificationsSettingsPanel` با ۶ تب: سایت / پیامک / بله / تلگرام / ایمیل / OTP، به‌علاوه موتور `class-webino-dashboard-notify.php` و قالب‌های `notify-copy.php` و `class-webino-dashboard-mailer.php` (SMTP).
- TARGET: مسیر `/settings/site/notifications` **وجود ندارد**؛ فقط `NotificationController` برای خواندن/خوانده‌شدن.

**کاتالوگ رویداد WP که باید پیاده شود:**

- سفارش: همهٔ وضعیت‌ها + `pending_on_create`, `pending_on_status`, `cart-abandoned`, `order-abandoned`
- مرجوعی: `return-requested`, `return-approved`, `return-rejected`, `return-parcel-received`, `return-refund`, `return-exchange`
- کاربر: `user-welcome`
- موجودی: `stock-low`, `stock-out`
- مدیریت: `comment-pending`

- [x] هاب تنظیمات اعلان (`NotificationsSettingsPanel`) — عمق تب‌ها را دوباره راستی‌آزمایی کنید
- [ ] موتور dispatch (الان هیچ تولیدکنندهٔ اعلانی جز تیکت پشتیبانی وجود ندارد)
- [ ] قالب مشتری/ادمین به ازای هر رویداد + نقش گیرنده
- [ ] SMTP per-tenant + `Mailer` runtime
- [ ] متغیرهای قالب
- [ ] `ناقص` — `NotificationBell`: پورت `toNotificationNavPath` و `NotificationText` (فرمت مبلغ داخل متن اعلان)
- [ ] اصلاح لینک تنظیمات (فاز ۰.۳)



## ۷.۶ هاب بازاریابی

- [ ] `قانون متفاوت` — `CommerceMarketingPage.tsx` یک stub با کلیدهای `phase2.*` است؛ یا مثل WP به کوپن‌ها redirect شود یا هاب واقعی با کارت‌های لینک به کوپن/حراج/پیامک/ربات/اعلان

---



# فاز ۸ — محتوا و رسانه

> نکتهٔ مهم: `client/src/components/blocks/*` در WP بلوک‌ادیتور نیست، فقط UI kit است. ویرایشگر محتوا در هر دو طرف TipTap است.



## ۸.۱ ویرایشگر متن غنی (بزرگ‌ترین شکاف این حوزه)

WP `components/magazine/RichTextEditor.tsx` حدود ۵۵۰ خط؛ TARGET `components/content/RichTextEditor.tsx` حدود ۷۰ خط.

- [x] افزونه‌های RichText گسترده در `RichTextEditor.tsx` (~۶۰۰+ خط) — جزئیات ابزار را نقطه‌ای چک کنید
- [ ] نوار ابزار: undo/redo، H2–H4، bold/italic/underline/strike، بالانویس/زیرنویس، کد، چهار حالت چینش، فهرست‌ها، نقل‌قول، بلوک کد، خط افقی، لینک، تصویر (از رسانه یا URL)، جدول (افزودن/حذف سطر و ستون)، رنگ متن، هایلایت، پاک کردن قالب، تمام‌صفحه
- [ ] تب Visual / Code + پاک‌سازی HTML
- [ ] انتخاب تصویر از کتابخانهٔ رسانه داخل ویرایشگر
- [ ] شمارندهٔ کلمه/کاراکتر
- [ ] پشتیبانی جهت متن (RTL)
- [ ] `محتوا/ترجمه` — برچسب‌های `bold/italic/underline/h2/ul/ol` انگلیسی hardcode



## ۸.۲ برگه‌های سایت (CMS)

- [ ] `ناقص` — ستون‌های قابل انتخاب + خلاصه + ذخیره در `localStorage`
- [ ] `ناقص` — آمار `pending` (API می‌دهد، UI نشان نمی‌دهد)
- [ ] `ناقص` — صفحه‌بندی (الان `per_page=100` یک‌باره)
- [ ] `ندارد` — کارت موبایل
- [ ] `ناقص` — وضعیت خام انگلیسی و تاریخ ISO خام
- [ ] `ناقص` — اکشن‌های ردیف: ویرایش، مشاهده در سایت، تأیید حذف
- [ ] `محتوا/ترجمه` — پس از حذف پیام «ذخیره شد» می‌آید
- [ ] `ندارد` — CTA در حالت خالی
- [ ] `ناقص` — **پنل انتشار کامل**: دیده‌شدن (عمومی/خصوصی/رمزدار)، رمز، `comment_status`، زمان‌بندی. توجه: `CmsController` این فیلدها را **اعتبارسنجی می‌کند** ولی UI هرگز نمی‌فرستد
- [ ] `ناقص` — حذف تصویر شاخص
- [ ] `ندارد` — کارت تولید محتوای AI صفحه
- [ ] `ندارد` — درخت والد با عمق



## ۸.۳ مجله

- [ ] `ناقص` — ستون SEO (امتیاز + کلیدواژه)، خلاصه، انتخاب ستون
- [ ] `ناقص` — صفحه‌بندی، کارت موبایل، ترجمهٔ وضعیت، دکمهٔ ویرایش، تأیید حذف
- [ ] `ندارد` — `AiGenerateButton` روی ادیتور (با poll و نوار پیشرفت مثل WP)
- [ ] `ناقص` — پنل انتشار کامل (API `comment_status`/`visibility`/`password`/`published_at` را می‌پذیرد)
- [ ] `ناقص` — حذف تصویر شاخص، permalink قابل ویرایش، پیش‌نمایش
- [ ] `ناقص` — دسته‌ها: ویرایش، ویرایش سریع، SEO دسته (API دارد)، درخت، تأیید حذف، auto-slug



## ۸.۴ بلاگ

- [x] مسیر ادمین `blog/categories`
- [ ] `ناقص` — SEO، وضعیت pending، دیده‌شدن، دیدگاه‌ها، زمان‌بندی، دستهٔ چندتایی (الان تک‌انتخاب)، AI
- [ ] `باگ فنی` — تصویر کاور فقط `cover_url` ذخیره می‌کند نه شناسهٔ رسانه؛ با تغییر/حذف فایل لینک می‌شکند
- [ ] `باگ فنی` — لینک `view_on_site` به `/blog/${slug}` ثابت؛ با prefix زبان/مسیر واقعی سایت بررسی شود **(؟)**
- [ ] `محتوا/ترجمه` — عنوان از `site_admin.blog_title` و زیرعنوان از `content_admin`؛ یکدست شود



## ۸.۵ کتابخانهٔ رسانه

- [ ] `ناقص` — فیلتر پوشه/دسته درختی + جستجوی زنده (الان تخت + دکمهٔ Apply)
- [ ] `ناقص` — انتخابگر per-page (۲۰/۴۰/۶۰) + نمایش کل
- [ ] `ناقص` — تأیید حذف
- [ ] `ناقص` — نام فیلد `alt_text` در برابر `alt` — در تایپ‌ها و مستندات یکدست شود
- [ ] `ناقص` — پوشه/دسته: ویرایش ترم (API `MediaTermController::update` هست)، تأیید حذف، درخت والد
- [x] `MediaPickerDialog` با فیلتر پوشه/دسته + i18n

- TARGET در drag & drop چندفایلی **بهتر** است؛ نگه داشته شود



## ۸.۶ SEO

- [x] کامپوننت مشترک `SimpleSeoFields`
- [ ] `ندارد` — پیش‌نمایش نتیجهٔ جستجو (SERP)
- [ ] `ندارد` — امتیاز SEO در لیست نوشته‌ها
- [ ] `ندارد` — فیلدهای OG/شبکه‌های اجتماعی و `schema_type` (در تایپ WP هست ولی UI هیچ‌کدام رندر نمی‌کند — هر دو طرف ناقص‌اند)
- [ ] `ندارد` — SEO روی دستهٔ مجله و روی بلاگ



## ۸.۷ محتوای AI

- [ ] `ناقص` — `AiGenerateButton` فقط در محصول است؛ روی نوشته/برگه/بلاگ نیست
- [ ] `ناقص` — `AiPagesPanel` فقط `pageId` دستی می‌گیرد؛ WP فهرست صفحات + prompt هر صفحه + لینک ادیتور دارد
- [ ] `محتوا/ترجمه` — وضعیت job (`pending`/`running`/…) و placeholderهای `"1,2,3"`, `"attr ids"` انگلیسی



## ۸.۸ پاک‌سازی

- [ ] `باگ فنی` — stubهای `AdminResourcePage`: `MagazineAdminPage.tsx`, `BlogAdminPage.tsx`, `AcademyAdminPage.tsx` — صفحات واقعی در `frontend/modules/*` هستند؛ این‌ها گمراه‌کننده‌اند

---



# فاز ۹ — گزارش‌ها و آنالیتیکس



## ۹.۱ نوار فیلتر گزارش‌ها

- [ ] `ندارد` — پیش‌تنظیم‌های WP: امروز، دیروز، ۷ روز، ۳۰ روز، این هفته، هفتهٔ گذشته، این ماه، ماه گذشته، امسال، دلخواه. TARGET فقط ۷/۳۰/۹۰ روز
- [ ] `قانون متفاوت` — ماه جلالی برای fa
- [ ] `ندارد` — انتخابگر تاریخ
- [ ] `ندارد` — فیلتر وضعیت سفارش (پارامتر `status` اصلاً ارسال نمی‌شود)
- [ ] `باگ فنی` — خروجی CSV با `fetch` خام گرفته می‌شود و ممکن است هدر احراز هویت `api()` را نداشته باشد **(؟)**



## ۹.۲ پنل‌های گزارش

WP برای هر بخش پنل اختصاصی دارد؛ TARGET یک پنل جنریک با ۸ KPI ثابت و یک نمودار.

- [ ] `ناقص` — مرور کلی: شبکهٔ KPI با delta، انتخابگر متریک (۱۰ گزینه)، کارت موجودی باسلام، جدول‌های برتر
- [ ] `ناقص` — سفارش‌ها: نقشهٔ حرارتی روز×ساعت، نمودار دایره‌ای وضعیت، نمودار منبع، نمودار ساعتی (دادهٔ `heatmap` و `by_source` در بک‌اند **هست** ولی UI ندارد)
- [ ] `ناقص` — محصولات/تنوع‌ها/دسته‌ها/کوپن‌ها/مالیات/مشتریان/دانلودها: ستون‌های اختصاصی و صفحه‌بندی به‌جای جدول ۴ستونی
- [ ] `ناقص` + `محتوا/ترجمه` — موجودی: KPIهای انگلیسی hardcode (`Name`, `SKU`, `Low stock`, `all`) + فیلترهای WP (جستجو، دسته، مرتب‌سازی)
- [ ] `ناقص` — فروش و سود / گزارش مالی: عمق WP
- [ ] `ناقص` — `MoneyDisplay` در کل گزارش‌ها



## ۹.۳ بک‌اند گزارش

- [x] `OrderReports::salesStatuses()` = همهٔ وضعیت‌ها منهای exclude (شامل حمل)؛ فراخوانی‌های Broadcast/Torob هم هم‌تراز شدند
- [ ] `ناقص` — گزارش موجودی: کلیدهای قیمت بازارچه و WFCP کم‌عمق‌ترند
- [ ] `ناقص` — نام پارامتر: WP `stock_filter` در برابر TARGET `filter` **(؟)**
- [x] تست `OrderReportsTest` (و Unit برای shipping statuses) موجود است — پوشش DashboardOverview جزئی



## ۹.۴ آنالیتیکس

- [ ] `ندارد` — فیلتر دوره کامل (این ماه/ماه گذشته/دلخواه با انتخابگر تاریخ)
- [ ] `ناقص` — عمق هر بخش: مرور کلی (KPI + نمودار بازدیدکننده/بازدید + خلاصهٔ فروشگاه)، بازدیدکنندگان (جدول و سری)، صفحات (صفحه‌بندی و ستون‌های بیشتر)، ارجاع‌ها، جغرافیا، دستگاه‌ها، فروشگاه (جداول محصول و قیف)، مقایسه، سئو/پشتیبانی/محتوا/خلاصهٔ ماه
- [ ] `ناقص` — تنظیمات: دکمهٔ پاک‌سازی کش، badge منبع
- [ ] `قانون متفاوت` — `exclude_roles` پیش‌فرض: WP `administrator`، TARGET `admin` (نام نقش‌ها باید با مدل نقش فاز ۲.۵ هماهنگ شود)
- [ ] `قانون متفاوت` — `editable_roles` در TARGET hardcode است
- [ ] `محتوا/ترجمه` — placeholder انگلیسی `"admin, staff"` در `AnalyticsSettingsPanel`

---



# فاز ۱۰ — تنظیمات، ماژول‌ها، بازارچه، امنیت

> **Phase 10 implementation (branch `phase-10-wp-parity`):** security engine wired; site general/privacy/style/system-logs panels; shop guest_checkout + lbs/oz + geo colors; modules page enriched; marketplace matrix documented; TenantSettings stubs fixed.



## ۱۰.۱ تنظیمات سایت


| بخش WP                     | مسیر WP                       | TARGET         | وضعیت                                                                                   |
| -------------------------- | ----------------------------- | -------------- | --------------------------------------------------------------------------------------- |
| عمومی                      | `settings/site/general`       | `ندارد`        | عنوان سایت، تگ‌لاین، ایمیل ادمین، منطقهٔ زمانی                                          |
| حریم خصوصی / حساب WC       | `settings/site/privacy`       | `ندارد`        | شامل **پرداخت مهمان** — در کل TARGET حتی یک `guest_checkout` هم وجود ندارد              |
| لایسنس                     | `settings/site/license`       | `ناقص`         | فقط دکمهٔ sync در صفحهٔ ماژول‌ها                                                        |
| ظاهر داشبورد + به‌روزرسانی | `settings/site/dashboard`     | `ندارد`        | `ui_locale`, `ui_theme`, `ui_fullscreen_default` + پنل به‌روزرسان هسته + خط لولهٔ build |
| استایل/برند                | `settings/site/style`         | `ناقص`         | پایین                                                                                   |
| PWA                        | `settings/site/pwa`           | `ندارد`        | پایین                                                                                   |
| ماژول‌ها                   | `settings/site/modules`       | `قانون متفاوت` | صفحهٔ جدا `/dashboard/modules` — قابل قبول ولی ناقص                                     |
| لاگ سیستم ربات             | `settings/site/system-logs`   | `ناقص`         |                                                                                         |
| اعلان‌ها + SMTP            | `settings/site/notifications` | `ندارد`        | فاز ۷.۵                                                                                 |
| آنالیتیکس                  | `settings/site/analytics`     | `ناقص`         | فاز ۹.۴                                                                                 |
| پیامک سایت                 | `settings/site/sms`           | نسبتاً OK      | از ERP می‌خواند (درست)                                                                  |


**استایل/برند** — فیلدهای WP: `accent`، پالت ۷ رنگ (primary/secondary/accent/bg/surface/text/muted)، `logo_id`، `favicon_id`، سه فونت (body/heading/ui)، رنگ‌های `geo_notice` (۶)، حدود ۲۰ رنگ WFCP، رنگ/فونت پروفایل قهوه، رنگ‌های PWA. TARGET فقط `logo_url`, `logo_dark_url`, `favicon_url`, `accent`, `font`.

- [x] پالت کامل رنگ برند
- [x] انتخاب لوگو از کتابخانهٔ رسانه (با شناسه، نه URL خام)
- [x] سه فونت جدا
- [x] رنگ‌های geo_notice و WFCP

**PWA** — فیلدهای WP: `enabled`, `name`, `short_name`, `description`, `theme_color` (پیش‌فرض `#0f172a`), `background_color` (`#fff`), `display` (standalone/fullscreen/minimal-ui), `orientation` (any/portrait/landscape), `icon_source` (site/custom), `icon_id`, `show_install_banner` (پیش‌فرض true), `splash_enabled` (پیش‌فرض true).

- [x] کل سرویس + پنل + سرو manifest و service worker (وابسته به تصمیم فاز ۲.۸)



## ۱۰.۲ تنظیمات فروشگاه

- [x] `ندارد` — **پرداخت مهمان** و تنظیمات حساب/حریم خصوصی WC — تنظیم + UI + پرچم public؛ مسیر تسویهٔ عمومی کامل هنوز ناقص
- [x] `ناقص` — واحد وزن: WP واحدهای بیشتر (lbs/oz)
- [x] `ناقص` — geo notice: WP علاوه بر `enabled` و `services`، **۶ رنگ** هم دارد؛ TARGET رنگ ندارد
- [x] `باگ فنی` **(؟)** — تنظیمات + رنگ‌ها در hub ذخیره/خوانده می‌شوند؛ اعمال بصری بنر در UI پرداخت وابسته به کلاینت checkout است (رنگ‌ها در API موجودند)
- [x] `ناقص` — لوگوی اسناد سفارش: `logo_id` / `invoice_logo_id` / … اضافه شد (URL هم حفظ شد)
- [x] `ناقص` — مؤدیان: پنل تنظیمات موجود است؛ اتصال زنده ERP همچنان فاز ۱۱
- [x] `ناقص` — موجودی: `notify_*` در ProductStockObserver؛ `stock_email_recipient` در dispatcher؛ `hold_stock_minutes` در CartController

- بخش‌های downloads/reviews/maps/loyalty/archive در TARGET **بهتر** سازمان‌دهی شده‌اند؛ نگه داشته شوند



## ۱۰.۳ امنیت (شکاف بزرگ)

- **وضعیت:** `باگ فنی` + `ندارد`
- WP یک ماژول امنیتی کامل دارد: امتیاز امنیت، یافته‌ها، حالت‌های WAF، فایروال زنده/قوانین/مسدودسازی، اسکن، feedها، دوعاملی، مسدودسازی جغرافیایی، کلاس‌های نرخ، گزارش‌ها، ممیزی.
- TARGET فقط یک فرم دارد که در `module_settings` ذخیره می‌شود و **هیچ‌کدام اعمال نمی‌شوند**:


| فیلد TARGET                                       | خوانده می‌شود؟                        |
| ------------------------------------------------- | ------------------------------------- |
| `privacy.hide_wp_version`                         | بی‌معنی در Laravel                    |
| `privacy.disable_file_edit`                       | خیر                                   |
| `login.limit_attempts`, `max_attempts`, `lockout` | خیر                                   |
| `login.force_2fa`                                 | خیر (۲FA از `config/auth.php` می‌آید) |
| `waf.enabled`, `waf.enforce`                      | خیر                                   |
| `headers.x_frame`, `referrer`                     | middleware پیدا نشد                   |


- [x] موتور واقعی: LoginAttemptService + WafGuard + SecurityHeaders + force_2fa از تنظیمات
- [x] `hide_wp_version` → `hide_app_fingerprint` (+ `disable_dangerous_debug`)



## ۱۰.۴ ماژول‌ها و بازارچه

- [x] `ندارد` — کاتالوگ بازارچهٔ ماژول (کارت، دسته‌بندی، جزئیات) — جدول کاتالوگ بهبود یافت؛ کارت/خرید ERP هنوز فاز ۱۱
- [x] `ندارد` — جریان خرید (`payment_url` + صفحهٔ callback) — باید از ERP بیاید (فاز ۱۱)
- [x] `ناقص` — «ماژول‌های من»: نسخه، میان‌بر تنظیمات، نوار پیشرفت نصب
- [x] `ناقص` — مراحل نصب با نوار پیشرفت مثل WP (progress UI محلی)
- [x] `UI` — `accounting_hint` فقط وقتی ماژول accounting فعال است

- بررسی `requires_license` موجود است و کار می‌کند



## ۱۰.۵ کانکتورهای بازارچه


| پلتفرم                       | وضعیت                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| باسلام                       | نزدیک‌ترین به هم‌ترازی (اتصال، غرفه، محصولات، دسته‌ها، سفارش‌ها، مالی، jobs، logs) — `ناقص` جزئی    |
| دیجی‌کالا                    | نزدیک (RSA، محصولات، سفارش‌ها، jobs، webhook، سلامت، مغایرت‌گیری) — `ناقص` اگر همهٔ انواع job نباشد |
| ترب                          | `ناقص` — feed + ابزارها هست؛ ماتریس کامل Torob-Sync بررسی شود                                       |
| اسنپ‌شاپ، تپسی‌شاپ، تکنولایف | `ناقص` — پنل جنریک، عمق کمتر از ماژول اختصاصی WP                                                    |
| ایمالز، زره‌بین، اسنپ‌پی‌سرچ | `ناقص` جزئی (feed محور)                                                                             |


- [x] ماتریس ویژگی در `docs/MARKETPLACE_FEATURE_MATRIX.md` — پر کردن شکاف‌های عمیق به ERP/فاز بعد موکول
- [x] `ناقص` — معادل‌های TARGET در ماتریس مستند شد (`MarketplaceHttp` و …)



## ۱۰.۶ حسابداری

- [x] `ناقص` — متن placeholder صادقانه‌تر (bundle محلی / بدون ERP زنده)
- [x] `ناقص` — همگام‌سازی زنده با حسابداری ERP (فاز ۱۱)
- [x] `محتوا/ترجمه` — پیش‌فرض‌های `"Cash"`/`"Equity"` → i18n `accounting_portal.defaults`



## ۱۰.۷ تنظیمات مرده و stub

- [x] `اشتباه` — `shop.payments` → PaymentGatewaySettingsService hub؛ `shop.marketplace` → MarketplaceSettingsService
- [x] `اشتباه` — `site.sms` → OtpSettings کامل؛ پنل UI همچنان ERP ModirPayamak را ترجیح می‌دهد
- [x] `اشتباه` — `otp_max_attempts` یکدست = ۵ (OtpSettings + UI)

---



# فاز ۱۱ — سینک کامل با ERP

> این تنها جایی است که اجازه داریم از WP فاصله بگیریم — ولی باید **کامل** باشد، نه stub.



## ۱۱.۱ مسیرهای ERP که الان غیرفعال‌اند

`WebinoERP/backend/Modules/Integrations/Http/Controllers/WebinocrmModirPayamakCompatController.php` (Phase 11 branch `phase-11-erp-sync`):

- [x] `drafts*` — پیاده‌سازی واقعی از طریق Edge (`list/create/update/delete`); Dashboard همچنان `SmsLocalFeatures` محلی دارد
- [x] `newsletter*` — صادقانه `unavailable` (Edge محصول newsletter ندارد؛ Dashboard local newsletter)
- [x] `phonebooks/edge` — پروکسی Edge واقعی
- [x] `reports/bulk-*` — `api/report/by_bulk`
- [x] `send/cancel-scheduled` — تلاش Edge `api/send/cancel`؛ در صورت عدم پشتیبانی پیام صادقانه

و مسیرهای notify (دیگر silent `{skipped:true}` نیستند):

- [x] `secretaries/process` — پردازش inbox در برابر قوانین منشی + ارسال پاسخ
- [x] `orders/notify` — ارسال با pattern registry؛ بدون `skipped:true`
- [x] `orders/test-notify` — همان مسیر با پرچم test

UI SMS از قبل `isSmsUnavailable` / «در دسترس نیست» دارد.

## ۱۱.۲ مایگریشن معوق ERP

- [x] فایل مایگریشن موجود + idempotent (`Schema::hasTable`) + runbook: `WebinoERP/docs/MODIRPAYAMAK_MIGRATION.md`
- [ ] اجرای `php artisan migrate --force` روی ERP مقصد `WEBINO_BASE_URL` — **معوق به محیط**: در این ماشین استک ERP بالا نبود؛ ERP handlers وقتی جدول نباشد graceful (`domain_numbers_ready`) هستند. دستور: `docker compose exec backend php artisan migrate --force`

## ۱۱.۳ سایر سینک‌ها

- [x] لایسنس: ERP `active|expired|demo|invalid` (+ `valid` bool)؛ Dashboard دیگر فقط «کلید خالی نیست» را active فرض نمی‌کند
- [x] بازارچهٔ ماژول: ERP `/api/webinocrm/v1/marketplace/{catalog,purchase,payment-callback}` + Dashboard client/UI
- [x] تیکت‌ها: `assignee_id` / `erp_ticket_id` / convert-task / sync-erp / rating ↔ ERP `projects/tickets` (نیاز به `WEBINO_ERP_API_TOKEN`)
- [x] یادداشت‌های CRM: ERP `crm/accounts/{id}/notes` + Dashboard `customers/{id}/notes` (+ sync اختیاری)
- [x] حسابداری: `GET /api/v1/accounting/ledger` ترجیح ERP live؛ fallback محلی با `erp_unavailable`
- [x] رویدادهای اعلان: `ORDER_EVENTS` شامل `return-requested|approved|rejected|received|refunded`

---



# فاز ۱۲ — پاک‌سازی، i18n، تست

> **Phase 12 (main):** به‌زودی → unavailable؛ i18n sweep فهرست تأییدشده؛ حذف stubهای مرده؛ آکادمی admin واقعی؛ callback بازارچه `modules/payment-callback`؛ `check:english` + `check:guards` در `validate.sh`.




## ۱۲.۱ حذف «به‌زودی»

- [x] `frontend/messages/fa.json` — `orders_admin.coming_soon` → «در دسترس نیست» (به‌زودی حذف شد)
- [x] `modules.skeleton_coming_soon` / `skeleton_unavailable` — پیام صادقانهٔ «در دسترس نیست»
- [x] `store.coming_soon` → «در دسترس نیست»
- [x] `bots.settings.paritySoon` — از قبل حذف شده بود
- [x] `accounting_portal.placeholder_section` — پیام صادقانهٔ ERP محلی (فاز ۱۰)
- [x] `ModuleSkeletonPage` — پیام «در دسترس نیست»؛ loader دیگر به آن fallback نمی‌کند (صفحات واقعی ماژول)



## ۱۲.۲ رشته‌های انگلیسی hardcode (فهرست تأییدشده)

> فهرست زیرین تاریخی است؛ با اسکن ۱۴۰۵/۰۷ همه به i18n منتقل شده‌اند (به‌همراه `check:english`).


| فایل                                                              | رشته                                                                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `frontend/src/components/ListFiltersCollapsible.tsx`              | `"Filters"`, `"Hide"`, `"Show"`                                                                                  |
| `frontend/src/views/CustomersPage.tsx`                            | `label="Filters"`, `"New"`, `"Cancel"`, `"Search name or email"`, `"Active"`, `"Sheba"`, `"Password (optional)"` |
| `frontend/src/views/StaffPage.tsx`                                | `"Admins"` و مشابه                                                                                               |
| `frontend/src/views/RbacPage.tsx`                                 | `"Assign role"`, `"Role updated"`, `"User ID"`                                                                   |
| `frontend/modules/bots/admin/bot-settings-shared.tsx`             | `"Hello from WebinoDashboard"`                                                                                   |
| `frontend/modules/commerce/admin/orders-page-client.tsx`          | `"Trash"`                                                                                                        |
| `frontend/modules/commerce/admin/order-detail-page-client.tsx`    | `"Tracking"`, `"Attribution"`, `"Subtotal"`, `"Discount"`, `"Shipping"`, `POS`                                   |
| `frontend/modules/commerce/admin/product-catalog-page-client.tsx` | `"SKU / name"`                                                                                                   |
| `frontend/src/app/not-found.tsx`                                  | `"404"`                                                                                                          |
| `frontend/src/components/LocaleThemeToolbar.tsx`                  | `aria-label` های `accent`/`light`/`dark`                                                                         |
| `AnalyticsSettingsPanel.tsx`                                      | placeholder `"admin, staff"`                                                                                     |
| `ai-panels.tsx`                                                   | وضعیت‌های job، `"1,2,3"`, `"attr ids"`                                                                           |
| `shop-reports-panels.tsx`                                         | `Name`, `SKU`, `Low stock`, `all`                                                                                |
| حسابداری                                                          | `"Cash"`, `"Equity"`                                                                                             |


- [x] فهرست تأییدشدهٔ ۱۲.۲ به `messages/fa.json` و `en.json` منتقل شد (با اسکن مجدد)
- [x] اسکریپت CI: `npm run check:english` (+ داخل `check:guards` / `validate.sh`)



## ۱۲.۳ کد مرده

- [x] `frontend/src/views/UsersPage.tsx` حذف شد (مرده؛ مسیر واقعی `users-page-client`)
- [x] `CommerceReportsPage` حذف؛ `reports-page` مستقیم به `/dashboard/reports/sales`
- [x] stubهای Magazine/Blog/Academy حذف؛ آکادمی به `AdminResourcePage` + API واقعی وصل شد
- [x] `DashboardPrefetch` در `DashboardLayoutPage` وصل است
- [x] چهار صفحهٔ پیامک در `marketing/manifest.ts` ثبت شده‌اند



## ۱۲.۴ تست و CI

- [x] تست Feature موجود: `DashboardOverviewBuilderTest`, `OrderReportsTest`, `AnalyticsAndShopReportsTest`
- [x] تست مجوز: `RoleCapabilityGateTest` / `AuthGateTest`
- [x] smoke: `scripts/check-dashboard-links.mjs`
- [x] بررسی کلید تکراری: `scripts/check-i18n-duplicates.mjs`
- [x] بررسی رشتهٔ انگلیسی: `scripts/check-english-jsx.mjs`
- [x] `scripts/ci.sh` شامل `npx tsc --noEmit` و `php artisan test` (+ `validate.sh` → `check:guards`)

---



# چیزهایی که TARGET بهتر دارد (نگه داشته شوند)

1. تب وضعیت با شمارنده در فهرست محصولات
2. ویرایش سریع (quick edit) در فهرست محصولات
3. تب دانلودها و تب بازارچه در ادیتور محصول
4. `PricingSettingsPanel` یکپارچه
5. کاتالوگ تم‌ها و برندینگ (`ThemeController`)
6. نماد SVG تومان/ریال و `currencies.ts`
7. تب‌های جدای فروشگاه: downloads / reviews / maps / loyalty / archive
8. کشیدن و رها کردن چندفایلی در کتابخانهٔ رسانه
9. `SmsServiceBanner` برای پاک‌سازی خطاهای SQL و نام فروشنده
10. آمار publish/draft در فهرست کوپن‌ها
11. `PageShell` با `actions`
12. مدل چندمستاجری و پول minor در Laravel
13. دوعاملی TOTP با کدهای بازیابی برای ادمین

---



# خلاصهٔ مدیریتی


| فاز                 | تعداد تقریبی آیتم | ریسک          | وابستگی            |
| ------------------- | ----------------- | ------------- | ------------------ |
| ۰ باگ‌های بحرانی    | ۸                 | بالا (امنیتی) | —                  |
| ۱ زیرساخت UI        | ۱۶                | متوسط         | —                  |
| ۲ پوسته/ناوبری/auth | ۴۵+               | بالا          | ۱                  |
| ۳ پیشخوان           | ۳۵+               | متوسط         | ۱، ۲.۵، ۴.۱        |
| ۴ سفارش‌ها          | ۵۵+               | بالا          | ۱، ۴.۱ اول         |
| ۵ محصولات           | ۶۰+               | بالا          | ۱                  |
| ۶ کاربران/پرتال     | ۵۰+               | بالا          | ۲.۵                |
| ۷ بازاریابی         | ۵۰+               | بالا          | ۱۱ برای پیامک      |
| ۸ محتوا/رسانه       | ۴۰+               | متوسط         | ۸.۱ اول            |
| ۹ گزارش‌ها          | ۲۵+               | متوسط         | ۱، ۴.۱             |
| ۱۰ تنظیمات/ماژول    | ۴۰+               | متوسط         | ۱۱                 |
| ۱۱ ERP              | ۱۵                | بالا          | هماهنگی با تیم ERP |
| ۱۲ پاک‌سازی         | ۲۵+               | پایین         | همه                |


**سه گلوگاه اصلی که بقیه به آن‌ها وابسته‌اند:**

1. **فاز ۴.۱ (وضعیت‌های حمل سفارش)** — پیشخوان، گزارش‌ها، اعلان‌ها و تاپین همه منتظرش هستند
2. **فاز ۲.۵ (نقش و قابلیت)** — گیتینگ منو، APIها و بخش‌های پیشخوان به آن وابسته‌اند
3. **فاز ۱ (زیرساخت UI)** — بدون `MoneyDisplay`، `MobileListCard` و ترجمهٔ enum، هر صفحه‌ای که بسازیم دوباره ناقص می‌شود

